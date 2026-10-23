import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { endAssignment, registerClientAgent, resolveClientRef } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";
import { countLiveClients } from "@/lib/function-agents";

export const dynamic = "force-dynamic";

/**
 * Client Services registers a client agent (or hire) and assigns it to a client. Bearer CLIENT_SERVICES_TOKEN.
 * Body: { agent_id, label?, client?: { organization_id | domain | space_slug }, space_id?, project_id?, role?: "lead" | "hire",
 *         rotate?, end?: true }
 * A client may have many agents, and an agent may serve many clients. end: true ends that one assignment.
 * function: true makes it a function agent (engineering, SEO, creative, social, ...): a hire on every client, now and for
 * every client created later. It needs function_label (short name) and description (what it does and when to choose it,
 * shown to client agents at GET /api/agent-agents). It is never a lead. Posting it again (same agent_id) adds it to any client it
 * is missing from, except one where its assignment was ended on purpose (end: true). function: false makes it an ordinary agent again
 * and keeps the assignments it has. The response carries kind and, for a function agent, clients (how many it now serves).
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
  if (body.function != null && typeof body.function !== "boolean") return NextResponse.json({ error: "function must be true or false." }, { status: 400 });
  for (const key of ["function_label", "description"]) {
    if (body[key] != null && typeof body[key] !== "string") return NextResponse.json({ error: `${key} must be text.` }, { status: 400 });
  }
  const known = await sql.get<{ kind: string; function_label: string | null; description: string | null }>(
    "SELECT kind, function_label, description FROM client_agents WHERE id = ?",
    [agentId],
  );
  if (body.function === true) {
    const label = typeof body.function_label === "string" ? body.function_label.trim() : (known?.function_label ?? "");
    const about = typeof body.description === "string" ? body.description.trim() : (known?.description ?? "");
    if (!label || !about) {
      return NextResponse.json({ error: "A function agent needs function_label and description, so client agents can choose it." }, { status: 400 });
    }
  }
  const result = await registerClientAgent(sql, {
    agentId,
    label: typeof body.label === "string" ? body.label : null,
    organizationId,
    workspaceId,
    projectId: typeof body.project_id === "string" ? body.project_id : null,
    role: body.role === "hire" ? "hire" : body.role === "lead" ? "lead" : undefined,
    rotate: body.rotate === true,
    kind: body.function === true ? "function" : body.function === false ? "client" : undefined,
    functionLabel: typeof body.function_label === "string" ? body.function_label : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    actor: "client-services",
    now: Date.now(),
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  const kind = body.function === true || (body.function == null && known?.kind === "function") ? "function" : "client";
  return NextResponse.json(
    {
      ok: true,
      created: result.created,
      agent_id: agentId,
      kind,
      ...(kind === "function" ? { clients: await countLiveClients(sql, agentId) } : {}),
      organization_id: organizationId,
      space_id: workspaceId,
      token: result.token,
    },
    { status: result.created ? 201 : 200 },
  );
}
