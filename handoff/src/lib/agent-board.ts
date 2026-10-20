import type { Sql } from "@/db/sql";
import { agentMode } from "@/lib/agent-mode";
import { resolveClientRef, type AgentPrincipal } from "@/lib/agent-work-filing";
import { nextColumnPosition } from "@/lib/task-position";
import { moveTaskStage, type MoveTaskResult } from "@/lib/task-stage";

/**
 * Client agents update the project board for clients they are assigned to now: set a task in progress, block it with
 * a reason, ask for review, move it between columns, add a note, or create a task in the client's project. No deletes.
 * Every change is a client_agent.board activity, which the Client Services updates feed carries.
 */

const OPEN_PROJECT = "status IN ('planned', 'active', 'waiting_on_client')";
const COLUMNS = new Set(["describe", "engineer", "build", "run", "done"]);

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
  updated_at: string;
};

export type BoardError = { ok: false; status: 400 | 403 | 404; message: string };

function columnOf(row: { status: string; stage: string }): string {
  return row.status === "done" ? "done" : row.stage || "describe";
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
      `${agent.label}: ${body}`.slice(0, 2000),
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
  const rows = await sql.all<{
    id: string; title: string; organization_id: string; project_id: string | null; stage: string; status: string;
    blocked_reason: string | null; deliverable_id: string | null; updated_at: number;
  }>(
    `SELECT id, title, organization_id, project_id, stage, status, blocked_reason, deliverable_id, updated_at FROM tasks
     WHERE organization_id IN (${marks}) AND (? IS NULL OR project_id = ?)
     ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, updated_at DESC LIMIT 200`,
    [...orgs, query.projectId ?? null, query.projectId ?? null],
  );
  return {
    ok: true,
    tasks: rows.map((row) => ({ ...row, column: columnOf(row), updated_at: new Date(row.updated_at).toISOString() })),
  };
}

export type BoardAction =
  | { action: "start" }
  | { action: "pause" }
  | { action: "block"; reason: string }
  | { action: "review"; note?: string }
  | { action: "move"; to: string }
  | { action: "note"; body: string };

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
      const to = str(body.to, 20)?.toLowerCase();
      return to && COLUMNS.has(to) ? { action: "move", to } : null;
    }
    case "note": {
      const text = str(body.body, 4000);
      return text ? { action: "note", body: text } : null;
    }
    default:
      return null;
  }
}

/** One board change on one task. The task must belong to a client this agent is assigned to now. */
export async function updateAgentTask(
  sql: Sql,
  agent: AgentPrincipal,
  input: { taskId: string; change: BoardAction; now: number },
): Promise<{ ok: true; task: BoardTask; activityId: string; handedTo?: string | null } | BoardError> {
  const task = await sql.get<{ id: string; title: string; organization_id: string | null; project_id: string | null; stage: string; status: string }>(
    "SELECT id, title, organization_id, project_id, stage, status FROM tasks WHERE id = ?",
    [input.taskId],
  );
  if (!task || !task.organization_id || !assigned(agent, task.organization_id)) return { ok: false, status: 404, message: "No such task on your clients' boards." };
  const row = { ...task, organization_id: task.organization_id };
  const actor = { kind: "agent" as const, id: agent.agentId };
  const change = input.change;
  let activityId = "";
  let handedTo: string | null | undefined;

  if (change.action === "note") {
    activityId = await record(sql, agent, row, "note", `Note on "${task.title}": ${change.body}`, { body: change.body }, input.now);
  } else if (change.action === "start" || change.action === "pause") {
    if (task.status === "done") return { ok: false, status: 400, message: "That task is done. Move it to a column first." };
    const status = change.action === "start" ? "doing" : "todo";
    await sql.run("UPDATE tasks SET status = ?, blocked_reason = NULL, updated_at = ? WHERE id = ?", [status, input.now, task.id]);
    activityId = await record(sql, agent, row, change.action, `${change.action === "start" ? "Started" : "Paused"} "${task.title}".`, { status }, input.now);
  } else if (change.action === "block") {
    const moved = await moveTaskStage(sql, { taskId: task.id, blockedReason: change.reason, now: input.now, actor });
    if (!moved.ok) return { ok: false, status: 400, message: "That task could not be blocked." };
    activityId = await record(sql, agent, row, "block", `Blocked "${task.title}": ${change.reason}`, { reason: change.reason }, input.now);
  } else if (change.action === "review") {
    if (task.status === "done") return { ok: false, status: 400, message: "That task is already done." };
    await sql.run("UPDATE tasks SET status = 'doing', blocked_reason = NULL, updated_at = ? WHERE id = ?", [input.now, task.id]);
    activityId = await record(sql, agent, row, "review", `"${task.title}" is ready for review.${change.note ? ` ${change.note}` : ""}`, { note: change.note ?? null }, input.now);
  } else {
    if ((change.to === "build" || change.to === "run") && agentMode() !== "agents") {
      return { ok: false, status: 403, message: "Moving to build or run would start a swarm or Cursor run. Staff do that while AGENT_MODE is legacy." };
    }
    const moved: MoveTaskResult = await moveTaskStage(sql, { taskId: task.id, to: change.to as "describe", now: input.now, actor });
    if (!moved.ok) return { ok: false, status: 400, message: `That move was refused (${moved.error}).` };
    handedTo = moved.handedTo;
    activityId = await record(sql, agent, row, "move", `Moved "${task.title}" to ${change.to}.`, { to: change.to }, input.now);
  }
  const fresh = await sql.get<{
    id: string; title: string; organization_id: string; project_id: string | null; stage: string; status: string;
    blocked_reason: string | null; deliverable_id: string | null; updated_at: number;
  }>("SELECT id, title, organization_id, project_id, stage, status, blocked_reason, deliverable_id, updated_at FROM tasks WHERE id = ?", [task.id]);
  return {
    ok: true,
    task: { ...fresh!, column: columnOf(fresh!), updated_at: new Date(fresh!.updated_at).toISOString() },
    activityId,
    ...(handedTo !== undefined ? { handedTo } : {}),
  };
}

/**
 * A new task in one of this agent's clients. Project: project_id, else the assignment's project, else the client's
 * only open project. Stage is describe (default) or engineer.
 */
export async function createAgentTask(
  sql: Sql,
  agent: AgentPrincipal,
  input: { client?: unknown; projectId?: string | null; title: string; note?: string | null; stage?: string | null; now: number },
): Promise<{ ok: true; task: BoardTask; activityId: string } | BoardError> {
  const title = input.title.trim().slice(0, 200);
  if (!title) return { ok: false, status: 400, message: "title is required." };
  const stage = input.stage ?? "describe";
  if (stage !== "describe" && stage !== "engineer") return { ok: false, status: 400, message: "stage must be describe or engineer." };
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
    task: { ...row, stage, status: "todo", column: stage, blocked_reason: null, deliverable_id: null, updated_at: new Date(input.now).toISOString() },
    activityId,
  };
}
