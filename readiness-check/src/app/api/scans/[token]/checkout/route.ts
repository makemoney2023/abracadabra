import { NextResponse } from "next/server";
import { paywallConfig } from "@/lib/paywall/config";
import { findEntitlement } from "@/lib/paywall/entitlements";
import { checkDb, scanByToken } from "@/lib/paywall/scan-context";
import { createFilesCheckoutSession, StripeError } from "@/lib/paywall/stripe";

type RouteContext = { params: Promise<{ token: string }> };

/** Start a hosted checkout for this scan's files. Returns the checkout URL. */
export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const config = paywallConfig();
  if (!config.enabled) {
    return NextResponse.json(
      { error: "Purchase unavailable", code: "purchase_unavailable" },
      { status: 503 },
    );
  }

  const db = await checkDb();
  if (!db) return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });

  const scan = await scanByToken(db, token);
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  if (scan.status !== "complete") {
    return NextResponse.json({ error: "Scan not complete" }, { status: 409 });
  }

  if (await findEntitlement(db, scan.id)) {
    return NextResponse.json({ alreadyPaid: true });
  }

  const origin = new URL(request.url).origin;
  const scanUrl = `${origin}/scan/${encodeURIComponent(token)}`;
  try {
    const session = await createFilesCheckoutSession({
      secretKey: config.secretKey,
      priceId: config.priceId,
      scanId: scan.id,
      scanToken: token,
      domain: scan.domain,
      successUrl: `${scanUrl}?checkout={CHECKOUT_SESSION_ID}#fix-package`,
      cancelUrl: `${scanUrl}?checkout=cancelled#fix-package`,
      couponId: config.couponId,
    });
    if (!session.url) throw new StripeError("Checkout did not return a URL", 502);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout create failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Checkout unavailable" }, { status: 502 });
  }
}
