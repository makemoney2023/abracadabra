import type { Sql } from "@/db/sql";
import { logAgentSkillEvents } from "@/lib/skill-usage";
import { dispatchTask, liveClientAgent } from "@/lib/agent-dispatch";
import { agentMode } from "@/lib/agent-mode";
import { resolveClientRef, type AgentPrincipal } from "@/lib/agent-work-filing";
import { nextColumnPosition } from "@/lib/task-position";
import { resolveFilingRequest } from "@/lib/agent-filing-review";
import { moveTaskStage, type MoveTaskResult } from "@/lib/task-stage";
import { recordCardFailure } from "@/lib/card-automove";
import { BOARD_COLUMN_LABEL, columnOf as boardColumnOf, toColumn, type BoardColumn } from "@/lib/board-model";
import type { SkillBucket } from "@/lib/skill-library";
import { attachCardSkills, cardSkillPacks, checkPrefixes, detachCardSkills, loadCatalog } from "@/lib/skill-packs";
import { briefData, cardBriefs, EMPTY_BRIEF, parseBrief, type BriefInput, type CardBrief } from "@/lib/card-brief";
import { agentApproveReview } from "@/lib/task-review";

/**
 * Client agents update the project board for clients they are assigned to now: set a task in progress, block it with
 * a reason, ask for review, move it between columns, add a note, attach or detach skill packs from the library, or
 * create a task in the client's project. Leads also assign cards to an agent on the client (assign). No deletes.
 * Every change is a client_agent.board activity, which the Client Services updates feed carries.
 */

const OPEN_PROJECT = "status IN ('planned', 'active', 'waiting_on_client')";

export type BoardTask = {
  id: string;
  title: string;
  organization_id: string;
  project_id: string | null;
  stage: string;
  status: string;
  column: string;
  blocked_reason: string | null;
  deliverable_id: string | null;
  /** In Review: when it was asked for (ISO), else null. */
  review_requested_at: string | null;
  /** The note from the review ask, or the staff note from the last send back. */
  review_note: string | null;
  /** Skill pack prefixes attached to this card (task_skill_packs), oldest first. */
  skill_packs: string[];
  /** The agent that owns the card (lead or hire). null: the client's lead agent. */
  assignee_agent_id: string | null;
  updated_at: string;
} & CardBrief;

export type BoardError = { ok: false; status: 400 | 403 | 404 | 409 | 503; message: string };

type TaskDbRow = {
  id: string; title: string; organization_id: string; project_id: string | null; stage: string; status: string;
  blocked_reason: string | null; deliverable_id: string | null; review_requested_at: number | null; review_note: string | null;
  assignee_agent_id: string | null; updated_at: number;
};

const TASK_FIELDS =
  "id, title, organization_id, project_id, stage, status, blocked_reason, deliverable_id, review_requested_at, review_note, assignee_agent_id, updated_at";

function toBoardTask(row: TaskDbRow, skillPacks: string[] = [], brief: CardBrief = EMPTY_BRIEF): BoardTask {
  return {
    ...row,
    ...brief,
    skill_packs: skillPacks,
    column: boardColumnOf(row),
    review_requested_at: row.review_requested_at == null || row.status === "done" ? null : new Date(row.review_requested_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function assigned(agent: AgentPrincipal, organizationId: string | null): boolean {
  return Boolean(organizationId) && agent.assignments.some((row) => row.organizationId === organizationId);
}

/** True when this agent is the lead on that client (agent_assignments.role). */
export function isLeadOn(agent: AgentPrincipal, organizationId: string | null): boolean {
  return Boolean(organizationId) && agent.assignments.some((row) => row.organizationId === organizationId && row.role === "lead");
}

async function spaceFor(sql: Sql, projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const row = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE project_id = ? AND status = 'active' LIMIT 1", [projectId]);
  return row?.id ?? null;
}

async function record(
  sql: Sql,
  agent: AgentPrincipal,
  task: { id: string; title: string; organization_id: string; project_id: string | null },
  action: string,
  body: string,
  extra: Record<string, unknown>,
  now: number,
  /** The body reads as a sentence after the label ("acme bot attached …"), with no colon. */
  sentence = false,
): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, ?, 'client_agent.board', 'agent', ?, ?, ?, ?)`,
    [
      id,
      task.organization_id,
      task.project_id,
      await spaceFor(sql, task.project_id),
      agent.agentId,
      `${agent.label}${sentence ? " " : ": "}${body}`.slice(0, 2000),
      JSON.stringify({ action, task_id: task.id, task_title: task.title, agent_id: agent.agentId, ...extra }),
      now,
    ],
  );
  return id;
}

/**
 * Tasks on the boards of this agent's clients. ?client= (id, domain, or space slug) and ?project_id= narrow it.
 * mine: only the cards whose agent assignee is this agent.
 */
export async function listAgentBoard(
  sql: Sql,
  agent: AgentPrincipal,
  query: { client?: unknown; projectId?: string | null; mine?: boolean },
): Promise<{ ok: true; tasks: BoardTask[] } | BoardError> {
  let orgs = agent.assignments.map((row) => row.organizationId);
  if (query.client) {
    const client = await resolveClientRef(sql, query.client);
    if (!client.ok || !orgs.includes(client.organizationId)) return { ok: false, status: 403, message: "This agent is not assigned to that client." };
    orgs = [client.organizationId];
  }
  if (orgs.length === 0) return { ok: true, tasks: [] };
  const marks = orgs.map(() => "?").join(", ");
  const rows = await sql.all<TaskDbRow>(
    `SELECT ${TASK_FIELDS} FROM tasks
     WHERE organization_id IN (${marks}) AND (? IS NULL OR project_id = ?) AND (? IS NULL OR assignee_agent_id = ?)
     ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, updated_at DESC LIMIT 200`,
    [...orgs, query.projectId ?? null, query.projectId ?? null, query.mine ? agent.agentId : null, query.mine ? agent.agentId : null],
  );
  const packs = new Map<string, string[]>();
  if (rows.length) {
    const ids = rows.map((row) => row.id);
    const attached = await sql.all<{ task_id: string; prefix: string }>(
      `SELECT task_id, prefix FROM task_skill_packs WHERE detached_at IS NULL AND task_id IN (${ids.map(() => "?").join(", ")})
       ORDER BY attached_at, rowid`,
      ids,
    );
    for (const row of attached) packs.set(row.task_id, [...(packs.get(row.task_id) ?? []), row.prefix]);
  }
  const briefs = await cardBriefs(sql, { organizationIds: orgs, taskIds: rows.map((row) => row.id) });
  return {
    ok: true,
    tasks: rows.map((row) => toBoardTask(row, packs.get(row.id) ?? [], briefs.get(row.id))),
  };
}

export type BoardAction =
  | { action: "start" }
  | { action: "pause" }
  | { action: "block"; reason: string }
  | { action: "review"; note?: string }
  /** to is todo, doing, review, or done. The old stage names (describe, engineer, build, run) are aliases. */
  | { action: "move"; to: BoardColumn; asked?: string }
  | { action: "note"; body: string }
  /** Skill pack prefixes from GET /api/agent-skill-library, e.g. "community/marketingskills/" or one ".../SKILL.md". */
  | { action: "attach_skills" | "detach_skills"; prefixes: string[] }
  /** Lead only. to: an agent id on the card's client, or null for the lead (default). */
  | { action: "assign"; to: string | null }
  /** Waiting on Client Services to Done. Only agents listed in src/lib/review-approvers.ts, on their listed clients. */
  | { action: "approve"; note?: string }
  /** Set the card's description, requirements and acceptance criteria. Fields not sent keep their value. */
  | { action: "describe"; brief: BriefInput };

export function parseBoardAction(raw: unknown): BoardAction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const str = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  switch (body.action) {
    case "start":
    case "pause":
      return { action: body.action };
    case "block": {
      const reason = str(body.reason, 1000);
      return reason ? { action: "block", reason } : null;
    }
    case "review":
      return { action: "review", note: str(body.note, 4000) ?? undefined };
    case "move": {
      const asked = str(body.to, 20)?.toLowerCase();
      const to = toColumn(asked);
      if (!asked || !to) return null;
      return asked === to ? { action: "move", to } : { action: "move", to, asked };
    }
    case "note": {
      const text = str(body.body, 4000);
      return text ? { action: "note", body: text } : null;
    }
    case "assign": {
      if (body.to === null) return { action: "assign", to: null };
      const to = str(body.to, 64)?.toLowerCase();
      if (!to) return null;
      return { action: "assign", to: to === "lead" ? null : to };
    }
    case "approve":
      return { action: "approve", note: str(body.note, 2000) ?? undefined };
    case "describe": {
      const parsed = parseBrief(body);
      return parsed.ok && parsed.brief ? { action: "describe", brief: parsed.brief } : null;
    }
    case "attach_skills":
    case "detach_skills": {
      if (!Array.isArray(body.prefixes)) return null;
      const prefixes = body.prefixes.map((value) => (typeof value === "string" ? value.trim() : "")).slice(0, 50);
      return prefixes.length ? { action: body.action, prefixes } : null;
    }
    default:
      return null;
  }
}

type UpdateResult = { ok: true; task: BoardTask; activityId: string | null; handedTo?: string | null } | BoardError;

/**
 * One board change on one task. The task must belong to a client this agent is assigned to now.
 * A refused change keeps its error for the caller and is also written on the card's timeline (client_agent.board_refused)
 * when the card belongs to one of this agent's clients, so Client Services and staff see what did not happen.
 */
export async function updateAgentTask(
  sql: Sql,
  agent: AgentPrincipal,
  input: { taskId: string; change: BoardAction; now: number; bucket?: SkillBucket },
): Promise<UpdateResult> {
  const result = await applyAgentTaskChange(sql, agent, input);
  if (!result.ok) {
    const action = input.change.action;
    const to = input.change.action === "move" ? input.change.to : null;
    await recordCardFailure(sql, {
      taskId: input.taskId,
      agent,
      kind: "client_agent.board_refused",
      body: `${action}${to ? ` to ${BOARD_COLUMN_LABEL[to]}` : ""} was refused (${result.status}): ${result.message}`,
      data: { action, ...(to ? { to } : {}), status: result.status, error: result.message },
      now: input.now,
    }).catch(() => null);
  }
  return result;
}

async function applyAgentTaskChange(
  sql: Sql,
  agent: AgentPrincipal,
  input: { taskId: string; change: BoardAction; now: number; bucket?: SkillBucket },
): Promise<UpdateResult> {
  const task = await sql.get<{
    id: string; title: string; organization_id: string | null; project_id: string | null; stage: string; status: string;
    review_requested_at: number | null;
  }>(
    "SELECT id, title, organization_id, project_id, stage, status, review_requested_at FROM tasks WHERE id = ?",
    [input.taskId],
  );
  const change = input.change;
  if (change.action === "attach_skills" || change.action === "detach_skills") {
    // Skill packs: a missing card is 404, a card of a client this agent is not on is 403, a done card is 409.
    if (!task || !task.organization_id) return { ok: false, status: 404, message: "No such task." };
    if (!assigned(agent, task.organization_id)) return { ok: false, status: 403, message: "This agent is not assigned to that task's client." };
    if (task.status === "done") return { ok: false, status: 409, message: "That task is done. Packs attach to open cards only." };
    return changeCardSkills(sql, agent, { ...task, organization_id: task.organization_id }, { ...change, action: change.action }, input);
  }
  if (!task || !task.organization_id || !assigned(agent, task.organization_id)) return { ok: false, status: 404, message: "No such task on your clients' boards." };
  if (change.action === "assign") {
    if (!isLeadOn(agent, task.organization_id)) return { ok: false, status: 403, message: "Only the client's lead agent assigns cards." };
    const done = await assignTaskAgent(sql, { taskId: task.id, to: change.to, actor: { kind: "agent", id: agent.agentId, label: agent.label }, now: input.now });
    if (!done.ok) return done;
    return { ok: true, task: await freshTask(sql, task.id), activityId: done.activityId, ...(done.handedTo !== undefined ? { handedTo: done.handedTo } : {}) };
  }
  const row = { id: task.id, title: task.title, organization_id: task.organization_id, project_id: task.project_id };
  if (change.action === "approve") return approveAsAgent(sql, agent, row, change.note, input.now);
  if (change.action === "describe") {
    if (task.status === "done") return { ok: false, status: 409, message: "That task is done. Describe open cards only." };
    const owner = await sql.get<{ assignee_agent_id: string | null }>("SELECT assignee_agent_id FROM tasks WHERE id = ?", [task.id]);
    if (owner?.assignee_agent_id !== agent.agentId && !isLeadOn(agent, task.organization_id)) {
      return { ok: false, status: 403, message: "Only the card's owner or the client's lead agent describes it. Add a note instead." };
    }
    const current = (await cardBriefs(sql, { organizationIds: [task.organization_id], taskIds: [task.id] })).get(task.id) ?? EMPTY_BRIEF;
    const merged: BriefInput = {
      description: change.brief.description !== undefined && change.brief.description !== null ? change.brief.description : current.description,
      requirements: change.brief.requirements?.length ? change.brief.requirements : current.requirements,
      acceptanceCriteria: change.brief.acceptanceCriteria?.length ? change.brief.acceptanceCriteria : current.acceptance_criteria,
    };
    const activityId = await record(sql, agent, row, "describe", `Updated the description of "${task.title}".`, briefData(merged), input.now);
    await sql.run("UPDATE tasks SET updated_at = ? WHERE id = ?", [input.now, task.id]);
    return { ok: true, task: await freshTask(sql, task.id), activityId };
  }
  const actor = { kind: "agent" as const, id: agent.agentId };
  let activityId = "";
  let handedTo: string | null | undefined;

  // Review waits on Client Services. The agent can note or block it, but not take it out or finish it itself.
  const inReviewNow = boardColumnOf(task) === "review";
  if (inReviewNow && (change.action === "start" || change.action === "pause" || change.action === "move")) {
    return { ok: false, status: 403, message: "That task is waiting on Client Services review. Client Services approves it or sends it back." };
  }
  if (change.action === "note") {
    activityId = await record(sql, agent, row, "note", `Note on "${task.title}": ${change.body}`, { body: change.body }, input.now);
  } else if (change.action === "start" || change.action === "pause") {
    if (task.status === "done") return { ok: false, status: 400, message: "That task is done. Move it to a column first." };
    const status = change.action === "start" ? "doing" : "todo";
    // Start or pause also takes the card out of Review: the agent is working on it again.
    await sql.run(
      "UPDATE tasks SET status = ?, blocked_reason = NULL, review_requested_at = NULL, updated_at = ? WHERE id = ?",
      [status, input.now, task.id],
    );
    activityId = await record(sql, agent, row, change.action, `${change.action === "start" ? "Started" : "Paused"} "${task.title}".`, { status }, input.now);
  } else if (change.action === "block") {
    const moved = await moveTaskStage(sql, { taskId: task.id, blockedReason: change.reason, now: input.now, actor });
    if (!moved.ok) return { ok: false, status: 400, message: "That task could not be blocked." };
    activityId = await record(sql, agent, row, "block", `Blocked "${task.title}": ${change.reason}`, { reason: change.reason }, input.now);
  } else if (change.action === "review") {
    if (task.status === "done") return { ok: false, status: 400, message: "That task is already done." };
    // Waiting on Client Services: starts nothing in either AGENT_MODE.
    const moved = await moveTaskStage(sql, { taskId: task.id, to: "review", note: change.note, now: input.now, actor });
    if (!moved.ok) return { ok: false, status: 400, message: "That task could not go to review." };
    activityId = await record(sql, agent, row, "review", `"${task.title}" is ready for review.${change.note ? ` ${change.note}` : ""}`, { note: change.note ?? null }, input.now);
  } else if (change.action === "move") {
    if (change.to === "doing" && agentMode() !== "agents") {
      return { ok: false, status: 403, message: "Moving to Doing would start a swarm or Cursor run. Staff do that while AGENT_MODE is legacy." };
    }
    // Doing stores stage build; in agents mode that hands the task to the lead agent. Already in Doing: no change.
    const moved: MoveTaskResult = await moveTaskStage(sql, { taskId: task.id, to: change.to, now: input.now, actor });
    if (!moved.ok) return { ok: false, status: 400, message: `That move was refused (${moved.error}).` };
    handedTo = moved.handedTo;
    activityId = await record(
      sql,
      agent,
      row,
      "move",
      `Moved "${task.title}" to ${BOARD_COLUMN_LABEL[change.to]}.`,
      { to: change.to, ...(change.asked ? { asked: change.asked } : {}) },
      input.now,
    );
  }
  return {
    ok: true,
    task: await freshTask(sql, task.id),
    activityId,
    ...(handedTo !== undefined ? { handedTo } : {}),
  };
}

const DOING_STAGES = new Set(["engineer", "build", "run"]);

/**
 * Sets (or clears, to = null) a card's agent assignee. Used by the lead's assign action and the staff board.
 * The target must be live and assigned to the card's client, else 400. A card already in Doing (not waiting on
 * Client Services, not done) is handed to its new owner right away (AGENT_MODE=agents), so a hire sees it in
 * ?dispatches=1. Logged as client_agent.board action assign, which the Client Services feed carries.
 */
export async function assignTaskAgent(
  sql: Sql,
  input: { taskId: string; to: string | null; actor: { kind: "agent" | "staff"; id: string; label?: string }; now: number },
): Promise<{ ok: true; assignee: string | null; activityId: string | null; handedTo?: string | null } | BoardError> {
  const task = await sql.get<{
    id: string; title: string; organization_id: string | null; project_id: string | null; stage: string; status: string;
    review_requested_at: number | null; deliverable_id: string | null; assignee_agent_id: string | null;
  }>(
    `SELECT id, title, organization_id, project_id, stage, status, review_requested_at, deliverable_id, assignee_agent_id
     FROM tasks WHERE id = ?`,
    [input.taskId],
  );
  if (!task || !task.organization_id) return { ok: false, status: 404, message: "No such task." };
  let to: string | null = null;
  if (input.to) {
    const live = await liveClientAgent(sql, task.organization_id, input.to);
    if (!live) return { ok: false, status: 400, message: `${input.to} is not an agent assigned to this card's client.` };
    to = live.id;
  }
  if ((task.assignee_agent_id ?? null) === to) return { ok: true, assignee: to, activityId: null };
  await sql.run("UPDATE tasks SET assignee_agent_id = ?, updated_at = ? WHERE id = ?", [to, input.now, task.id]);
  const who = to ?? "the lead agent";
  const label = input.actor.label ?? input.actor.id;
  const activityId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, ?, 'client_agent.board', ?, ?, ?, ?, ?)`,
    [
      activityId,
      task.organization_id,
      task.project_id,
      await spaceFor(sql, task.project_id),
      input.actor.kind,
      input.actor.id,
      `${label}: Assigned "${task.title}" to ${who}.`.slice(0, 2000),
      JSON.stringify({ action: "assign", task_id: task.id, task_title: task.title, agent_id: input.actor.kind === "agent" ? input.actor.id : null, to, from: task.assignee_agent_id ?? null }),
      input.now,
    ],
  );
  let handedTo: string | null | undefined;
  const inDoing = DOING_STAGES.has(task.stage) && task.status !== "done" && task.review_requested_at == null;
  if (inDoing && agentMode() === "agents") {
    const sent = await dispatchTask(sql, {
      organizationId: task.organization_id,
      projectId: task.project_id,
      taskId: task.id,
      title: task.title,
      reason: task.stage === "run" ? "run" : "build",
      deliverableId: task.deliverable_id,
      note: `Reassigned to ${who}.`,
      actor: { kind: input.actor.kind, id: input.actor.id },
      now: input.now,
    });
    handedTo = sent.agentId;
  }
  return { ok: true, assignee: to, activityId, ...(handedTo !== undefined ? { handedTo } : {}) };
}

async function freshTask(sql: Sql, taskId: string): Promise<BoardTask> {
  const fresh = await sql.get<TaskDbRow>(`SELECT ${TASK_FIELDS} FROM tasks WHERE id = ?`, [taskId]);
  const briefs = await cardBriefs(sql, { organizationIds: [fresh!.organization_id], taskIds: [taskId] });
  return toBoardTask(fresh!, await cardSkillPacks(sql, taskId), briefs.get(taskId));
}

const APPROVE_ERRORS: Record<string, { status: 403 | 404 | 409 | 400; message: string }> = {
  missing: { status: 404, message: "No such task." },
  not_permitted: { status: 403, message: "This agent can't approve cards on this client. Client Services approves them." },
  not_in_review: { status: 409, message: "That task is not waiting on Client Services review." },
  own_work: { status: 403, message: "An agent never approves its own work: this card is assigned to you, you asked for its review, or you filed work on it. Client Services approves it." },
};

/** approve: a permitted agent moves a card from Waiting on Client Services to Done (src/lib/task-review.ts agentApproveReview). */
async function approveAsAgent(
  sql: Sql,
  agent: AgentPrincipal,
  row: { id: string; title: string; organization_id: string; project_id: string | null },
  note: string | undefined,
  now: number,
): Promise<UpdateResult> {
  const decided = await agentApproveReview(sql, agent, { taskId: row.id, note, now });
  if (!decided.ok) {
    const known = APPROVE_ERRORS[decided.error] ?? { status: 400 as const, message: `That approval was refused (${decided.error}).` };
    return { ok: false, status: known.status, message: known.message };
  }
  const released = "release" in decided && decided.release ? decided.release.released.length : 0;
  const activityId = await record(
    sql, agent, row, "approve", `Approved "${row.title}" to Done.${note ? ` ${note}` : ""}`, { to: "done", note: note ?? null, released }, now,
  );
  return { ok: true, task: await freshTask(sql, row.id), activityId };
}

export type AgentCardFiling = {
  id: string; agent_id: string; kind: string; title: string; filed_at: string | null; skills_used: string[];
  visibility: "held" | "released" | "superseded" | "withdrawn" | "published";
};

export type AgentCardDetail = BoardTask & {
  /** Notes on the card's timeline (board notes and refusals), newest first, up to 50. */
  notes: { at: string; actor_kind: string; actor_id: string | null; kind: string; body: string }[];
  /** Work filed against the card, newest first, up to 50, with the skills each filing cited. */
  filings: AgentCardFiling[];
};

function jsonList(raw: string | null): string[] {
  try {
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** One card with its brief, notes and filings. Only for a card of a client this agent is assigned to now (else 404). */
export async function getAgentTask(sql: Sql, agent: AgentPrincipal, taskId: string): Promise<{ ok: true; task: AgentCardDetail } | BoardError> {
  const found = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM tasks WHERE id = ?", [taskId]);
  if (!found || !found.organization_id || !assigned(agent, found.organization_id)) return { ok: false, status: 404, message: "No such task on your clients' boards." };
  const task = await freshTask(sql, taskId);
  const notes = await sql.all<{ created_at: number; actor_kind: string; actor_id: string | null; kind: string; body: string | null }>(
    `SELECT created_at, actor_kind, actor_id, kind, body FROM activities
     WHERE organization_id = ? AND kind IN ('client_agent.board', 'client_agent.board_refused', 'github.card_note')
       AND (json_extract(data_json, '$.task_id') = ? OR json_extract(data_json, '$.taskId') = ?)
       AND (kind != 'client_agent.board' OR json_extract(data_json, '$.action') = 'note')
     ORDER BY created_at DESC, rowid DESC LIMIT 50`,
    [found.organization_id, taskId, taskId],
  );
  const filings = await sql.all<{
    id: string; agent_id: string; kind: string; title: string; filed_at: number | null; skills_used_json: string | null;
    held_at: number | null; released_at: number | null; retracted_at: number | null; superseded_by: string | null;
  }>(
    `SELECT i.id, i.agent_id, i.kind, i.title, i.filed_at, i.skills_used_json, b.held_at, i.released_at, i.retracted_at, i.superseded_by
     FROM agent_work_items i LEFT JOIN batches b ON b.id = i.batch_id
     WHERE i.task_id = ? AND i.organization_id = ? AND i.state = 'filed' ORDER BY i.filed_at DESC LIMIT 50`,
    [taskId, found.organization_id],
  );
  return {
    ok: true,
    task: {
      ...task,
      notes: notes.map((note) => ({
        at: new Date(note.created_at).toISOString(), actor_kind: note.actor_kind, actor_id: note.actor_id, kind: note.kind, body: note.body ?? "",
      })),
      filings: filings.map((item) => ({
        id: item.id,
        agent_id: item.agent_id,
        kind: item.kind,
        title: item.title,
        filed_at: item.filed_at == null ? null : new Date(item.filed_at).toISOString(),
        skills_used: jsonList(item.skills_used_json),
        visibility: item.retracted_at != null
          ? "withdrawn"
          : item.superseded_by
            ? "superseded"
            : item.released_at != null
              ? "released"
              : item.held_at != null
                ? "held"
                : "published",
      })),
    },
  };
}

/**
 * attach_skills / detach_skills on one open card. Every prefix must name at least one skill in the published library
 * (org/ never does), else 404 and nothing is written. Repeats are no-ops and log nothing.
 */
async function changeCardSkills(
  sql: Sql,
  agent: AgentPrincipal,
  task: { id: string; title: string; organization_id: string; project_id: string | null },
  change: { action: "attach_skills" | "detach_skills"; prefixes: string[] },
  input: { now: number; bucket?: SkillBucket },
): Promise<{ ok: true; task: BoardTask; activityId: string | null } | BoardError> {
  const catalog = await loadCatalog(input.bucket);
  if (!catalog.ok) return catalog;
  const checked = checkPrefixes(catalog.skills, change.prefixes);
  if (!checked.ok) return { ok: false, status: 404, message: `No pack or skill in the library at ${checked.bad}. List packs with GET /api/agent-skill-library.` };
  const row = { id: task.id, title: task.title, organization_id: task.organization_id, project_id: task.project_id };
  let activityId: string | null = null;
  if (change.action === "attach_skills") {
    const added = await attachCardSkills(sql, { taskId: task.id, prefixes: checked.prefixes, actor: { kind: "agent", id: agent.agentId }, now: input.now });
    if (added.length) {
      await logAgentSkillEvents(sql, agent, { taskId: task.id, source: "agent-board", now: input.now }, added.map((prefix) => ({
        event: "attach" as const,
        prefix,
        path: prefix.endsWith("/SKILL.md") ? prefix : null,
        libraryVersion: catalog.version,
      })));
      activityId = await record(sql, agent, row, "attach_skills", `attached ${added.join(", ")} to "${task.title}".`, { prefixes: added }, input.now, true);
    }
  } else {
    const removed = await detachCardSkills(sql, { taskId: task.id, prefixes: checked.prefixes, actor: { id: agent.agentId }, now: input.now });
    if (removed.length) {
      await logAgentSkillEvents(sql, agent, { taskId: task.id, source: "agent-board", now: input.now }, removed.map((prefix) => ({
        event: "detach" as const,
        prefix,
        path: prefix.endsWith("/SKILL.md") ? prefix : null,
        libraryVersion: catalog.version,
      })));
      activityId = await record(sql, agent, row, "detach_skills", `detached ${removed.join(", ")} from "${task.title}".`, { prefixes: removed }, input.now, true);
    }
  }
  if (activityId) await sql.run("UPDATE tasks SET updated_at = ? WHERE id = ?", [input.now, task.id]);
  return { ok: true, task: await freshTask(sql, task.id), activityId };
}

/**
 * A new task in one of this agent's clients. Project: project_id, else the assignment's project, else the client's
 * only open project. stage is todo (default, stored describe) or doing (stored engineer: Doing, starts nothing).
 * The old names describe and engineer still work.
 */
export async function createAgentTask(
  sql: Sql,
  agent: AgentPrincipal,
  input: {
    client?: unknown; projectId?: string | null; title: string; note?: string | null; stage?: string | null;
    /** Agent id of the card's owner on the same client. A hire's own cards default to itself and can't name another. */
    assignee?: string | null;
    /** The Client Services request this card answers (POST /api/client-services/requests), or its email thread id. */
    workRequestId?: string | null;
    threadId?: string | null;
    /** Description, requirements and acceptance criteria (stored on the create activity; GET returns them). */
    brief?: BriefInput;
    now: number;
  },
): Promise<{ ok: true; task: BoardTask; activityId: string; workRequestId?: string | null } | BoardError> {
  const title = input.title.trim().slice(0, 200);
  if (!title) return { ok: false, status: 400, message: "title is required." };
  const asked = toColumn(input.stage ?? "todo");
  if (asked !== "todo" && asked !== "doing") return { ok: false, status: 400, message: "stage must be todo or doing." };
  const stage = asked === "doing" ? "engineer" : "describe";
  let organizationId: string | null = null;
  if (input.client) {
    const client = await resolveClientRef(sql, input.client);
    if (!client.ok || !assigned(agent, client.organizationId)) return { ok: false, status: 403, message: "This agent is not assigned to that client." };
    organizationId = client.organizationId;
  }
  let projectId = input.projectId?.trim() || null;
  if (projectId) {
    const project = await sql.get<{ organization_id: string }>(`SELECT organization_id FROM projects WHERE id = ? AND ${OPEN_PROJECT}`, [projectId]);
    if (!project || !assigned(agent, project.organization_id) || (organizationId && project.organization_id !== organizationId)) {
      return { ok: false, status: 403, message: "That project is not open on your clients' boards." };
    }
    organizationId = project.organization_id;
  }
  if (!organizationId) {
    if (agent.assignments.length !== 1) return { ok: false, status: 400, message: "Name the client or the project." };
    organizationId = agent.assignments[0].organizationId;
  }
  if (!projectId) {
    const assignment = agent.assignments.find((row) => row.organizationId === organizationId);
    const fromAssignment = assignment?.projectId
      ? await sql.get<{ id: string }>(`SELECT id FROM projects WHERE id = ? AND ${OPEN_PROJECT}`, [assignment.projectId])
      : undefined;
    if (fromAssignment) projectId = fromAssignment.id;
    else {
      const open = await sql.all<{ id: string }>(`SELECT id FROM projects WHERE organization_id = ? AND ${OPEN_PROJECT}`, [organizationId]);
      if (open.length !== 1) return { ok: false, status: 400, message: open.length ? "Name the project." : "This client has no open project." };
      projectId = open[0].id;
    }
  }
  let assignee: string | null = null;
  const lead = isLeadOn(agent, organizationId);
  const askedAssignee = input.assignee?.trim().toLowerCase() || null;
  if (askedAssignee && askedAssignee !== "lead") {
    if (!lead && askedAssignee !== agent.agentId) return { ok: false, status: 403, message: "A hire adds cards for itself only. Ask the lead agent to assign it." };
    const live = await liveClientAgent(sql, organizationId, askedAssignee);
    if (!live) return { ok: false, status: 400, message: `${askedAssignee} is not an agent assigned to this client.` };
    assignee = live.id;
  } else if (askedAssignee === "lead") {
    if (!lead) return { ok: false, status: 403, message: "A hire adds cards for itself only. Ask the lead agent to assign it." };
  } else if (!lead) {
    assignee = agent.agentId;
  }
  const workRequestId = input.workRequestId?.trim() || null;
  if (workRequestId) {
    const known = await sql.get<{ id: string }>("SELECT id FROM client_work_requests WHERE id = ? AND organization_id = ?", [workRequestId, organizationId]);
    if (!known) return { ok: false, status: 400, message: "work_request_id is not a request of this client." };
  }
  const id = crypto.randomUUID();
  const position = await nextColumnPosition(sql, { organizationId, projectId, column: stage });
  await sql.run(
    `INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at, stage, skills_json, created_by_kind, round, position, assignee_agent_id)
     VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, '[]', 'agent', 1, ?, ?)`,
    [id, projectId, organizationId, title, input.now, input.now, stage, position, assignee],
  );
  const row = { id, title, organization_id: organizationId, project_id: projectId };
  const note = input.note?.trim().slice(0, 4000) || null;
  const owner = assignee && assignee !== agent.agentId ? ` Assigned to ${assignee}.` : "";
  const threadId = input.threadId?.trim() || null;
  const linked = workRequestId || threadId
    ? await resolveFilingRequest(sql, {
        organizationId, taskId: id, workRequestId, threadId, title, summary: note, projectId,
        workspaceId: await spaceFor(sql, projectId), now: input.now,
      })
    : null;
  const activityId = await record(
    sql, agent, row, "create", `Added task "${title}".${owner}${note ? ` ${note}` : ""}`,
    { stage, note, assignee, ...(linked ? { work_request_id: linked } : {}), ...(input.brief ? briefData(input.brief) : {}) }, input.now,
  );
  const brief = (await cardBriefs(sql, { organizationIds: [organizationId], taskIds: [id] })).get(id) ?? EMPTY_BRIEF;
  return {
    ok: true,
    task: {
      ...row, stage, status: "todo", column: asked, blocked_reason: null, deliverable_id: null, review_requested_at: null, review_note: null,
      skill_packs: [], assignee_agent_id: assignee, updated_at: new Date(input.now).toISOString(), ...brief,
    },
    activityId,
    ...(linked ? { workRequestId: linked } : {}),
  };
}
