import type { Sql } from "@/db/sql";
import type { SocialCapability } from "./social-policy";

/**
 * Per-agent social publishing permission (migration 0051). A hire, which is what every function agent is on a client,
 * may schedule or publish social posts only when staff or Client Services granted it here. No row means no.
 * Client lead agents are not affected; the client's publishing mode still governs them.
 */
export type AgentSocialPermission = {
  agentId: string;
  organizationId: string;
  canSchedule: boolean;
  canPublishNow: boolean;
  platforms: string[];
};

export const DEFAULT_AGENT_PLATFORMS = ["linkedin"];

/** The capabilities a hire loses unless it was granted them. */
const SCHEDULING_CAPS: SocialCapability[] = ["social.schedule", "social.schedule.manage", "social.publish_now", "social.failure.retry"];

function platformList(raw: string | null | undefined): string[] {
  const list = (raw ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? [...new Set(list)] : [...DEFAULT_AGENT_PLATFORMS];
}

export async function getAgentSocialPermission(sql: Sql, agentId: string, organizationId: string): Promise<AgentSocialPermission | null> {
  const row = await sql.get<{ can_schedule: number; can_publish_now: number; platforms: string }>(
    "SELECT can_schedule, can_publish_now, platforms FROM agent_social_permissions WHERE agent_id = ? AND organization_id = ?",
    [agentId, organizationId],
  );
  if (!row) return null;
  return {
    agentId,
    organizationId,
    canSchedule: row.can_schedule === 1,
    canPublishNow: row.can_schedule === 1 && row.can_publish_now === 1,
    platforms: platformList(row.platforms),
  };
}

/**
 * What the policy evaluator should add for this agent. A lead is left alone (`platforms: null` means no network limit).
 * A hire with no permission loses every scheduling capability, so a plan is denied as `capability_revoked`. A hire
 * with can_schedule keeps schedule, reschedule, cancel and retry requests; publish-now only comes with can_publish_now.
 */
export function permissionEffect(
  role: "lead" | "hire",
  permission: AgentSocialPermission | null,
): { grant: SocialCapability[]; revoke: SocialCapability[]; platforms: string[] | null } {
  if (role === "lead") return { grant: [], revoke: [], platforms: null };
  if (!permission || !permission.canSchedule) return { grant: [], revoke: [...SCHEDULING_CAPS], platforms: permission?.platforms ?? [...DEFAULT_AGENT_PLATFORMS] };
  const grant: SocialCapability[] = permission.canPublishNow ? ["social.publish_now"] : [];
  const revoke: SocialCapability[] = permission.canPublishNow ? [] : ["social.publish_now"];
  return { grant, revoke, platforms: permission.platforms };
}

/** Staff or Client Services turn an agent on (or off) for one client. Writes an audit row on the client timeline. */
export async function setAgentSocialPermission(
  sql: Sql,
  input: {
    by: { kind: "staff" | "client_services"; id: string };
    agentId: string;
    organizationId: string;
    canSchedule: boolean;
    canPublishNow?: boolean;
    platforms?: string[];
    now: number;
  },
): Promise<{ ok: true; permission: AgentSocialPermission } | { ok: false; reasonCode: string }> {
  const agent = await sql.get<{ id: string }>("SELECT id FROM client_agents WHERE id = ? AND revoked_at IS NULL", [input.agentId]);
  if (!agent) return { ok: false, reasonCode: "unknown_agent" };
  const assigned = await sql.get<{ id: string }>(
    "SELECT id FROM agent_assignments WHERE agent_id = ? AND organization_id = ? AND ended_at IS NULL",
    [input.agentId, input.organizationId],
  );
  if (!assigned) return { ok: false, reasonCode: "not_assigned" };
  const platforms = platformList((input.platforms ?? DEFAULT_AGENT_PLATFORMS).join(","));
  const canPublishNow = input.canSchedule && input.canPublishNow === true;
  await sql.run(
    `INSERT INTO agent_social_permissions (agent_id, organization_id, can_schedule, can_publish_now, platforms, granted_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (agent_id, organization_id) DO UPDATE SET can_schedule = excluded.can_schedule,
       can_publish_now = excluded.can_publish_now, platforms = excluded.platforms, granted_by = excluded.granted_by,
       updated_at = excluded.updated_at`,
    [input.agentId, input.organizationId, input.canSchedule ? 1 : 0, canPublishNow ? 1 : 0, platforms.join(","), `${input.by.kind}:${input.by.id}`, input.now],
  );
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, 'social.agent.permission.updated', ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.organizationId,
      input.by.kind === "staff" ? "staff" : "system",
      input.by.id,
      `Set social publishing permission for ${input.agentId}.`,
      JSON.stringify({ agentId: input.agentId, canSchedule: input.canSchedule, canPublishNow, platforms }),
      input.now,
    ],
  );
  return { ok: true, permission: { agentId: input.agentId, organizationId: input.organizationId, canSchedule: input.canSchedule, canPublishNow, platforms } };
}

