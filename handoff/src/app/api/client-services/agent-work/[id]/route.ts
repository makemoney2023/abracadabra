import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { approveAgentWork, withdrawAgentWork } from "@/lib/agent-work-review";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/**
 * Client Services decides one agent filing. Bearer CLIENT_SERVICES_TOKEN.
 * Body: { action: "approve" } shows the held batch to the client in its folder and sends the "is ready" email.
 * Body: { action: "discard", reason? } takes any filing out of the client space (older, already visible ones too).
 * Approving the card (POST /api/client-services/reviews/:taskId) approves every held filing on it the same way.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const action = body?.action;
  if (action !== "approve" && action !== "discard") {
    return NextResponse.json({ error: 'action must be "approve" or "discard".' }, { status: 400 });
  }
  const { id } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const actor = { kind: "system" as const, id: "client-services" };
  if (action === "approve") {
    const result = await approveAgentWork(sql, { id, actor, now });
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.error === "missing" ? 404 : 409 });
    return NextResponse.json({ ok: true, work_item_id: id, review_state: "approved", changed: result.approved });
  }
  const result = await withdrawAgentWork(sql, {
    id,
    to: "discarded",
    actor,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null,
    now,
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.error === "missing" ? 404 : 409 });
  return NextResponse.json({ ok: true, work_item_id: id, review_state: result.state });
}
