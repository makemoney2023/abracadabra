import type { Sql } from "@/db/sql";
import { agentMode } from "@/lib/agent-mode";
import { resolveClientRef, type AgentPrincipal } from "@/lib/agent-work-filing";
import { nextColumnPosition } from "@/lib/task-position";
import { moveTaskStage, type MoveTaskResult } from "@/lib/task-stage";
import { BOARD_COLUMN_LABEL, columnOf as boardColumnOf, toColumn, type BoardColumn } from "@/lib/board-model";
import type { SkillBucket } from "@/lib/skill-library";
import { attachCardSkills, cardSkillPacks, checkPrefixes, detachCardSkills, loadCatalog } from "@/lib/skill-packs";

/**
 * Client agents update the project board for clients they are assigned to now: set a task in progress, block it with
 * a reason, ask for review, move it between columns, add a note, attach or detach skill packs from the library, or
 * create a task in the client's project. No deletes.
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
  updated_at: string;
};

export type BoardError = { ok: false; status: 400 | 403 | 404 | 409 | 503; message: string };

type TaskDbRow = {
  id: string; title: string; organization_id: string; project_id: string | null; stage: string; status: string;
  blocked_reason: string | null; deliverable_id: string | null; review_requested_at: number | null; review_note: string | null;
  updated_at: number;
};

const TASK_FIELDS =
  "id, title, organization_id, project_id, stage, status, blocked_reason, deliverable_id, review_requested_at, review_note, updated_at";

function toBoardTask(row: TaskDbRow, skillPacks: string[] = []): BoardTask {
  return {
    ...row,
    skill_packs: skillPacks,
    column: boardColumnOf(row),
    review_requested_at: row.review_requested_at == null || row.status === "done" ? null : new Date(row.review_requested_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function assigned(agent: AgentPrincipal, organizationId: string | null): boolean {
  return Boolean(organizationId) && agent.assignments.some((row) => row.organizationId === organizationId);
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

/** Tasks on the boards of this agent's clients. ?client= (id, domain, or space slug) and ?project_id= narrow it. */
export async function listAgentBoard(
  sql: Sql,
  agent: AgentPrincipal,
  query: { client?: unknown; projectId?: string | null },
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
     WHERE organization_id IN (${marks}) AND (? IS NULL OR project_id = ?)
     ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, updated_at DESC LIMIT 200`,
    [...orgs, query.projectId ?? null, query.projectId ?? null],
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
  return {
    ok: true,
    tasks: rows.map((row) => toBoardTask(row, packs.get(row.id) ?? [])),
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
  | { action: "attach_skills" | "detach_skills"; prefixes: string[] };

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

/** One board change on one task. The task must belong to a client this agent is assigned to now. */
export async function updateAgentTask(
  sql: Sql,
  agent: AgentPrincipal,
  input: { taskId: string; change: BoardAction; now: number; bucket?: SkillBucket },
): Promise<{ ok: true; task: BoardTask; activityId: string | null; handedTo?: string | null } | BoardError> {
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
  const row = { id: task.id, title: task.title, organization_id: task.organization_id, project_id: task.project_id };
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

async function freshTask(sql: Sql, taskId: string): Promise<BoardTask> {
  const fresh = await sql.get<TaskDbRow>(`SELECT ${TASK_FIELDS} FROM tasks WHERE id = ?`, [taskId]);
  return toBoardTask(fresh!, await cardSkillPacks(sql, taskId));
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
      activityId = await record(sql, agent, row, "attach_skills", `attached ${added.join(", ")} to "${task.title}".`, { prefixes: added }, input.now, true);
    }
  } else {
    const removed = await detachCardSkills(sql, { taskId: task.id, prefixes: checked.prefixes, actor: { id: agent.agentId }, now: input.now });
    if (removed.length) {
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
  input: { client?: unknown; projectId?: string | null; title: string; note?: string | null; stage?: string | null; now: number },
): Promise<{ ok: true; task: BoardTask; activityId: string } | BoardError> {
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
  const id = crypto.randomUUID();
  const position = await nextColumnPosition(sql, { organizationId, projectId, column: stage });
  await sql.run(
    `INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at, stage, skills_json, created_by_kind, round, position)
     VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, '[]', 'agent', 1, ?)`,
    [id, projectId, organizationId, title, input.now, input.now, stage, position],
  );
  const row = { id, title, organization_id: organizationId, project_id: projectId };
  const note = input.note?.trim().slice(0, 4000) || null;
  const activityId = await record(sql, agent, row, "create", `Added task "${title}".${note ? ` ${note}` : ""}`, { stage, note }, input.now);
  return {
    ok: true,
    task: { ...row, stage, status: "todo", column: asked, blocked_reason: null, deliverable_id: null, review_requested_at: null, review_note: null, skill_packs: [], updated_at: new Date(input.now).toISOString() },
    activityId,
  };
}
