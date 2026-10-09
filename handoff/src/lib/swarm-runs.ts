import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";

const STATUSES = new Set(["running", "completed", "failed", "not_started"]);
const OPEN = new Set(["planned", "active", "waiting_on_client"]);

export type SwarmRunRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  workflow_id: string | null;
  swarm_workflow_id: string | null;
  execution_id: string | null;
  template_id: string | null;
  name: string;
  status: string;
  trigger: string;
  started_at: number;
  finished_at: number | null;
};

export type SaveSwarmRunInput = {
  organizationId: string;
  projectId?: string | null;
  workflowId?: string | null;
  swarmWorkflowId?: string | null;
  executionId?: string | null;
  templateId?: string | null;
  name: string;
  status: string;
  trigger: string;
  now: number;
};

function storedStatus(status: string): "running" | "completed" | "failed" | "not_started" {
  return STATUSES.has(status) ? (status as "running" | "completed" | "failed" | "not_started") : "failed";
}

function staff(caller: Caller): boolean {
  return caller.staff !== null;
}

async function projectInOrg(sql: Sql, organizationId: string, projectId: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM projects WHERE id = ? AND organization_id = ?",
    [projectId, organizationId],
  );
  return Boolean(row);
}

async function resolveProject(sql: Sql, input: SaveSwarmRunInput): Promise<string | null> {
  const named = input.projectId?.trim() ?? "";
  if (named && (await projectInOrg(sql, input.organizationId, named))) return named;
  const workflowId = input.workflowId?.trim() ?? "";
  if (workflowId) {
    const workflow = await sql.get<{ project_id: string | null; organization_id: string }>(
      "SELECT project_id, organization_id FROM client_workflows WHERE id = ?",
      [workflowId],
    );
    if (workflow?.organization_id === input.organizationId && workflow.project_id) return workflow.project_id;
  }
  const open = await sql.all<{ id: string; status: string }>(
    "SELECT id, status FROM projects WHERE organization_id = ?",
    [input.organizationId],
  );
  const usable = open.filter((row) => OPEN.has(row.status));
  return usable.length === 1 ? usable[0].id : null;
}

export async function saveSwarmRun(
  sql: Sql,
  input: SaveSwarmRunInput,
): Promise<{ id: string; projectId: string | null }> {
  const status = storedStatus(input.status);
  const executionId = input.executionId?.trim() ?? "";
  const name = input.name.trim().slice(0, 120) || "Swarm";
  const trigger = input.trigger.trim().slice(0, 40) || "lead_created";
  const finishedAt = status === "completed" || status === "failed" ? input.now : null;
  const projectId = await resolveProject(sql, input);
  if (executionId) {
    const existing = await sql.get<{ id: string; project_id: string | null }>(
      "SELECT id, project_id FROM swarm_runs WHERE execution_id = ?",
      [executionId],
    );
    if (existing) {
      await sql.run(
        `UPDATE swarm_runs
         SET status = ?, name = ?, trigger = ?, finished_at = ?,
             project_id = COALESCE(project_id, ?),
             workflow_id = COALESCE(workflow_id, ?),
             swarm_workflow_id = COALESCE(swarm_workflow_id, ?),
             template_id = COALESCE(template_id, ?)
         WHERE id = ?`,
        [
          status,
          name,
          trigger,
          finishedAt,
          projectId,
          input.workflowId?.trim() || null,
          input.swarmWorkflowId?.trim() || null,
          input.templateId?.trim() || null,
          existing.id,
        ],
      );
      return { id: existing.id, projectId: existing.project_id ?? projectId };
    }
  }
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO swarm_runs (
      id, organization_id, project_id, workflow_id, swarm_workflow_id, execution_id,
      template_id, name, status, trigger, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.organizationId,
      projectId,
      input.workflowId?.trim() || null,
      input.swarmWorkflowId?.trim() || null,
      executionId || null,
      input.templateId?.trim() || null,
      name,
      status,
      trigger,
      input.now,
      finishedAt,
    ],
  );
  return { id, projectId };
}

const COLUMNS =
  "id, organization_id, project_id, workflow_id, swarm_workflow_id, execution_id, template_id, name, status, trigger, started_at, finished_at";

export async function listProjectSwarmRuns(sql: Sql, caller: Caller, projectId: string): Promise<SwarmRunRow[]> {
  if (!staff(caller)) return [];
  return sql.all<SwarmRunRow>(
    `SELECT ${COLUMNS} FROM swarm_runs WHERE project_id = ? ORDER BY started_at DESC, id DESC`,
    [projectId],
  );
}

export async function listUnassignedSwarmRuns(
  sql: Sql,
  caller: Caller,
  organizationId: string,
): Promise<SwarmRunRow[]> {
  if (!staff(caller)) return [];
  return sql.all<SwarmRunRow>(
    `SELECT ${COLUMNS} FROM swarm_runs
     WHERE organization_id = ? AND project_id IS NULL
     ORDER BY started_at DESC, id DESC`,
    [organizationId],
  );
}

export async function assignSwarmRun(
  sql: Sql,
  caller: Caller,
  input: { runId: string; projectId: string },
  _now: number,
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "missing" }> {
  void _now;
  if (!staff(caller)) return { ok: false, error: "forbidden" };
  const run = await sql.get<{ organization_id: string }>("SELECT organization_id FROM swarm_runs WHERE id = ?", [
    input.runId,
  ]);
  if (!run) return { ok: false, error: "missing" };
  if (!(await projectInOrg(sql, run.organization_id, input.projectId))) return { ok: false, error: "missing" };
  await sql.run("UPDATE swarm_runs SET project_id = ? WHERE id = ?", [input.projectId, input.runId]);
  return { ok: true };
}
