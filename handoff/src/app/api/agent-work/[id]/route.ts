import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken, readAgentContextItem } from "@/lib/agent-work-filing";
import { withdrawAgentWork } from "@/lib/agent-work-review";

export const dynamic = "force-dynamic";

/** One filed item with its summary markdown. Only for an agent assigned to that client now. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await context.params;
  const item = await readAgentContextItem(sql, agent, id);
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(item);
}

/**
 * The agent takes back its own filing while it still waits on Client Services. Body: { action: "retract", reason? }.
 * The batch leaves the space and the deliverable is archived. Approved or older work: ask Client Services to discard it.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
  if (body?.action !== "retract") return NextResponse.json({ error: 'action must be "retract".' }, { status: 400 });
  const { id } = await context.params;
  const result = await withdrawAgentWork(sql, {
    id,
    to: "retracted",
    agentId: agent.agentId,
    actor: { kind: "agent", id: agent.agentId },
    reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null,
    now: Date.now(),
  });
  if (!result.ok) {
    const status = result.error === "missing" ? 404 : result.error === "forbidden" ? 403 : 409;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ ok: true, work_item_id: id, review_state: result.state });
}
