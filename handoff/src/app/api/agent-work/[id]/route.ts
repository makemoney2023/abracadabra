import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken, readAgentContextItem } from "@/lib/agent-work-filing";
import { releaseOwnRound, withdrawFiling } from "@/lib/agent-filing-review";

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
 * Withdraw one held filing. Bearer agent token: the filing's agent, or the client's lead.
 * Body: { action: "withdraw" (or "retract"), reason? }. A filing the client can already see (released, or filed
 * before the hold) is 409: file a corrected version with supersedes, or ask Client Services to withdraw it.
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
  const { id } = await context.params;
  if (body?.action === "release") {
    const released = await releaseOwnRound(sql, { id, agent, now: Date.now() });
    if (!released.ok) return NextResponse.json({ error: released.message, reasonCode: released.reasonCode }, { status: released.status });
    return NextResponse.json({ ok: true, deliverable_id: released.deliverableId, published_version: released.publishedVersion, released: true });
  }
  if (body?.action !== "withdraw" && body?.action !== "retract") {
    return NextResponse.json({ error: "action must be withdraw or release. To replace a filing, POST /api/agent-work with supersedes." }, { status: 400 });
  }
  const done = await withdrawFiling(sql, {
    id,
    by: { kind: "agent", agent },
    reason: typeof body.reason === "string" ? body.reason : null,
    now: Date.now(),
  });
  if (!done.ok) return NextResponse.json({ error: done.message }, { status: done.status });
  return NextResponse.json({ ok: true, work_item_id: done.workItemId, withdrawn: true });
}
