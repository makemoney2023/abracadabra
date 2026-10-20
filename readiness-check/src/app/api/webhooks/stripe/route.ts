import { NextResponse } from "next/server";
import { paywallConfig } from "@/lib/paywall/config";
import { findScanById, grantEntitlement } from "@/lib/paywall/entitlements";
import { checkDb } from "@/lib/paywall/scan-context";
import {
  sessionGrantsFiles,
  verifyStripeSignature,
  type CheckoutSession,
} from "@/lib/paywall/stripe";

const GRANT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

/** Provider webhook: signature-verified, grants the paid entitlement for one scan. */
export async function POST(request: Request) {
  const config = paywallConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const valid = await verifyStripeSignature(raw, request.headers.get("stripe-signature"), config.webhookSecret);
  if (!valid) {
    console.error("Stripe webhook signature mismatch");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: CheckoutSession } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!event.type || !GRANT_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const session = event.data?.object;
  const scanId = session?.client_reference_id;
  if (!session || !scanId) return NextResponse.json({ received: true, ignored: true });

  const db = await checkDb();
  if (!db) return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });

  const scan = await findScanById(db, scanId);
  if (!scan) return NextResponse.json({ received: true, ignored: true });

  // Event payloads omit line items; product tag + scan binding are checked here.
  if (!sessionGrantsFiles(session, { scanId: scan.id, scanToken: scan.publicToken })) {
    return NextResponse.json({ received: true, ignored: true });
  }

  await grantEntitlement(db, {
    scanId: scan.id,
    checkoutSessionId: session.id,
    amountTotal: session.amount_total,
    currency: session.currency,
  });
  return NextResponse.json({ received: true, granted: true });
}
