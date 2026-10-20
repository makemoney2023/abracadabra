import type { Sql } from "@/db/sql";
import type { AgentPrincipal } from "@/lib/agent-work-filing";

export type DispatchReason = "build" | "run" | "changes";

/** The client's lead agent: the earliest live lead assignment whose token is not revoked. */
export async function leadAgentFor(sql: Sql, organizationId: string): Promise<string | null> {
  const row = await sql.get<{ agent_id: string }>(
    `SELECT a.agent_id FROM agent_assignments a JOIN client_agents c ON c.id = a.agent_id
     WHERE a.organization_id = ? AND a.ended_at IS NULL AND a.role = 'lead' AND c.revoked_at IS NULL
     ORDER BY a.assigned_at LIMIT 1`,
    [organizationId],
  );
  return row?.agent_id ?? null;
}

/**
 * Hands one task to the client's lead agent (AGENT_MODE=agents). Logged as client_agent.dispatch, which the
 * Client Services updates feed carries; the lead agent also sees it with GET /api/agent-work?dispatches=1.
 * With no lead agent the entry says so, and Client Services assigns one.
 */
export async function dispatchToLeadAgent(
  sql: Sql,
  input: {
    organizationId: string;
    projectId: string | null;
    taskId: string;
    title: string;
    reason: DispatchReason;
    deliverableId?: string | null;
    note?: string | null;
    actor: { kind: "staff" | "agent" | "system"; id: string };
    now: number;
  },
): Promise<{ leadAgentId: string | null; activityId: string }> {
  const leadAgentId = await leadAgentFor(sql, input.organizationId);
  const space = input.projectId
    ? await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE project_id = ? AND status = 'active' LIMIT 1", [input.projectId])
    : undefined;
  const what = input.reason === "changes" ? "Changes requested" : input.reason === "build" ? "Build" : "Run";
  const body = leadAgentId
    ? `${what}: "${input.title}" handed to ${leadAgentId}.`
    : `${what}: "${input.title}" needs a lead agent. Assign one to this client.`;
  const activityId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, ?, 'client_agent.dispatch', ?, ?, ?, ?, ?)`,
    [
      activityId,
      input.organizationId,
      input.projectId,
      space?.id ?? null,
      input.actor.kind,
      input.actor.id,
      body.slice(0, 500),
      JSON.stringify({
        task_id: input.taskId,
        deliverable_id: input.deliverableId ?? null,
        reason: input.reason,
        to: leadAgentId,
        note: input.note ?? null,
      }),
      input.now,
    ],
  );
  return { leadAgentId, activityId };
}

/**
 * AGENT_MODE=agents: hand the client's lead agent every open task already sitting in build or run (not in Review)
 * whose latest dispatch did not go to that lead, e.g. tasks moved before any lead was assigned. Runs on lead
 * assignment and from the staff button. Returns the task ids handed over.
 */
export async function handOverWaitingTasks(
  sql: Sql,
  input: { organizationId: string; actor: { kind: "staff" | "agent" | "system"; id: string }; now: number },
): Promise<{ leadAgentId: string | null; taskIds: string[] }> {
  const leadAgentId = await leadAgentFor(sql, input.organizationId);
  if (!leadAgentId) return { leadAgentId: null, taskIds: [] };
  const rows = await sql.all<{ id: string; title: string; stage: string; project_id: string | null; deliverable_id: string | null; last_to: string | null }>(
    `SELECT t.id, t.title, t.stage, t.project_id, t.deliverable_id,
            (SELECT json_extract(a.data_json, '$.to') FROM activities a
             WHERE a.kind = 'client_agent.dispatch' AND a.organization_id = t.organization_id
               AND json_extract(a.data_json, '$.task_id') = t.id
             ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) AS last_to
     FROM tasks t
     WHERE t.organization_id = ? AND t.stage IN ('build', 'run') AND t.status != 'done' AND t.review_requested_at IS NULL
     ORDER BY t.position, t.created_at, t.id`,
    [input.organizationId],
  );
  const taskIds: string[] = [];
  for (const row of rows) {
    if (row.last_to === leadAgentId) continue;
    await dispatchToLeadAgent(sql, {
      organizationId: input.organizationId,
      projectId: row.project_id,
      taskId: row.id,
      title: row.title,
      reason: row.stage === "run" ? "run" : "build",
      deliverableId: row.deliverable_id,
      note: "Handed over: this task was already waiting in this column when the lead agent was assigned.",
      actor: input.actor,
      now: input.now,
    });
    taskIds.push(row.id);
  }
  return { leadAgentId, taskIds };
}

export type DispatchRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  task_id: string | null;
  deliverable_id: string | null;
  reason: string;
  title: string;
  note: string | null;
  created_at: string;
};

/** Dispatches addressed to this agent on clients it is still assigned to. */
export async function listAgentDispatches(sql: Sql, agent: AgentPrincipal, since = 0): Promise<DispatchRow[]> {
  const orgs = agent.assignments.map((row) => row.organizationId);
  if (orgs.length === 0) return [];
  const marks = orgs.map(() => "?").join(", ");
  const rows = await sql.all<{ id: string; organization_id: string; project_id: string | null; body: string; data_json: string; created_at: number }>(
    `SELECT id, organization_id, project_id, body, data_json, created_at FROM activities
     WHERE kind = 'client_agent.dispatch' AND organization_id IN (${marks}) AND created_at > ?
       AND json_extract(data_json, '$.to') = ?
     ORDER BY created_at DESC LIMIT 100`,
    [...orgs, since, agent.agentId],
  );
  return rows.map((row) => {
    const data = JSON.parse(row.data_json) as Record<string, unknown>;
    return {
      id: row.id,
      organization_id: row.organization_id,
      project_id: row.project_id,
      task_id: typeof data.task_id === "string" ? data.task_id : null,
      deliverable_id: typeof data.deliverable_id === "string" ? data.deliverable_id : null,
      reason: String(data.reason ?? ""),
      title: row.body,
      note: typeof data.note === "string" ? data.note : null,
      created_at: new Date(row.created_at).toISOString(),
    };
  });
}
