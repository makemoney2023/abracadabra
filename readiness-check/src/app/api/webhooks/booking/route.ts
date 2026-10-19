import { NextResponse } from "next/server";
import { applyBookingEvent } from "@/lib/booking/apply";
import { parseCalPayload } from "@/lib/booking/cal-payload";
import { verifyCalSignature } from "@/lib/booking/cal-signature";
import { calWebhookSecret } from "@/lib/check-env";
import { forwardBooking } from "@/lib/handoff-intake";
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
    // On Cloudflare there is no Supabase store: HQ (POST /api/intake/booking) is the booking record.
    // The local Supabase write only runs where that admin env exists (the old Vercel/Inngest path).
    const local = supabaseAdminConfigured() ? await applyBookingEvent(createAdminClient(), event, body) : null;
    const forwarded = await forwardBooking({
      kind: event.kind,
      externalId: event.externalId,
      startsAt: event.startsAt,
      email: event.email,
      name: event.name,
    });
    if (!local && forwarded.skipped) {
      if (!event.externalId || !event.startsAt) return NextResponse.json({ ok: true, ignored: true });
      // Nothing stored the booking. 503 makes Cal.com retry once HQ intake is configured.
      return NextResponse.json({ error: "Booking store is not configured" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, ...(local ?? {}), forwarded: !forwarded.skipped });
  } catch (err) {
    return NextResponse.json(
      { error: "Booking update failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

function supabaseAdminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
