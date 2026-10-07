import type { Sql } from "@/db/sql";
import { DELIVERABLE_KINDS } from "@/lib/deliverable-manifest";

const KINDS = new Set<string>(DELIVERABLE_KINDS);
const STAGES = new Set(["describe", "engineer", "build", "run"]);
const TASK_STATUSES = new Set(["todo", "doing", "blocked", "done"]);
const HEALTH = new Set(["on_track", "at_risk", "off_track", "done"]);
const AUDIENCE = new Set(["internal", "client"]);

export class AgentWorkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentWorkError";
  }
}

export type AgentActor = { keyId: string; organizationId: string };

type WorkArgs = {
  requestId?: string;
  kind?: string;
  title?: string;
  bodyMarkdown?: string;
  sourcesJson?: unknown;
  projectId?: string;
  milestoneId?: string;
  stage?: string;
  skills?: unknown;
  deliverableKind?: string;
  dueAt?: number | null;
  taskId?: string;
  status?: string;
  blockedReason?: string;
  note?: string;
  deliverableId?: string;
  workspaceId?: string;
  path?: string;
  objectKey?: string;
  health?: string;
  audience?: string;
  body?: string;
  question?: string;
  options?: unknown;
};

/** One stored result per request. A repeat returns the first result and does not write again. */
export async function runAgentWork(sql: Sql, actor: AgentActor, tool: string, args: WorkArgs, now: number): Promise<unknown> {
  const requestId = args.requestId?.trim() ?? "";
  if (!requestId) throw new AgentWorkError("Name a requestId.");
  const prior = await sql.get<{ result_json: string }>(
    "SELECT result_json FROM idempotency_keys WHERE actor_id = ? AND key = ?",
    [actor.keyId, requestId],
  );
  if (prior) return JSON.parse(prior.result_json) as unknown;
  const result = await perform(sql, actor, tool, args, now);
  await sql.run(
    `INSERT INTO idempotency_keys (key, actor_id, tool, result_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    [requestId, actor.keyId, tool, JSON.stringify(result), now],
  );
  return result;
}

async function perform(sql: Sql, actor: AgentActor, tool: string, args: WorkArgs, now: number): Promise<unknown> {
  if (tool === "save_brief") return saveBrief(sql, actor, args, now);
  if (tool === "create_task") return createAgentTask(sql, actor, args, now);
  if (tool === "update_task") return updateAgentTask(sql, actor, args, now);
  if (tool === "create_deliverable") return createAgentDeliverable(sql, actor, args, now);
  if (tool === "add_deliverable_item") return addAgentItem(sql, actor, args, now);
  if (tool === "post_status_update") return postAgentStatus(sql, actor, args, now);
  if (tool === "add_note") return addAgentNote(sql, actor, args, now);
  if (tool === "ask_staff") return askStaff(sql, actor, args, now);
  if (tool === "list_repos") return listAgentRepos(sql, actor);
  throw new AgentWorkError("Unknown tool.");
}

function text(value: string | undefined, max: number, label: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.length > max) throw new AgentWorkError(`Check the ${label}.`);
  return trimmed;
}

async function workspaceFor(sql: Sql, organizationId: string, workspaceId?: string): Promise<string> {
  if (workspaceId) {
    const row = await sql.get<{ id: string }>(
      "SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND status != 'purged'",
      [workspaceId, organizationId],
    );
    if (!row) throw new AgentWorkError("That space is not in this organization.");
    return row.id;
  }
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM workspaces WHERE organization_id = ? AND status != 'purged' ORDER BY slug LIMIT 1",
    [organizationId],
  );
  if (!row) throw new AgentWorkError("This client has no space yet.");
  return row.id;
}

async function projectInOrg(sql: Sql, organizationId: string, projectId: string): Promise<void> {
  const row = await sql.get<{ organization_id: string }>("SELECT organization_id FROM projects WHERE id = ?", [projectId]);
  if (!row || row.organization_id !== organizationId) throw new AgentWorkError("That project is not in this organization.");
}

async function saveBrief(sql: Sql, actor: AgentActor, args: WorkArgs, now: number): Promise<unknown> {
  if (args.kind !== "brief" && args.kind !== "design_system") throw new AgentWorkError("Kind must be brief or design_system.");
  const title = text(args.title, 200, "title");
  const body = text(args.bodyMarkdown, 100_000, "body");
  if (!Array.isArray(args.sourcesJson)) throw new AgentWorkError("List the files this brief used.");
  const workspaceId = await workspaceFor(sql, actor.organizationId);
  const itemTitle = args.kind === "brief" ? "brief.md" : "design-system.md";
  const activityKind = args.kind === "brief" ? "agent.brief_drafted" : "agent.design_system_drafted";
  const existing = await sql.get<{ id: string; version: number }>(
    `SELECT id, version FROM deliverables
     WHERE organization_id = ? AND kind = ? AND status != 'archived'
     ORDER BY updated_at DESC LIMIT 1`,
    [actor.organizationId, args.kind],
  );
  const id = existing?.id ?? crypto.randomUUID();
  const version = existing ? existing.version + 1 : 1;
  await sql.exec("BEGIN");
  try {
    if (existing) {
      await sql.run("UPDATE deliverables SET version = ?, status = 'draft', title = ?, updated_at = ? WHERE id = ?", [
        version,
        title,
        now,
        id,
      ]);
    } else {
      await sql.run(
        `INSERT INTO deliverables (
          id, organization_id, project_id, workspace_id, title, kind, status, version,
          source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at, updated_at, published_version
        ) VALUES (?, ?, NULL, ?, ?, ?, 'draft', 1, NULL, NULL, NULL, 'agent', ?, ?, ?, NULL)`,
        [id, actor.organizationId, workspaceId, title, args.kind, actor.keyId, now, now],
      );
    }
    await sql.run(
      `INSERT INTO deliverable_items (
        id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
      ) VALUES (?, ?, ?, NULL, 'page', NULL, ?, ?, '[]', NULL, 'pending', 0)`,
      [crypto.randomUUID(), id, version, itemTitle, body],
    );
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES (?, ?, ?, ?, 'agent', ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        actor.organizationId,
        workspaceId,
        activityKind,
        actor.keyId,
        title,
        JSON.stringify({ deliverableId: id, sources: args.sourcesJson }),
        now,
      ],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { deliverableId: id, version, kind: args.kind };
}

function skillSteps(value: unknown): { path: string; mode: string; status: "todo" }[] {
  if (!Array.isArray(value)) throw new AgentWorkError("List the skills for this task.");
  return value.map((step) => {
    if (!step || typeof step !== "object") throw new AgentWorkError("Check the skills.");
    const row = step as { path?: string; mode?: string };
    const skillPath = row.path?.trim() ?? "";
    if (!skillPath || (row.mode !== "complete" && row.mode !== "plan")) throw new AgentWorkError("Check the skills.");
    return { path: skillPath, mode: row.mode, status: "todo" as const };
  });
}

async function createAgentTask(sql: Sql, actor: AgentActor, args: WorkArgs, now: number): Promise<unknown> {
  const title = text(args.title, 200, "title");
  const stage = args.stage ?? "describe";
  if (!STAGES.has(stage)) throw new AgentWorkError("Check the stage.");
  const steps = skillSteps(args.skills ?? []);
  const projectId = args.projectId?.trim() || null;
  if (projectId) await projectInOrg(sql, actor.organizationId, projectId);
  const milestoneId = args.milestoneId?.trim() || null;
  if (milestoneId) {
    if (!projectId) throw new AgentWorkError("A milestone needs a project.");
    const milestone = await sql.get<{ id: string }>("SELECT id FROM milestones WHERE id = ? AND project_id = ?", [
      milestoneId,
      projectId,
    ]);
    if (!milestone) throw new AgentWorkError("That milestone is not on this project.");
  }
  const dueAt = args.dueAt ?? null;
  if (dueAt !== null && !Number.isInteger(dueAt)) throw new AgentWorkError("Check the due date.");
  const id = crypto.randomUUID();
  await sql.exec("BEGIN");
  try {
    await sql.run(
      `INSERT INTO tasks (
        id, project_id, milestone_id, organization_id, title, status, assignee_user_id,
        due_at, created_at, updated_at, done_at, stage, skills_json, created_by_kind, round
      ) VALUES (?, ?, ?, ?, ?, 'todo', NULL, ?, ?, ?, NULL, ?, ?, 'agent', 1)`,
      [id, projectId, milestoneId, actor.organizationId, title, dueAt, now, now, stage, JSON.stringify({ steps })],
    );
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES (?, ?, ?, 'agent.task_created', 'agent', ?, ?, ?, ?)`,
      [crypto.randomUUID(), actor.organizationId, projectId, actor.keyId, title, JSON.stringify({ taskId: id }), now],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { taskId: id, stage, status: "todo" };
}

async function taskInOrg(sql: Sql, organizationId: string, taskId: string): Promise<{ id: string; project_id: string | null }> {
  const task = await sql.get<{ id: string; project_id: string | null; organization_id: string }>(
    "SELECT id, project_id, organization_id FROM tasks WHERE id = ?",
    [taskId],
  );
  if (!task || task.organization_id !== organizationId) throw new AgentWorkError("That task is not in this organization.");
  return task;
}

async function updateAgentTask(sql: Sql, actor: AgentActor, args: WorkArgs, now: number): Promise<unknown> {
  const taskId = args.taskId?.trim() ?? "";
  if (!taskId) throw new AgentWorkError("Name a task.");
  const task = await taskInOrg(sql, actor.organizationId, taskId);
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];
  if (args.status !== undefined) {
    if (!TASK_STATUSES.has(args.status)) throw new AgentWorkError("Check the status.");
    sets.push("status = ?");
    params.push(args.status);
    sets.push("done_at = ?");
    params.push(args.status === "done" ? now : null);
  }
  if (args.stage !== undefined) {
    if (!STAGES.has(args.stage)) throw new AgentWorkError("Check the stage.");
    sets.push("stage = ?");
    params.push(args.stage);
  }
  if (args.skills !== undefined) {
    sets.push("skills_json = ?");
    params.push(JSON.stringify({ steps: skillSteps(args.skills) }));
  }
  if (args.blockedReason !== undefined) {
    sets.push("blocked_reason = ?");
    params.push(args.blockedReason.trim() || null);
  }
  params.push(task.id);
  await sql.run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, params);
  if (args.note?.trim()) {
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES (?, ?, ?, 'task_status', 'agent', ?, ?, ?, ?)`,
      [crypto.randomUUID(), actor.organizationId, task.project_id, actor.keyId, args.note.trim(), JSON.stringify({ taskId: task.id }), now],
    );
  }
  return { taskId: task.id, stage: args.stage ?? null, status: args.status ?? null };
}

async function createAgentDeliverable(sql: Sql, actor: AgentActor, args: WorkArgs, now: number): Promise<unknown> {
  const title = text(args.title, 200, "title");
  if (!args.kind || !KINDS.has(args.kind)) throw new AgentWorkError("Check the kind.");
  const projectId = args.projectId?.trim() || null;
  if (projectId) await projectInOrg(sql, actor.organizationId, projectId);
  const workspaceId = await workspaceFor(sql, actor.organizationId, args.workspaceId);
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO deliverables (
      id, organization_id, project_id, workspace_id, title, kind, status, version,
      source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at, updated_at, published_version
    ) VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, NULL, NULL, NULL, 'agent', ?, ?, ?, NULL)`,
    [id, actor.organizationId, projectId, workspaceId, title, args.kind, actor.keyId, now, now],
  );
  return { deliverableId: id, status: "draft" };
}

async function addAgentItem(sql: Sql, actor: AgentActor, args: WorkArgs, now: number): Promise<unknown> {
  const deliverableId = args.deliverableId?.trim() ?? "";
  if (!deliverableId) throw new AgentWorkError("Name a deliverable.");
  const row = await sql.get<{ id: string; version: number; organization_id: string; status: string }>(
    "SELECT id, version, organization_id, status FROM deliverables WHERE id = ?",
    [deliverableId],
  );
  if (!row || row.organization_id !== actor.organizationId) throw new AgentWorkError("That deliverable is not in this organization.");
  if (row.status === "archived") throw new AgentWorkError("That deliverable is archived.");
  const itemTitle = text(args.path, 200, "path");
  if (itemTitle.includes("..") || itemTitle.startsWith("/")) throw new AgentWorkError("Check the path.");
  const body = args.bodyMarkdown?.trim() || null;
  const objectKey = args.objectKey?.trim() || null;
  if (!body && !objectKey) throw new AgentWorkError("Add the copy or a file.");
  const sortRow = await sql.get<{ next: number }>(
    "SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM deliverable_items WHERE deliverable_id = ? AND version = ?",
    [row.id, row.version],
  );
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO deliverable_items (
      id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
    ) VALUES (?, ?, ?, NULL, 'page', NULL, ?, ?, ?, NULL, 'pending', ?)`,
    [id, row.id, row.version, itemTitle, body, JSON.stringify(objectKey ? [{ objectKey }] : []), sortRow?.next ?? 0],
  );
  await sql.run("UPDATE deliverables SET updated_at = ? WHERE id = ?", [now, row.id]);
  return { itemId: id, deliverableId: row.id };
}

async function postAgentStatus(sql: Sql, actor: AgentActor, args: WorkArgs, now: number): Promise<unknown> {
  const projectId = args.projectId?.trim() ?? "";
  if (!projectId) throw new AgentWorkError("Name a project.");
  await projectInOrg(sql, actor.organizationId, projectId);
  const body = text(args.body, 4000, "body");
  if (!args.health || !HEALTH.has(args.health) || !args.audience || !AUDIENCE.has(args.audience)) {
    throw new AgentWorkError("Check the health and audience.");
  }
  const state = args.audience === "internal" ? "published" : "draft";
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO status_updates (
      id, project_id, organization_id, health, audience, body, state, emailed_at,
      actor_kind, actor_id, created_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'agent', ?, ?, ?)`,
    [id, projectId, actor.organizationId, args.health, args.audience, body, state, actor.keyId, now, state === "published" ? now : null],
  );
  return { id, state };
}

async function addAgentNote(sql: Sql, actor: AgentActor, args: WorkArgs, now: number): Promise<unknown> {
  const body = text(args.body, 4000, "note");
  const taskId = args.taskId?.trim() || null;
  const deliverableId = args.deliverableId?.trim() || null;
  if (taskId) await taskInOrg(sql, actor.organizationId, taskId);
  if (deliverableId) {
    const row = await sql.get<{ organization_id: string }>("SELECT organization_id FROM deliverables WHERE id = ?", [deliverableId]);
    if (!row || row.organization_id !== actor.organizationId) throw new AgentWorkError("That deliverable is not in this organization.");
  }
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO activities (
      id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
    ) VALUES (?, ?, 'agent.note', 'agent', ?, ?, ?, ?)`,
    [id, actor.organizationId, actor.keyId, body, JSON.stringify({ taskId, deliverableId }), now],
  );
  return { activityId: id };
}

async function askStaff(sql: Sql, actor: AgentActor, args: WorkArgs, now: number): Promise<unknown> {
  const question = text(args.question, 2000, "question");
  const taskId = args.taskId?.trim() || null;
  const deliverableId = args.deliverableId?.trim() || null;
  if (taskId) await taskInOrg(sql, actor.organizationId, taskId);
  if (args.options !== undefined && !Array.isArray(args.options)) throw new AgentWorkError("Options must be a list.");
  const id = crypto.randomUUID();
  await sql.exec("BEGIN");
  try {
    await sql.run(
      `INSERT INTO agent_questions (
        id, organization_id, task_id, deliverable_id, question, options_json, asked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, actor.organizationId, taskId, deliverableId, question, args.options ? JSON.stringify(args.options) : null, now],
    );
    if (taskId) {
      await sql.run("UPDATE tasks SET status = 'blocked', blocked_reason = 'waiting_on_staff', updated_at = ? WHERE id = ?", [
        now,
        taskId,
      ]);
    }
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES (?, ?, 'agent.question', 'agent', ?, ?, ?, ?)`,
      [crypto.randomUUID(), actor.organizationId, actor.keyId, question, JSON.stringify({ taskId, deliverableId }), now],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { questionId: id };
}

async function listAgentRepos(sql: Sql, actor: AgentActor): Promise<unknown> {
  const rows = await sql.all<{ id: string; full_name: string; project_id: string | null; default_branch: string }>(
    `SELECT id, full_name, project_id, default_branch FROM repos WHERE organization_id = ? ORDER BY full_name`,
    [actor.organizationId],
  );
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    projectId: row.project_id,
    defaultBranch: row.default_branch,
  }));
}
