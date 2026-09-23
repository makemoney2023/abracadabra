import { NextResponse } from "next/server";
import { applyBookingEvent } from "@/lib/booking/apply";
import { parseCalPayload } from "@/lib/booking/cal-payload";
import { verifyCalSignature } from "@/lib/booking/cal-signature";
import { calWebhookSecret } from "@/lib/check-env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = calWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 500 });
  }
  const header = request.headers.get("x-cal-signature-256");
  if (!verifyCalSignature(raw, header, secret)) {
    console.error("Cal.com webhook signature mismatch");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const event = parseCalPayload(body);
  if (event.kind === "ignored") {
    return NextResponse.json({ ok: true, ignored: true });
  }
  try {
    const result = await applyBookingEvent(createAdminClient(), event, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: "Booking update failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
