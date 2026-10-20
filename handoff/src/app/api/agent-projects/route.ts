import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { createAgentProject, listAgentProjects } from "@/lib/agent-projects";
import { agentForToken } from "@/lib/agent-work-filing";

export const dynamic = "force-dynamic";

function clientRef(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const client = value.trim();
  if (!client) return null;
  return client.includes(".") ? { domain: client } : /^[0-9a-f-]{36}$/.test(client) ? { organization_id: client } : { space_slug: client };
}

/**
 * Projects of this agent's clients, open first, each with its space. Bearer agent token.
 * ?client= (org id, domain, or space slug) narrows to one client. ?closed=1 also lists done and archived projects.
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const result = await listAgentProjects(sql, agent, { client: clientRef(params.get("client")), includeClosed: params.get("closed") === "1" });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}

/**
 * The client's lead agent opens a project. Bearer agent token. Body: { name, description?, client? }
 * client: org id, domain, or space slug (string), or { organization_id | domain | space_slug }; optional with one client.
 * The project gets its own space (or the client's one unlinked space). Same name (any case): the existing project,
 * created: false. Hires get 403. 409 past 20 open projects.
 */
export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const result = await createAgentProject(sql, agent, {
    client: clientRef(body?.client),
    name: typeof body?.name === "string" ? body.name : "",
    description: typeof body?.description === "string" ? body.description : null,
    now: Date.now(),
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
}
