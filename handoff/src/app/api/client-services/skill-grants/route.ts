import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { grantSkills, listSkillGrants, revokeSkills } from "@/lib/agent-skills";
import { resolveClientRef } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";
import { staffFromRequest } from "@/lib/staff-request";

export const dynamic = "force-dynamic";

/**
 * Lists skill grants. Bearer CLIENT_SERVICES_TOKEN, or an HQ staff chat token or session (live staff only). Read-only.
 * ?agent_id= one agent's own grants; ?client= a client (organization id, domain, or space slug) and its grants for every
 * agent on it; ?include_revoked=1 adds revoked grants. Returns { grants: [{ id, scope, agent_id, organization_id,
 * organization_name, prefix, granted_by, granted_at, revoked_at }] }, newest first.
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  if (!clientServicesAuthorized(request)) {
    const staff = await staffFromRequest(sql, request, Date.now());
    if (!staff.ok) return NextResponse.json({ error: "Unauthorized." }, { status: staff.status });
  }
  const params = new URL(request.url).searchParams;
  const client = params.get("client")?.trim();
  let organizationId: string | null = null;
  if (client) {
    const ref = /^[0-9a-f-]{36}$/.test(client) ? { organization_id: client } : client.includes(".") ? { domain: client } : { space_slug: client };
    const resolved = await resolveClientRef(sql, ref);
    if (!resolved.ok) return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    organizationId = resolved.organizationId;
  }
  const grants = await listSkillGrants(sql, {
    agentId: params.get("agent_id"),
    organizationId,
    includeRevoked: params.get("include_revoked") === "1",
  });
  return NextResponse.json({ grants });
}

/**
 * Client Services grants skill packs to an agent or to a client (every agent assigned to it). Bearer CLIENT_SERVICES_TOKEN.
 * Body: { agent_id?, client?: { organization_id | domain | space_slug }, prefixes: ["community/marketingskills/", ...], revoke?: true }
 */
export async function POST(request: Request) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const prefixes = Array.isArray(body?.prefixes) ? body.prefixes.filter((item): item is string => typeof item === "string") : [];
  const sql = await openHandoffDb();
  await migrate(sql);
  let organizationId: string | null = null;
  if (body.client != null) {
    const client = await resolveClientRef(sql, body.client);
    if (!client.ok) return NextResponse.json({ error: client.message }, { status: client.status });
    organizationId = client.organizationId;
  }
  const agentId = typeof body.agent_id === "string" ? body.agent_id : null;
  if (body.revoke === true) {
    const revoked = await revokeSkills(sql, { agentId, organizationId, prefixes, now: Date.now() });
    return NextResponse.json({ ok: true, revoked });
  }
  const result = await grantSkills(sql, { agentId, organizationId, prefixes, actor: "client-services", now: Date.now() });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json(result);
}
