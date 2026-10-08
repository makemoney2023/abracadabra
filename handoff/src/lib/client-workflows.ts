import type { Sql } from "../db/sql";
import { recordAgentRun } from "./agent-activity";
import { leadBrief, runLeadSwarm } from "./lead-swarm";
import { allowedMcpIds, mcpServersFor } from "./mcp-catalog";
import { packTemplateId } from "./pack-templates";
import type { ObjectStore } from "./store/objects";
import { storeWorkflowOutput } from "./workflow-files";

export type WorkflowGroup = {
  id: string;
  organizationId: string;
  projectId: string | null;
  name: string;
};

export type ClientWorkflow = {
  id: string;
  groupId: string;
  organizationId: string;
  projectId: string | null;
  groupProjectId: string | null;
  name: string;
  templateId: string;
  taskId: string | null;
  nextRunAt: number | null;
  everyMs: number | null;
  mcpServerIds: string[];
  groupName: string;
};

export type WorkflowTaskPlan = {
  steps: { path: string; mode: "complete"; status: "todo" }[];
  edges: { id: string; source: string; target: string }[];
  current: number;
};

const SKILL_PATH = /Follow (\.cursor\/skills\/\S+)/;

/** The work cron is every 15 minutes, so a repeat cannot be shorter than that. */
export const MIN_SCHEDULE_MS = 15 * 60 * 1000;

function scheduleOf(input: {
  dueAt?: number | null;
  everyMs?: number | null;
  now: number;
}): { ok: true; nextRunAt: number | null; everyMs: number | null; scheduledAt: number | null } | { ok: false } {
  const hasDue = input.dueAt != null;
  const hasEvery = input.everyMs != null;
  if (!hasDue && !hasEvery) return { ok: true, nextRunAt: null, everyMs: null, scheduledAt: null };
  if (!hasDue || typeof input.dueAt !== "number" || !Number.isSafeInteger(input.dueAt)) return { ok: false };
  if (hasEvery && (typeof input.everyMs !== "number" || !Number.isSafeInteger(input.everyMs) || input.everyMs < MIN_SCHEDULE_MS)) {
    return { ok: false };
  }
  return {
    ok: true,
    nextRunAt: input.dueAt,
    everyMs: hasEvery ? input.everyMs! : null,
    scheduledAt: input.now,
  };
}

/** Ordered skill steps from a swarm template. Nodes without a skill path are skipped. */
export function workflowTaskPlan(template: unknown): WorkflowTaskPlan | null {
  if (!template || typeof template !== "object") return null;
  const body = template as { nodes?: unknown; edges?: unknown };
  const steps = (Array.isArray(body.nodes) ? body.nodes : []).flatMap((node) => {
    if (!node || typeof node !== "object") return [];
    const instructions = (node as { instructions?: unknown }).instructions;
    if (typeof instructions !== "string") return [];
    const match = SKILL_PATH.exec(instructions);
    const path = match?.[1]?.replace(/[.,;:]+$/, "");
    if (!path) return [];
    return [{ path, mode: "complete" as const, status: "todo" as const }];
  });
  if (steps.length === 0) return null;
  const edges = (Array.isArray(body.edges) ? body.edges : []).flatMap((edge) => {
    if (!edge || typeof edge !== "object") return [];
    const row = edge as { id?: unknown; source?: unknown; target?: unknown };
    if (typeof row.id !== "string" || typeof row.source !== "string" || typeof row.target !== "string") return [];
    return [{ id: row.id, source: row.source, target: row.target }];
  });
  return { steps, edges, current: 0 };
}

function storedMcpIds(value: string | null): string[] | null {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) return null;
    return allowedMcpIds(parsed);
  } catch {
    return null;
  }
}

async function projectInOrg(sql: Sql, organizationId: string, projectId: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM projects WHERE id = ? AND organization_id = ?",
    [projectId, organizationId],
  );
  return Boolean(row);
}

/** A named set of workflows for one client, optionally one project. */
export async function createWorkflowGroup(
  sql: Sql,
  input: { organizationId: string; name: string; projectId?: string | null; now: number },
): Promise<{ ok: true; group: WorkflowGroup } | { ok: false; error: "invalid" | "missing" }> {
  const name = input.name.trim().slice(0, 120);
  if (!input.organizationId || !name) return { ok: false, error: "invalid" };
  const projectId = input.projectId?.trim() || null;
  if (projectId && !(await projectInOrg(sql, input.organizationId, projectId))) return { ok: false, error: "missing" };
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workflow_groups (id, organization_id, project_id, name, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, input.organizationId, projectId, name, input.now],
  );
  return { ok: true, group: { id, organizationId: input.organizationId, projectId, name } };
}

/** A workflow inside a client's group. It can be assigned to a project now or later. */
export async function createClientWorkflow(
  sql: Sql,
  input: {
    organizationId: string;
    groupId: string;
    name: string;
    templateId: string;
    projectId?: string | null;
    plan?: WorkflowTaskPlan | null;
    dueAt?: number | null;
    everyMs?: number | null;
    mcpServerIds?: string[] | null;
    now: number;
  },
): Promise<{ ok: true; workflow: { id: string; projectId: string | null; taskId: string | null } } | { ok: false; error: "invalid" | "missing" }> {
  const name = input.name.trim().slice(0, 120);
  const templateId = input.templateId.trim().slice(0, 120);
  if (!name || !templateId) return { ok: false, error: "invalid" };
  const schedule = scheduleOf(input);
  if (!schedule.ok) return { ok: false, error: "invalid" };
  const mcpServerIds = allowedMcpIds(input.mcpServerIds ?? []);
  if (!mcpServerIds) return { ok: false, error: "invalid" };
  const group = await sql.get<{ id: string; organization_id: string }>(
    "SELECT id, organization_id FROM workflow_groups WHERE id = ?",
    [input.groupId],
  );
  if (!group || group.organization_id !== input.organizationId) return { ok: false, error: "missing" };
  const projectId = input.projectId?.trim() || null;
  if (projectId && !(await projectInOrg(sql, input.organizationId, projectId))) return { ok: false, error: "missing" };
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO client_workflows (
       id, group_id, organization_id, project_id, name, template_id, last_execution_id, last_status, created_at, updated_at,
       next_run_at, every_ms, scheduled_at, mcp_server_ids
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.groupId,
      input.organizationId,
      projectId,
      name,
      templateId,
      input.now,
      input.now,
      schedule.nextRunAt,
      schedule.everyMs,
      schedule.scheduledAt,
      mcpServerIds.length > 0 ? JSON.stringify(mcpServerIds) : null,
    ],
  );
  const taskId = input.plan && input.plan.steps.length > 0 ? crypto.randomUUID() : null;
  if (taskId && input.plan) {
    await sql.run(
      `INSERT INTO tasks (
         id, project_id, organization_id, title, status, created_at, updated_at, stage, skills_json, round, created_by_kind
       ) VALUES (?, ?, ?, ?, 'todo', ?, ?, 'describe', ?, 1, 'agent')`,
      [taskId, projectId, input.organizationId, name, input.now, input.now, JSON.stringify(input.plan)],
    );
    await sql.run("UPDATE client_workflows SET task_id = ? WHERE id = ?", [taskId, id]);
  }
  return { ok: true, workflow: { id, projectId, taskId } };
}

/** Point one workflow at a project of the same client. */
export async function assignClientWorkflow(
  sql: Sql,
  input: { workflowId: string; projectId: string; now: number },
): Promise<{ ok: true; workflowId: string; projectId: string } | { ok: false; error: "missing" }> {
  const workflow = await sql.get<{ id: string; organization_id: string; task_id: string | null }>(
    "SELECT id, organization_id, task_id FROM client_workflows WHERE id = ?",
    [input.workflowId],
  );
  if (!workflow || !(await projectInOrg(sql, workflow.organization_id, input.projectId))) return { ok: false, error: "missing" };
  await sql.run("UPDATE client_workflows SET project_id = ?, updated_at = ? WHERE id = ?", [
    input.projectId,
    input.now,
    workflow.id,
  ]);
  if (workflow.task_id) {
    await sql.run("UPDATE tasks SET project_id = ?, updated_at = ? WHERE id = ?", [input.projectId, input.now, workflow.task_id]);
  }
  return { ok: true, workflowId: workflow.id, projectId: input.projectId };
}

/** Workflows for a client. A project filter includes workflows assigned to it and groups tied to it. */
export async function listClientWorkflows(sql: Sql, organizationId: string, projectId?: string | null): Promise<ClientWorkflow[]> {
  const project = projectId?.trim() || null;
  const rows = await sql.all<{
    id: string;
    group_id: string;
    organization_id: string;
    project_id: string | null;
    group_project_id: string | null;
    name: string;
    template_id: string;
    task_id: string | null;
    next_run_at: number | null;
    every_ms: number | null;
    mcp_server_ids: string | null;
    group_name: string;
  }>(
    `SELECT w.id, w.group_id, w.organization_id, w.project_id, g.project_id AS group_project_id,
            w.name, w.template_id, w.task_id, w.next_run_at, w.every_ms, w.mcp_server_ids, g.name AS group_name
     FROM client_workflows w
     JOIN workflow_groups g ON g.id = w.group_id
     WHERE w.organization_id = ?
       AND (? IS NULL OR w.project_id = ? OR g.project_id = ?)
     ORDER BY g.name, w.name`,
    [organizationId, project, project, project],
  );
  return rows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    groupProjectId: row.group_project_id,
    name: row.name,
    templateId: row.template_id,
    taskId: row.task_id,
    nextRunAt: row.next_run_at,
    everyMs: row.every_ms,
    mcpServerIds: storedMcpIds(row.mcp_server_ids) ?? [],
    groupName: row.group_name,
  }));
}

/** Start the workflow's template on the swarm for this client. */
export async function runClientWorkflow(input: {
  sql: Sql;
  workflowId: string;
  brief: string;
  origin: string;
  now: number;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}): Promise<{ ok: true; executionId: string; status: string; output: string } | { ok: false; error: "missing" | "invalid" }> {
  const brief = input.brief.trim();
  if (!brief || !input.origin.trim()) return { ok: false, error: "invalid" };
  const workflow = await input.sql.get<{ id: string; name: string; template_id: string; mcp_server_ids: string | null }>(
    "SELECT id, name, template_id, mcp_server_ids FROM client_workflows WHERE id = ?",
    [input.workflowId],
  );
  if (!workflow) return { ok: false, error: "missing" };
  const mcpServerIds = storedMcpIds(workflow.mcp_server_ids);
  const mcpServers = mcpServerIds ? mcpServersFor(mcpServerIds, input.origin) : null;
  if (!mcpServers) return { ok: false, error: "invalid" };
  try {
    const result = await runLeadSwarm({
      origin: input.origin,
      workflowId: `client-${workflow.id}`,
      brief,
      templateId: workflow.template_id,
      mcpServers,
      fetchImpl: input.fetchImpl,
      wait: input.wait,
    });
    await input.sql.run("UPDATE client_workflows SET last_execution_id = ?, last_status = ?, updated_at = ? WHERE id = ?", [
      result.executionId,
      result.status,
      input.now,
      workflow.id,
    ]);
    return { ok: true, ...result };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

export type DueClaim =
  | { ok: true; none: true }
  | {
      ok: true;
      none: false;
      workflowId: string;
      templateId: string;
      packName: string;
      executionId: string;
      status: string;
      output: string;
      more: boolean;
    }
  | { ok: false; error: "invalid" | "missing" };

/** Run the oldest workflow whose time has arrived. A failure leaves the due time so the next cycle retries. */
export async function claimDueWorkflow(input: {
  sql: Sql;
  organizationId: string;
  origin: string;
  now: number;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  store?: ObjectStore;
}): Promise<DueClaim> {
  if (!input.origin.trim()) return { ok: false, error: "invalid" };
  const row = await input.sql.get<{
    id: string;
    name: string;
    template_id: string;
    every_ms: number | null;
    org_name: string;
    website: string | null;
    industry: string | null;
    notes: string | null;
  }>(
    `SELECT w.id, w.name, w.template_id, w.every_ms, o.name AS org_name, o.website, o.industry, o.notes
     FROM client_workflows w
     JOIN organizations o ON o.id = w.organization_id
     WHERE w.organization_id = ?
       AND w.next_run_at IS NOT NULL
       AND w.next_run_at <= ?
     ORDER BY w.next_run_at, w.id
     LIMIT 1`,
    [input.organizationId, input.now],
  );
  if (!row) return { ok: true, none: true };
  const brief = [
    leadBrief({ name: row.org_name, website: row.website, packId: row.template_id }),
    row.industry ? `Industry: ${row.industry}` : "",
    row.notes ?? "",
    `Scheduled run of ${row.name}.`,
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
  const started = await runClientWorkflow({
    sql: input.sql,
    workflowId: row.id,
    brief,
    origin: input.origin,
    now: input.now,
    fetchImpl: input.fetchImpl,
    wait: input.wait,
  });
  await recordAgentRun(input.sql, {
    organizationId: input.organizationId,
    kind: "agent.swarm_run",
    body: started.ok ? started.output.slice(0, 500) || `${row.name} ${started.status}.` : "The swarm did not start.",
    status: started.ok ? started.status : "failed",
    data: {
      requestId: `due:${row.id}`,
      trigger: "due",
      packId: row.template_id,
      packName: row.name,
      executionId: started.ok ? started.executionId : "",
      workflowId: row.id,
    },
    now: input.now,
  });
  if (!started.ok) return started;
  if (input.store && started.status === "completed" && started.output.trim() && !started.output.includes("still going")) {
    await storeWorkflowOutput({
      sql: input.sql,
      store: input.store,
      organizationId: input.organizationId,
      files: [{ workflow: "swarm", run: started.executionId, node: "result", body: started.output }],
      now: input.now,
    });
    const space = await input.sql.get<{ id: string }>(
      "SELECT id FROM workspaces WHERE organization_id = ? AND status = 'active' ORDER BY opened_at LIMIT 1",
      [input.organizationId],
    );
    if (space) {
      const deliverableId = crypto.randomUUID();
      const title = `${row.name} for ${row.org_name}`.slice(0, 200);
      await input.sql.run(
        `INSERT INTO deliverables (
          id, organization_id, project_id, workspace_id, title, kind, status, version,
          source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at, updated_at, published_version
        ) VALUES (?, ?, NULL, ?, ?, 'document', 'draft', 1, NULL, NULL, NULL, 'agent', 'swarm', ?, ?, NULL)`,
        [deliverableId, input.organizationId, space.id, title, input.now, input.now],
      );
      await input.sql.run(
        `INSERT INTO deliverable_items (
          id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
        ) VALUES (?, ?, 1, NULL, 'file', NULL, 'result.md', ?, '[]', NULL, 'pending', 0)`,
        [crypto.randomUUID(), deliverableId, started.output],
      );
    }
  }
  const repeating = row.every_ms != null && row.every_ms >= MIN_SCHEDULE_MS;
  await input.sql.run("UPDATE client_workflows SET next_run_at = ?, updated_at = ? WHERE id = ?", [
    repeating ? input.now + row.every_ms! : null,
    input.now,
    row.id,
  ]);
  const rest = await input.sql.get<{ n: number }>(
    `SELECT count(*) AS n FROM client_workflows
     WHERE organization_id = ? AND id != ? AND next_run_at IS NOT NULL AND next_run_at <= ?`,
    [input.organizationId, row.id, input.now],
  );
  return {
    ok: true,
    none: false,
    workflowId: row.id,
    templateId: row.template_id,
    packName: row.name,
    executionId: started.executionId,
    status: started.status,
    output: started.output,
    more: (rest?.n ?? 0) > 0,
  };
}

function firstSkillPath(skills: string | null): string {
  if (!skills) return "";
  try {
    const parsed = JSON.parse(skills) as { steps?: { path?: unknown }[] };
    const path = parsed.steps?.[0]?.path;
    return typeof path === "string" ? path : "";
  } catch {
    return "";
  }
}

/** A skilled task that staff move to run becomes a due workflow on that same task. */
export async function scheduleTaskSwarm(
  sql: Sql,
  input: { taskId: string; now: number },
): Promise<
  | { ok: true; none: true }
  | { ok: true; none: false; workflowId: string; organizationId: string }
  | { ok: false; error: "missing" }
> {
  const task = await sql.get<{ id: string; organization_id: string | null; title: string; skills_json: string | null }>(
    "SELECT id, organization_id, title, skills_json FROM tasks WHERE id = ?",
    [input.taskId],
  );
  if (!task?.organization_id) return { ok: false, error: "missing" };
  const existing = await sql.get<{ id: string }>(
    "SELECT id FROM client_workflows WHERE task_id = ? ORDER BY created_at LIMIT 1",
    [task.id],
  );
  if (existing) {
    await sql.run(
      "UPDATE client_workflows SET next_run_at = ?, scheduled_at = COALESCE(scheduled_at, ?), updated_at = ? WHERE id = ?",
      [input.now, input.now, input.now, existing.id],
    );
    return { ok: true, none: false, workflowId: existing.id, organizationId: task.organization_id };
  }
  const templateId = packTemplateId(firstSkillPath(task.skills_json));
  if (!templateId) return { ok: true, none: true };
  const groupRow = await sql.get<{ id: string }>(
    "SELECT id FROM workflow_groups WHERE organization_id = ? ORDER BY created_at LIMIT 1",
    [task.organization_id],
  );
  const groupId = groupRow
    ? groupRow.id
    : await createWorkflowGroup(sql, { organizationId: task.organization_id, name: "Swarm", now: input.now }).then((created) =>
        created.ok ? created.group.id : "",
      );
  if (!groupId) return { ok: false, error: "missing" };
  const created = await createClientWorkflow(sql, {
    organizationId: task.organization_id,
    groupId,
    name: task.title,
    templateId,
    dueAt: input.now,
    now: input.now,
  });
  if (!created.ok) return { ok: false, error: "missing" };
  await sql.run("UPDATE client_workflows SET task_id = ? WHERE id = ?", [task.id, created.workflow.id]);
  return { ok: true, none: false, workflowId: created.workflow.id, organizationId: task.organization_id };
}
