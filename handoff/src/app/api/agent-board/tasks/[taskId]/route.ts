import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { parseBoardAction, updateAgentTask } from "@/lib/agent-board";
import { agentForToken } from "@/lib/agent-work-filing";

export const dynamic = "force-dynamic";

/**
 * One board change. Bearer agent token. Body is one of:
 * { action: "start" } | { action: "pause" } | { action: "block", reason } | { action: "review", note? }
 * | { action: "move", to: describe|engineer|build|run|review|done } | { action: "note", body }
 * build and run are refused while AGENT_MODE is legacy (they would start a swarm or Cursor run). No deletes.
 */
export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const change = parseBoardAction(body);
  if (!change) return NextResponse.json({ error: "Unknown or incomplete action." }, { status: 400 });
  const { taskId } = await context.params;
  const result = await updateAgentTask(sql, agent, { taskId, change, now: Date.now() });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
