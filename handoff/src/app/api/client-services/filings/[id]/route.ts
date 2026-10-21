import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { withdrawFiling } from "@/lib/agent-filing-review";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/**
 * Client Services withdraws one filing. Bearer CLIENT_SERVICES_TOKEN. Body: { action: "withdraw", reason? }.
 * A held filing is discarded; a released one, or one filed before the hold shipped, is hidden from the client
 * (staff and the record keep it). Repeats are no-ops.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  if (body?.action !== "withdraw") return NextResponse.json({ error: "action must be withdraw." }, { status: 400 });
  const sql = await openHandoffDb();
  await migrate(sql);
  const { id } = await context.params;
  const done = await withdrawFiling(sql, {
    id,
    by: { kind: "client_services" },
    reason: typeof body.reason === "string" ? body.reason : null,
    now: Date.now(),
  });
  if (!done.ok) return NextResponse.json({ error: done.message }, { status: done.status });
  return NextResponse.json({ ok: true, work_item_id: done.workItemId, batch_id: done.batchId, was_released: done.wasReleased });
}
