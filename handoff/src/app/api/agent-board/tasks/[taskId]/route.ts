import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { parseBoardAction, updateAgentTask } from "@/lib/agent-board";
import { agentForToken } from "@/lib/agent-work-filing";

export const dynamic = "force-dynamic";

/**
 * One board change. Bearer agent token. Body is one of:
 * { action: "start" } | { action: "pause" } | { action: "block", reason } | { action: "review", note? }
 * | { action: "move", to: todo|doing|review|done } | { action: "note", body }
 * The board has four columns: To do, Doing, Waiting on Client Services (review), Done. The old stage names are
 * aliases: describe is todo; engineer, build, and run are doing. A move to doing stores stage build and, with
 * AGENT_MODE=agents, hands the task to the lead agent; it is refused while AGENT_MODE is legacy (it would start a
 * swarm or Cursor run). A card waiting on Client Services can't be started, paused, or moved. No deletes.
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
