import type { Sql } from "@/db/sql";
import { AGENT_MODES, type AgentPublishMode, type SocialActor } from "./social-policy";

export function defaultAgentPublishMode(): AgentPublishMode {
  return "draft";
}

/** Staff grant for how a connected agent may publish. Clients cannot raise this. */
export async function saveAgentPublishMode(
  sql: Sql,
  actor: SocialActor,
  organizationId: string,
  mode: AgentPublishMode,
  now: number,
): Promise<{ ok: true } | { ok: false; reasonCode: string }> {
  if (actor.kind !== "staff") return { ok: false, reasonCode: "role_denied" };
  if (!AGENT_MODES.includes(mode)) return { ok: false, reasonCode: "invalid" };
  await sql.run(
    `INSERT INTO social_agent_policies (organization_id, mode, capabilities_json, updated_by, updated_at)
     VALUES (?, ?, '{}', ?, ?)
     ON CONFLICT (organization_id) DO UPDATE SET mode = excluded.mode, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [organizationId, mode, actor.id, now],
  );
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, 'social.policy.updated', 'staff', ?, ?, ?, ?)`,
    [crypto.randomUUID(), organizationId, actor.id, "Updated agent publishing mode.", JSON.stringify({ mode }), now],
  );
  return { ok: true };
}

export async function getAgentPublishMode(sql: Sql, organizationId: string): Promise<AgentPublishMode> {
  const row = await sql.get<{ mode: string }>("SELECT mode FROM social_agent_policies WHERE organization_id = ?", [organizationId]);
  return AGENT_MODES.includes(row?.mode as AgentPublishMode) ? (row?.mode as AgentPublishMode) : defaultAgentPublishMode();
}
