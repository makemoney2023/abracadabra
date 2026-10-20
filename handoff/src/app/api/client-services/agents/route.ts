import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { endAssignment, registerClientAgent, resolveClientRef } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/**
 * Client Services registers a client agent (or hire) and assigns it to a client. Bearer CLIENT_SERVICES_TOKEN.
 * Body: { agent_id, label?, client?: { organization_id | domain | space_slug }, space_id?, project_id?, role?: "lead" | "hire",
 *         rotate?, end?: true }
 * A client may have many agents, and an agent may serve many clients. end: true ends that one assignment.
 * A token comes back once, on create or rotate. It only files work, reads its clients' filed work, and reads granted skills.
 */
export async function POST(request: Request) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const agentId = typeof body?.agent_id === "string" ? body.agent_id.trim().toLowerCase() : "";
  const sql = await openHandoffDb();
  await migrate(sql);
  let organizationId: string | null = null;
  let workspaceId = typeof body.space_id === "string" ? body.space_id.trim() || null : null;
  if (body.client != null) {
    const client = await resolveClientRef(sql, body.client);
    if (!client.ok) return NextResponse.json({ error: client.message }, { status: client.status });
    organizationId = client.organizationId;
    workspaceId = workspaceId ?? client.spaceId;
  }
  if (body.end === true) {
    if (!organizationId) return NextResponse.json({ error: "Name the client." }, { status: 400 });
    const ended = await endAssignment(sql, { agentId, organizationId, actor: "client-services", now: Date.now() });
    return NextResponse.json({ ok: ended, ended }, { status: ended ? 200 : 404 });
  }
  const result = await registerClientAgent(sql, {
    agentId,
    label: typeof body.label === "string" ? body.label : null,
    organizationId,
    workspaceId,
    projectId: typeof body.project_id === "string" ? body.project_id : null,
    role: body.role === "hire" ? "hire" : "lead",
    rotate: body.rotate === true,
    actor: "client-services",
    now: Date.now(),
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json(
    { ok: true, created: result.created, agent_id: agentId, organization_id: organizationId, space_id: workspaceId, token: result.token },
    { status: result.created ? 201 : 200 },
  );
}
