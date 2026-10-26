import type { Sql } from "@/db/sql";
import { dispatchTask } from "@/lib/agent-dispatch";
import { legacyStartsAllowed } from "@/lib/agent-mode";
import { moveTaskStage, type MoveTaskInput, type MoveTaskResult } from "@/lib/task-stage";
import { columnOf } from "@/lib/board-model";
import { nextColumnPosition } from "@/lib/task-position";
import { releaseHeldWork, type ReleaseResult } from "@/lib/agent-filing-review";
import type { AgentPrincipal } from "@/lib/agent-work-filing";
import { canApproveReviews } from "@/lib/review-approvers";

type ReviewRow = {
  id: string;
  organization_id: string | null;
  project_id: string | null;
  title: string;
  stage: string;
  status: string;
  deliverable_id: string | null;
  review_requested_at: number | null;
};

export type ReviewDecision = "approve" | "progress" | "build";

export type ReviewInput = Omit<MoveTaskInput, "to" | "direction" | "position" | "blockedReason" | "note"> & {
  decision: ReviewDecision;
  /** Required to send back; optional on approve. */
  note?: string;
  /** Agent approvals only (agentApproveReview): the agent's label for the timeline. */
  agentLabel?: string;
};

export type ReviewResult =
  | (MoveTaskResult & { release?: ReleaseResult })
  | { ok: false; error: "not_in_review" | "note_required" };

/** An agent approval adds two refusals: not permitted on that client, or its own work. */
export type AgentReviewResult = ReviewResult | { ok: false; error: "not_permitted" | "own_work" };

/** Activity kind of an approval by a permitted agent (src/lib/review-approvers.ts), actor_kind agent, actor_id its id. */
export const AGENT_REVIEW_KIND = "client_agent.task_review";

/** Every activity kind that records a review decision (Client Services, staff override, permitted agent). */
export const REVIEW_DECISION_KINDS = ["client_services.task_review", "staff.task_review", AGENT_REVIEW_KIND] as const;

async function loadReview(sql: Sql, taskId: string): Promise<ReviewRow | undefined> {
  return sql.get<ReviewRow>(
    `SELECT id, organization_id, project_id, title, stage, status, deliverable_id, review_requested_at
     FROM tasks WHERE id = ?`,
    [taskId],
  );
}

async function logReview(
  sql: Sql,
  task: ReviewRow,
  decision: ReviewDecision,
  note: string | null,
  input: ReviewInput,
): Promise<void> {
  if (!task.organization_id || !input.actor.id) return;
  const agentLabel = input.actor.kind === "agent" ? (input.agentLabel ?? input.actor.id) : null;
  const who = input.actor.kind === "system" ? "Client Services" : agentLabel ? `${agentLabel} (agent ${input.actor.id})` : "Admin override";
  const what = `${who}: ${
    decision === "approve" ? "review approved" : decision === "build" ? "sent back to build" : "sent back to in progress"
  }`;
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      task.organization_id,
      task.project_id,
      input.actor.kind === "system" ? "client_services.task_review" : input.actor.kind === "agent" ? AGENT_REVIEW_KIND : "staff.task_review",
      input.actor.kind,
      input.actor.id,
      `${what}: "${task.title}".${note ? ` ${note}` : ""}`.slice(0, 2000),
      JSON.stringify({ taskId: task.id, decision, note, stage: task.stage, ...(input.actor.kind === "agent" ? { agent_id: input.actor.id } : {}) }),
      input.now,
    ],
  );
}

/** Approve: to done, then release the card's held filings. Callers check who may approve and that it is in Review. */
async function approveInReview(sql: Sql, task: ReviewRow, input: ReviewInput, note: string | null): Promise<ReviewResult> {
  const moved = await moveTaskStage(sql, { ...input, to: "done" });
  if (!moved.ok) return moved;
  await sql.run("UPDATE tasks SET review_note = NULL WHERE id = ?", [task.id]);
  await logReview(sql, task, "approve", note, input);
  // Held agent filings on this card go to the client now; send back (below) keeps them held.
  const releaseActor = input.actor.kind === "staff" ? "staff" : input.actor.kind === "agent" ? "agent" : "system";
  const release = await releaseHeldWork(sql, { taskId: task.id, now: input.now, actor: { kind: releaseActor, id: input.actor.id } });
  return release.released.length ? { ...moved, release } : moved;
}

/**
 * A permitted agent (src/lib/review-approvers.ts) approves one card from Waiting on Client Services to Done with its
 * own token. Approve only: there is no agent send back. Refused (nothing written) when the agent is not permitted on the
 * card's client (not_permitted), the card is not in Review (not_in_review), or it is the agent's own work: the card's
 * assignee, the one who asked for the review, or the author of work filed on it (own_work). Logged as
 * client_agent.task_review with actor_kind agent and actor_id the agent, which the Client Services feed carries.
 */
export async function agentApproveReview(
  sql: Sql,
  agent: AgentPrincipal,
  input: { taskId: string; note?: string; now: number },
): Promise<AgentReviewResult> {
  const task = await loadReview(sql, input.taskId);
  if (!task) return { ok: false, error: "missing" };
  if (!canApproveReviews(agent, task.organization_id)) return { ok: false, error: "not_permitted" };
  if (task.status === "done" || task.review_requested_at == null) return { ok: false, error: "not_in_review" };
  const owner = await sql.get<{ assignee_agent_id: string | null }>("SELECT assignee_agent_id FROM tasks WHERE id = ?", [task.id]);
  const filed = await sql.get<{ id: string }>(
    "SELECT id FROM agent_work_items WHERE task_id = ? AND agent_id = ? AND state = 'filed' AND retracted_at IS NULL LIMIT 1",
    [task.id, agent.agentId],
  );
  const asked = await sql.get<{ actor_id: string | null }>(
    `SELECT actor_id FROM activities
     WHERE organization_id = ? AND kind = 'agent.task_stage' AND json_extract(data_json, '$.taskId') = ? AND json_extract(data_json, '$.stage') = 'review'
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    [task.organization_id, task.id],
  );
  if (owner?.assignee_agent_id === agent.agentId || filed || asked?.actor_id === agent.agentId) return { ok: false, error: "own_work" };
  const note = input.note?.trim().slice(0, 2000) || null;
  return approveInReview(
    sql,
    task,
    { taskId: task.id, decision: "approve", note: note ?? undefined, now: input.now, actor: { kind: "agent", id: agent.agentId }, agentLabel: agent.label },
    note,
  );
}

/**
 * Staff decision on a card in Review.
 * approve: to done (same as a done move, so filing and the feed see it), then the card's held agent filings are
 *   released to the client, the deliverable version is published, and the client notice is posted (draft by default).
 * progress: back to its own stage as in progress. Starts nothing; with AGENT_MODE=agents the lead agent gets a
 *   "changes" handoff with the note.
 * build: a normal move to build with the note as the instruction, so legacy starts a Cursor run (as a build move
 *   always does) and agents mode hands it to the lead agent.
 */
export async function decideReview(sql: Sql, input: ReviewInput): Promise<ReviewResult> {
  const task = await loadReview(sql, input.taskId);
  if (!task) return { ok: false, error: "missing" };
  // Client Services (system) decides reviews; staff only as an admin override. An agent never approves its own work.
  if (input.actor.kind === "agent") return { ok: false, error: "invalid" };
  if (task.status === "done" || task.review_requested_at == null) return { ok: false, error: "not_in_review" };
  const note = input.note?.trim().slice(0, 2000) || null;
  if (input.decision !== "approve" && !note) return { ok: false, error: "note_required" };

  if (input.decision === "approve") return approveInReview(sql, task, input, note);

  if (input.decision === "build") {
    const moved = await moveTaskStage(sql, { ...input, to: "build", instruction: note ?? undefined });
    if (!moved.ok) return moved;
    await sql.run("UPDATE tasks SET review_note = ? WHERE id = ?", [note, task.id]);
    await logReview(sql, task, "build", note, input);
    return moved;
  }

  const stage = task.stage === "engineer" || task.stage === "build" || task.stage === "run" ? task.stage : "describe";
  const position = await nextColumnPosition(sql, {
    organizationId: task.organization_id,
    projectId: task.project_id,
    column: stage,
  });
  await sql.run(
    `UPDATE tasks
     SET stage = ?, status = 'doing', review_requested_at = NULL, review_note = ?, blocked_reason = NULL,
         done_at = NULL, position = ?, updated_at = ?
     WHERE id = ?`,
    [stage, note, position, input.now, task.id],
  );
  await logReview(sql, task, "progress", note, input);
  let handedTo: string | null | undefined;
  if (!legacyStartsAllowed() && task.organization_id) {
    const sent = await dispatchTask(sql, {
      organizationId: task.organization_id,
      projectId: task.project_id,
      taskId: task.id,
      title: task.title,
      reason: "changes",
      deliverableId: task.deliverable_id,
      note,
      actor: input.actor,
      now: input.now,
    });
    handedTo = sent.agentId;
  }
  return {
    ok: true,
    taskId: task.id,
    column: columnOf({ status: "doing", stage }),
    stage,
    status: "doing",
    ...(handedTo !== undefined ? { handedTo } : {}),
  };
}

export type OpenReview = {
  task_id: string;
  title: string;
  organization: { id: string; name: string };
  project: { id: string; name: string } | null;
  stage: string;
  status: string;
  blocked_reason: string | null;
  requested_at: string;
  note: string | null;
  /** Who moved it to Review, from the timeline. */
  requested_by: { kind: string; id: string | null } | null;
  agents: { agent_id: string; role: string }[];
  filed_work: {
    id: string; agent_id: string; kind: string; title: string; paths: string[]; links: unknown[]; filed_at: string | null;
    /** held: waiting on this review; released: the client sees it; superseded / withdrawn: retired; published: filed before the hold. */
    visibility: "held" | "released" | "superseded" | "withdrawn" | "published";
    deliverable_id: string | null; deliverable_version: number | null; superseded_by: string | null; work_request_id: string | null;
  }[];
  deliverable: { id: string; title: string; version: number; published_version: number | null } | null;
  work_request: { id: string; subject: string; client_email: string | null; source_thread_id: string | null; source_message_id: string } | null;
};

/** Open Review cards for Client Services, oldest ask first. organizationId narrows to one client. */
export async function listOpenReviews(sql: Sql, input: { organizationId?: string | null; limit?: number } = {}): Promise<OpenReview[]> {
  const rows = await sql.all<{
    id: string; title: string; organization_id: string; organization_name: string; project_id: string | null; project_name: string | null;
    stage: string; status: string; blocked_reason: string | null; review_requested_at: number; review_note: string | null;
  }>(
    `SELECT t.id, t.title, t.organization_id, o.name AS organization_name, t.project_id, p.name AS project_name,
            t.stage, t.status, t.blocked_reason, t.review_requested_at, t.review_note
     FROM tasks t JOIN organizations o ON o.id = t.organization_id LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.status != 'done' AND t.review_requested_at IS NOT NULL AND o.archived_at IS NULL
       AND (? IS NULL OR t.organization_id = ?)
     ORDER BY t.review_requested_at, t.id LIMIT ?`,
    [input.organizationId ?? null, input.organizationId ?? null, Math.min(Math.max(input.limit ?? 100, 1), 200)],
  );
  const out: OpenReview[] = [];
  for (const row of rows) {
    const asked = await sql.get<{ actor_kind: string; actor_id: string | null }>(
      `SELECT actor_kind, actor_id FROM activities
       WHERE organization_id = ? AND kind IN ('staff.task_stage', 'agent.task_stage', 'client_services.task_stage', 'github.task_stage')
         AND json_extract(data_json, '$.taskId') = ? AND json_extract(data_json, '$.stage') = 'review'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      [row.organization_id, row.id],
    );
    const agents = await sql.all<{ agent_id: string; role: string }>(
      `SELECT a.agent_id, a.role FROM agent_assignments a JOIN client_agents c ON c.id = a.agent_id
       WHERE a.organization_id = ? AND a.ended_at IS NULL AND c.revoked_at IS NULL ORDER BY a.role, a.assigned_at`,
      [row.organization_id],
    );
    const work = await sql.all<{
      id: string; agent_id: string; kind: string; title: string; paths_json: string | null; links_json: string; filed_at: number | null;
      held_at: number | null; released_at: number | null; retracted_at: number | null; superseded_by: string | null; deliverable_id: string | null;
      deliverable_version: number | null; work_request_id: string | null;
    }>(
      `SELECT i.id, i.agent_id, i.kind, i.title, i.paths_json, i.links_json, i.filed_at, b.held_at, i.released_at, i.retracted_at, i.superseded_by,
              i.deliverable_id, i.deliverable_version, i.work_request_id
       FROM agent_work_items i LEFT JOIN batches b ON b.id = i.batch_id
       WHERE i.task_id = ? AND i.state = 'filed' ORDER BY i.filed_at DESC LIMIT 20`,
      [row.id],
    );
    const cardRow = await sql.get<{ deliverable_id: string | null; work_request_id: string | null }>("SELECT deliverable_id, work_request_id FROM tasks WHERE id = ?", [row.id]);
    const deliverable = cardRow?.deliverable_id
      ? await sql.get<{ id: string; title: string; version: number; published_version: number | null }>(
          "SELECT id, title, version, published_version FROM deliverables WHERE id = ?",
          [cardRow.deliverable_id],
        )
      : undefined;
    const requestId = cardRow?.work_request_id ?? work.find((item) => item.work_request_id)?.work_request_id ?? null;
    const request = requestId
      ? await sql.get<{ id: string; subject: string; client_email: string | null; source_thread_id: string | null; source_message_id: string }>(
          "SELECT id, subject, client_email, source_thread_id, source_message_id FROM client_work_requests WHERE id = ?",
          [requestId],
        )
      : undefined;
    const parse = (raw: string | null): unknown[] => {
      try {
        const value = raw ? JSON.parse(raw) : [];
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    };
    out.push({
      task_id: row.id,
      title: row.title,
      organization: { id: row.organization_id, name: row.organization_name },
      project: row.project_id ? { id: row.project_id, name: row.project_name ?? row.project_id } : null,
      stage: row.stage,
      status: row.status,
      blocked_reason: row.blocked_reason,
      requested_at: new Date(row.review_requested_at).toISOString(),
      note: row.review_note,
      requested_by: asked ? { kind: asked.actor_kind, id: asked.actor_id } : null,
      agents,
      filed_work: work.map((item) => ({
        id: item.id,
        agent_id: item.agent_id,
        kind: item.kind,
        title: item.title,
        paths: parse(item.paths_json).filter((path): path is string => typeof path === "string"),
        links: parse(item.links_json),
        filed_at: item.filed_at == null ? null : new Date(item.filed_at).toISOString(),
        visibility: item.retracted_at != null
          ? "withdrawn" as const
          : item.superseded_by
            ? "superseded" as const
            : item.released_at != null
              ? "released" as const
              : item.held_at != null
                ? "held" as const
                : "published" as const,
        deliverable_id: item.deliverable_id,
        deliverable_version: item.deliverable_version,
        superseded_by: item.superseded_by,
        work_request_id: item.work_request_id,
      })),
      deliverable: deliverable ?? null,
      work_request: request ?? null,
    });
  }
  return out;
}

/** Client Services decision. action approve: to Done. send_back: note required; to in progress, or build with to: "build". */
export async function clientServicesReview(
  sql: Sql,
  input: { taskId: string; action: unknown; note?: unknown; to?: unknown; now: number; build?: MoveTaskInput["build"] },
): Promise<ReviewResult> {
  const note = typeof input.note === "string" ? input.note : undefined;
  let decision: ReviewDecision;
  if (input.action === "approve") decision = "approve";
  else if (input.action === "send_back") decision = input.to === "build" ? "build" : "progress";
  else return { ok: false, error: "invalid" };
  return decideReview(sql, { taskId: input.taskId, decision, note, now: input.now, actor: { kind: "system", id: "client-services" }, build: input.build });
}
