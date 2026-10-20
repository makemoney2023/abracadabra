import type { Sql } from "@/db/sql";
import { dispatchTask } from "@/lib/agent-dispatch";
import { legacyStartsAllowed } from "@/lib/agent-mode";
import { moveTaskStage, type MoveTaskInput, type MoveTaskResult } from "@/lib/task-stage";
import { columnOf } from "@/lib/board-model";
import { nextColumnPosition } from "@/lib/task-position";

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
};

export type ReviewResult = MoveTaskResult | { ok: false; error: "not_in_review" | "note_required" };

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
  const who = input.actor.kind === "system" ? "Client Services" : "Admin override";
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
      input.actor.kind === "system" ? "client_services.task_review" : "staff.task_review",
      input.actor.kind,
      input.actor.id,
      `${what}: "${task.title}".${note ? ` ${note}` : ""}`.slice(0, 2000),
      JSON.stringify({ taskId: task.id, decision, note, stage: task.stage }),
      input.now,
    ],
  );
}

/**
 * Staff decision on a card in Review.
 * approve: to done (same as a done move, so filing and the feed see it).
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

  if (input.decision === "approve") {
    const moved = await moveTaskStage(sql, { ...input, to: "done" });
    if (!moved.ok) return moved;
    await sql.run("UPDATE tasks SET review_note = NULL WHERE id = ?", [task.id]);
    await logReview(sql, task, "approve", note, input);
    return moved;
  }

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
  filed_work: { id: string; agent_id: string; kind: string; title: string; paths: string[]; links: unknown[]; filed_at: string | null }[];
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
       WHERE organization_id = ? AND kind IN ('staff.task_stage', 'agent.task_stage', 'client_services.task_stage')
         AND json_extract(data_json, '$.taskId') = ? AND json_extract(data_json, '$.stage') = 'review'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      [row.organization_id, row.id],
    );
    const agents = await sql.all<{ agent_id: string; role: string }>(
      `SELECT a.agent_id, a.role FROM agent_assignments a JOIN client_agents c ON c.id = a.agent_id
       WHERE a.organization_id = ? AND a.ended_at IS NULL AND c.revoked_at IS NULL ORDER BY a.role, a.assigned_at`,
      [row.organization_id],
    );
    const work = await sql.all<{ id: string; agent_id: string; kind: string; title: string; paths_json: string | null; links_json: string; filed_at: number | null }>(
      `SELECT id, agent_id, kind, title, paths_json, links_json, filed_at FROM agent_work_items
       WHERE task_id = ? AND state = 'filed' ORDER BY filed_at DESC LIMIT 20`,
      [row.id],
    );
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
      })),
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
