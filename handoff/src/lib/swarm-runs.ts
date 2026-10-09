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

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE");
}

type SwarmRunPatch = {
  status: "running" | "completed" | "failed" | "not_started";
  name: string;
  trigger: string;
  finishedAt: number | null;
  projectId: string | null;
  workflowId: string | null;
  swarmWorkflowId: string | null;
  templateId: string | null;
};

async function updateSwarmRun(sql: Sql, id: string, patch: SwarmRunPatch): Promise<void> {
  await sql.run(
    `UPDATE swarm_runs
     SET status = ?, name = ?, trigger = ?, finished_at = ?,
         project_id = COALESCE(project_id, ?),
         workflow_id = COALESCE(workflow_id, ?),
         swarm_workflow_id = COALESCE(swarm_workflow_id, ?),
         template_id = COALESCE(template_id, ?)
     WHERE id = ?`,
    [
      patch.status,
      patch.name,
      patch.trigger,
      patch.finishedAt,
      patch.projectId,
      patch.workflowId,
      patch.swarmWorkflowId,
      patch.templateId,
      id,
    ],
  );
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
  const patch: SwarmRunPatch = {
    status,
    name,
    trigger,
    finishedAt,
    projectId,
    workflowId: input.workflowId?.trim() || null,
    swarmWorkflowId: input.swarmWorkflowId?.trim() || null,
    templateId: input.templateId?.trim() || null,
  };
  if (executionId) {
    const existing = await sql.get<{ id: string; project_id: string | null }>(
      "SELECT id, project_id FROM swarm_runs WHERE execution_id = ?",
      [executionId],
    );
    if (existing) {
      await updateSwarmRun(sql, existing.id, patch);
      return { id: existing.id, projectId: existing.project_id ?? projectId };
    }
  }
  const id = crypto.randomUUID();
  try {
    await sql.run(
      `INSERT INTO swarm_runs (
        id, organization_id, project_id, workflow_id, swarm_workflow_id, execution_id,
        template_id, name, status, trigger, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(execution_id) WHERE execution_id IS NOT NULL AND length(execution_id) > 0 DO UPDATE SET
        status = excluded.status,
        name = excluded.name,
        trigger = excluded.trigger,
        finished_at = excluded.finished_at,
        project_id = COALESCE(swarm_runs.project_id, excluded.project_id),
        workflow_id = COALESCE(swarm_runs.workflow_id, excluded.workflow_id),
        swarm_workflow_id = COALESCE(swarm_runs.swarm_workflow_id, excluded.swarm_workflow_id),
        template_id = COALESCE(swarm_runs.template_id, excluded.template_id)`,
      [
        id,
        input.organizationId,
        patch.projectId,
        patch.workflowId,
        patch.swarmWorkflowId,
        executionId || null,
        patch.templateId,
        patch.name,
        patch.status,
        patch.trigger,
        input.now,
        patch.finishedAt,
      ],
    );
  } catch (error) {
    if (!executionId || !isUnique(error)) throw error;
    const raced = await sql.get<{ id: string; project_id: string | null }>(
      "SELECT id, project_id FROM swarm_runs WHERE execution_id = ?",
      [executionId],
    );
    if (!raced) throw error;
    await updateSwarmRun(sql, raced.id, patch);
    return { id: raced.id, projectId: raced.project_id ?? projectId };
  }
  if (!executionId) return { id, projectId };
  const stored = await sql.get<{ id: string; project_id: string | null }>(
    "SELECT id, project_id FROM swarm_runs WHERE execution_id = ?",
    [executionId],
  );
  if (!stored) return { id, projectId };
  return { id: stored.id, projectId: stored.project_id ?? projectId };
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

export async function backfillSwarmRuns(sql: Sql, now: number): Promise<number> {
  const table = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'swarm_runs'",
  );
  if (!table) return 0;
  const activities = await sql.all<{
    organization_id: string;
    created_at: number;
    data_json: string;
    body: string | null;
  }>(
    `SELECT organization_id, created_at, data_json, body FROM activities
     WHERE kind = 'agent.swarm_run' AND organization_id IS NOT NULL
     ORDER BY created_at ASC, id ASC`,
  );
  let inserted = 0;
  for (const activity of activities) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(activity.data_json) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!data || typeof data !== "object") continue;
    const executionId = typeof data.executionId === "string" ? data.executionId.trim() : "";
    if (!executionId) continue;
    const before = await sql.get<{ id: string }>("SELECT id FROM swarm_runs WHERE execution_id = ?", [executionId]);
    const status = typeof data.status === "string" ? data.status : "completed";
    await saveSwarmRun(sql, {
      organizationId: activity.organization_id,
      workflowId: typeof data.workflowId === "string" ? data.workflowId : null,
      swarmWorkflowId: typeof data.swarmWorkflowId === "string" ? data.swarmWorkflowId : null,
      executionId,
      templateId: typeof data.packId === "string" ? data.packId : null,
      name: typeof data.packName === "string" ? data.packName : activity.body || "Swarm",
      status,
      trigger: typeof data.trigger === "string" ? data.trigger : "lead_created",
      now: activity.created_at,
    });
    if (!before) inserted += 1;
  }
  const workflows = await sql.all<{
    id: string;
    organization_id: string;
    project_id: string | null;
    name: string;
    template_id: string;
    last_execution_id: string | null;
    last_status: string | null;
    updated_at: number;
  }>(
    `SELECT id, organization_id, project_id, name, template_id, last_execution_id, last_status, updated_at
     FROM client_workflows WHERE last_execution_id IS NOT NULL AND length(last_execution_id) > 0`,
  );
  for (const workflow of workflows) {
    const executionId = workflow.last_execution_id?.trim() ?? "";
    if (!executionId) continue;
    const before = await sql.get<{ id: string }>("SELECT id FROM swarm_runs WHERE execution_id = ?", [executionId]);
    if (before) continue;
    await saveSwarmRun(sql, {
      organizationId: workflow.organization_id,
      projectId: workflow.project_id,
      workflowId: workflow.id,
      swarmWorkflowId: `client-${workflow.id}`,
      executionId,
      templateId: workflow.template_id,
      name: workflow.name,
      status: workflow.last_status || "running",
      trigger: "due",
      now: workflow.updated_at || now,
    });
    inserted += 1;
  }
  return inserted;
}
