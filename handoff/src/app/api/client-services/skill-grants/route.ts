import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { grantSkills, revokeSkills } from "@/lib/agent-skills";
import { resolveClientRef } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

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
