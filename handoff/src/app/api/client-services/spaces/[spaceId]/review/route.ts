import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { wakeOrganization, type WakeEnv } from "@/lib/agent-wake";
import { reviewDeliverable, type ReviewDecision } from "@/lib/client-work";
import { clientServicesAuthorized, envText } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

const DECISIONS = new Set<ReviewDecision>(["approve", "changes", "comment"]);

/**
 * Client Services review of one deliverable. Bearer CLIENT_SERVICES_TOKEN.
 * Body: { deliverable_id, decision: "approve" | "changes" | "comment", body?, item_id? }
 */
export async function POST(request: Request, context: { params: Promise<{ spaceId: string }> }) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { spaceId } = await context.params;
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const decision = payload?.decision as ReviewDecision;
  const deliverableId = typeof payload?.deliverable_id === "string" ? payload.deliverable_id : "";
  if (!DECISIONS.has(decision) || !deliverableId) return NextResponse.json({ error: "Check the body." }, { status: 400 });
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const result = await reviewDeliverable(sql, {
    spaceId,
    deliverableId,
    itemId: typeof payload.item_id === "string" ? payload.item_id : null,
    decision,
    body: typeof payload.body === "string" ? payload.body : "",
    now,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error === "missing" ? "Not found." : "Check the body." }, { status: result.error === "missing" ? 404 : 400 });
  }
  if (decision === "changes") {
    const wake: WakeEnv = { AGENT_URL: envText("AGENT_URL"), AGENT_WAKE_SECRET: envText("AGENT_WAKE_SECRET") };
    try {
      await wakeOrganization(wake, result.organizationId, "changes_requested", now);
    } catch {
      // The every-minute cron still picks up open work.
    }
  }
  return NextResponse.json({ ok: true, status: result.status });
}
