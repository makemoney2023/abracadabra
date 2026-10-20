import { NextResponse } from "next/server";
import { normalizeDomain } from "@/db/crm";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { registerClientAgent } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/**
 * Client Services registers a client agent, or assigns it to a client. Bearer CLIENT_SERVICES_TOKEN.
 * Body: { agent_id, label?, client: { organization_id? | domain? | space_slug? }, space_id?, project_id?, rotate? }
 * The client must resolve to exactly one live organization. A token comes back once, on create or rotate.
 */
export async function POST(request: Request) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const agentId = typeof body?.agent_id === "string" ? body.agent_id : "";
  const client = body?.client && typeof body.client === "object" ? (body.client as Record<string, unknown>) : {};
  const sql = await openHandoffDb();
  await migrate(sql);
  let organizationId: string | null = null;
  let workspaceId = typeof body.space_id === "string" ? body.space_id.trim() || null : null;
  if (typeof client.organization_id === "string" && client.organization_id.trim()) {
    organizationId = client.organization_id.trim();
  } else if (typeof client.domain === "string" && client.domain.trim()) {
    const domain = normalizeDomain(client.domain);
    const rows = domain ? await sql.all<{ id: string }>("SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL", [domain]) : [];
    if (rows.length !== 1) return NextResponse.json({ error: "No single client has that domain." }, { status: 404 });
    organizationId = rows[0].id;
  } else if (typeof client.space_slug === "string" && client.space_slug.trim()) {
    const space = await sql.get<{ id: string; organization_id: string | null }>(
      "SELECT id, organization_id FROM workspaces WHERE slug = ? AND status = 'active'",
      [client.space_slug.trim().toLowerCase()],
    );
    if (!space?.organization_id) return NextResponse.json({ error: "No active space has that slug." }, { status: 404 });
    organizationId = space.organization_id;
    workspaceId = workspaceId ?? space.id;
  }
  if (!organizationId) return NextResponse.json({ error: "Name the client." }, { status: 400 });
  const result = await registerClientAgent(sql, {
    agentId,
    label: typeof body.label === "string" ? body.label : null,
    organizationId,
    workspaceId,
    projectId: typeof body.project_id === "string" ? body.project_id : null,
    rotate: body.rotate === true,
    actor: "client-services",
    now: Date.now(),
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json(
    { ok: true, created: result.created, agent_id: agentId.trim().toLowerCase(), organization_id: organizationId, space_id: workspaceId, token: result.token },
    { status: result.created ? 201 : 200 },
  );
}
