import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { listAgentBoard } from "@/lib/agent-board";
import { agentForToken } from "@/lib/agent-work-filing";

export const dynamic = "force-dynamic";

/** Board tasks for this agent's clients. Bearer agent token. ?client= (org id, domain, or space slug) &project_id= */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const client = params.get("client")?.trim();
  const ref = client ? (client.includes(".") ? { domain: client } : /^[0-9a-f-]{36}$/.test(client) ? { organization_id: client } : { space_slug: client }) : null;
  const result = await listAgentBoard(sql, agent, { client: ref, projectId: params.get("project_id") });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
