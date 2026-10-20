import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { createAgentTask } from "@/lib/agent-board";
import { agentForToken } from "@/lib/agent-work-filing";

export const dynamic = "force-dynamic";

/** New task on a client's board. Bearer agent token. Body: { title, note?, stage?: todo|doing (old names describe|engineer still work), client?, project_id? } */
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
  const result = await createAgentTask(sql, agent, {
    client: body?.client,
    projectId: typeof body?.project_id === "string" ? body.project_id : null,
    title: typeof body?.title === "string" ? body.title : "",
    note: typeof body?.note === "string" ? body.note : null,
    stage: typeof body?.stage === "string" ? body.stage : null,
    now: Date.now(),
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}
