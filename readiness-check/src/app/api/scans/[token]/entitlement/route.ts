import { NextResponse } from "next/server";
import { paywallConfig } from "@/lib/paywall/config";
import { issueDownloadToken } from "@/lib/paywall/download-token";
import { findEntitlement } from "@/lib/paywall/entitlements";
import { checkDb, scanByToken } from "@/lib/paywall/scan-context";
import { paywallTestBypass, TEST_BYPASS_TOKEN } from "@/lib/paywall/test-bypass";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Whether this scan's files can be bought, what they cost (display only),
 * whether they're paid for, and — only when paid — a short-lived signed download token.
 */
export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = await checkDb();
  if (!db) return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });

  const scan = await scanByToken(db, token);
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  const config = paywallConfig();
  const headers = { "Cache-Control": "private, no-store" };
  const offer = {
    priceDisplay: config.offer.priceDisplay,
    creditDisplay: config.offer.creditDisplay,
    payDisplay: config.offer.payDisplay,
  };

  // Preview/test only: never honoured on production hosts (see test-bypass.ts).
  if (paywallTestBypass(request)) {
    return NextResponse.json(
      { purchase: "available", ...offer, entitled: true, testBypass: true, downloadToken: TEST_BYPASS_TOKEN },
      { headers },
    );
  }

  if (!config.enabled) {
    return NextResponse.json({ purchase: "unavailable", ...offer, entitled: false }, { headers });
  }

  const entitlement = await findEntitlement(db, scan.id);
  if (!entitlement) {
    return NextResponse.json({ purchase: "available", ...offer, entitled: false }, { headers });
  }

  const download = await issueDownloadToken(config, token, scan.id);
  return NextResponse.json(
    {
      purchase: "available",
      ...offer,
      entitled: true,
      downloadToken: download.token,
      downloadTokenExpiresAt: download.expiresAt,
    },
    { headers },
  );
}
