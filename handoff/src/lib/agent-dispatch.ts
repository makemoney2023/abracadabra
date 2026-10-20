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
