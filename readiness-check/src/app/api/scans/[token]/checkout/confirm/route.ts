import { NextResponse } from "next/server";
import { z } from "zod";
import { paywallConfig } from "@/lib/paywall/config";
import { issueDownloadToken } from "@/lib/paywall/download-token";
import { grantEntitlement } from "@/lib/paywall/entitlements";
import { checkDb, scanByToken } from "@/lib/paywall/scan-context";
import { retrieveCheckoutSession, sessionGrantsFiles } from "@/lib/paywall/stripe";

type RouteContext = { params: Promise<{ token: string }> };

const bodySchema = z.object({ sessionId: z.string().min(8).max(255) });

/**
 * Success-URL path: read the session from the provider server-side and grant
 * the entitlement if it is a paid purchase for this scan. The webhook does the
 * same independently, so whichever arrives first wins and the other is a no-op.
 */
export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const config = paywallConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "Purchase unavailable" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid session" }, { status: 400 });

  const db = await checkDb();
  if (!db) return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });

  const scan = await scanByToken(db, token);
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  let session;
  try {
    session = await retrieveCheckoutSession(config.secretKey, parsed.data.sessionId);
  } catch (err) {
    console.error("checkout confirm failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Could not confirm payment" }, { status: 502 });
  }

  if (!sessionGrantsFiles(session, { scanId: scan.id, scanToken: token, priceId: config.priceId })) {
    return NextResponse.json({ error: "Payment not confirmed", entitled: false }, { status: 402 });
  }

  await grantEntitlement(db, {
    scanId: scan.id,
    checkoutSessionId: session.id,
    amountTotal: session.amount_total,
    currency: session.currency,
  });

  const download = await issueDownloadToken(config, token, scan.id);
  return NextResponse.json(
    { entitled: true, downloadToken: download.token, downloadTokenExpiresAt: download.expiresAt },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
