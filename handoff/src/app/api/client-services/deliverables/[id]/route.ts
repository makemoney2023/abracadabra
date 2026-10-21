import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { markDelivered } from "@/lib/agent-filing-review";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/**
 * Client Services marks one published deliverable as delivered (approved), with no client update. Bearer
 * CLIENT_SERVICES_TOKEN. Body: { action: "mark_delivered", reason? }. For work finished before it was filed that went
 * out as in_review. 409 unless it is in_review, published, and nothing newer is held. Repeats are no-ops.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  if (body?.action !== "mark_delivered") return NextResponse.json({ error: "action must be mark_delivered." }, { status: 400 });
  const sql = await openHandoffDb();
  await migrate(sql);
  const { id } = await context.params;
  const done = await markDelivered(sql, {
    deliverableId: id,
    reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) || null : null,
    now: Date.now(),
  });
  if (!done.ok) return NextResponse.json({ error: done.message }, { status: done.status });
  return NextResponse.json({ ok: true, deliverable_id: done.deliverableId, status: "approved", version: done.version, already: done.already });
}
