import type { Sql } from "@/db/sql";

/**
 * Function agents (engineering, SEO, creative, social, and later ones) are client_agents rows with kind = 'function'.
 * Every client gets every live function agent as a hire by default, and a new function agent or a new client is
 * covered automatically. Client lead agents read GET /api/agent-agents to pick which one a card goes to.
 *
 * The writes are plain INSERT ... SELECT statements that decide eligibility inside SQL. That matters in two ways:
 * they work unchanged inside the d1Sql transaction buffer (where reads cannot see the buffered writes), and they
 * are idempotent, so calling them twice, or racing, adds nothing the second time.
 */

export type FunctionAgentProfile = { agentId: string; label: string; function: string; description: string };

/**
 * A client is a live organization of kind client that is not internal, or any live organization that already has a
 * live client agent (a lead was put there on purpose, so it needs the function agents too). Leads, past clients,
 * partners and test organizations without a client agent are left out, so function agents never see their data.
 */
const ELIGIBLE_ORG = `o.archived_at IS NULL AND ((o.kind = 'client' AND o.is_internal = 0) OR EXISTS (
    SELECT 1 FROM agent_assignments l JOIN client_agents lc ON lc.id = l.agent_id
    WHERE l.organization_id = o.id AND l.ended_at IS NULL AND lc.kind = 'client' AND lc.revoked_at IS NULL))`;

/**
 * A pair with any assignment row, live or ended, is never touched. A live one is already done. An ended one was
 * ended by staff on purpose (or by Client Services), and automatic assignment must not undo that. To put an agent
 * back, assign it explicitly (POST /api/client-services/agents with client) or from the Agents page.
 */
const NO_ROW_YET = "NOT EXISTS (SELECT 1 FROM agent_assignments x WHERE x.agent_id = a.id AND x.organization_id = o.id)";

const WHO = "a.kind = 'function' AND a.revoked_at IS NULL";

type Write = { statement: string; params: readonly unknown[] };

function assignmentWrites(scope: "agent" | "organization", id: string, now: number): Write[] {
  const filter = scope === "agent" ? "a.id = ?" : "o.id = ?";
  const from = `FROM client_agents a CROSS JOIN organizations o WHERE ${WHO} AND ${filter} AND ${ELIGIBLE_ORG} AND ${NO_ROW_YET}`;
  return [
    // The timeline entry first: once the assignment row exists, NO_ROW_YET is false for the pair.
    {
      statement: `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
        SELECT lower(hex(randomblob(16))), o.id, 'client_agent.assigned', 'system', 'function-agents',
               'Function agent ' || a.id || ' assigned as hire (default for every client).',
               '{"agent_id":"' || a.id || '","role":"hire","auto":true}', ?
        ${from}`,
      params: [now, id],
    },
    {
      statement: `INSERT OR IGNORE INTO agent_assignments (id, agent_id, organization_id, workspace_id, project_id, role, assigned_by, assigned_at, ended_at)
        SELECT lower(hex(randomblob(16))), a.id, o.id, NULL, NULL, 'hire', 'auto:function-agent', ?, NULL
        ${from}`,
      params: [now, id],
    },
  ];
}

/** Writes that give one client every live function agent. Safe inside a transaction, and safe to repeat. */
export function functionAgentsForClientWrites(organizationId: string, now: number): Write[] {
  return assignmentWrites("organization", organizationId, now);
}

/** Writes that give one function agent to every client that does not have it yet. Safe to repeat. */
export function functionAgentToAllClientsWrites(agentId: string, now: number): Write[] {
  return assignmentWrites("agent", agentId, now);
}

/** Call after a client is created or becomes a client (or stops being internal): it gets every function agent. */
export async function assignFunctionAgentsToClient(sql: Sql, organizationId: string, now: number): Promise<void> {
  for (const write of functionAgentsForClientWrites(organizationId, now)) await sql.run(write.statement, write.params);
}

/** Function agents on this client, live ones only, for a client agent choosing who gets a card. */
export async function listFunctionAgentsOnClient(sql: Sql, organizationId: string): Promise<FunctionAgentProfile[]> {
  const rows = await sql.all<{ id: string; label: string; function_label: string | null; description: string | null }>(
    `SELECT a.id, a.label, a.function_label, a.description
     FROM agent_assignments s JOIN client_agents a ON a.id = s.agent_id
     WHERE s.organization_id = ? AND s.ended_at IS NULL AND a.kind = 'function' AND a.revoked_at IS NULL
     ORDER BY COALESCE(a.function_label, a.label), a.id`,
    [organizationId],
  );
  return rows.map((row) => ({
    agentId: row.id,
    label: row.label,
    function: row.function_label ?? row.label,
    description: row.description ?? "",
  }));
}

/** Live assignments a function agent holds. Used to report how many clients a registration reached. */
export async function countLiveClients(sql: Sql, agentId: string): Promise<number> {
  const row = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM agent_assignments WHERE agent_id = ? AND ended_at IS NULL", [agentId]);
  return Number(row?.n ?? 0);
}
