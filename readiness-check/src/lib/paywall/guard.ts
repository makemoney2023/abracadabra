import { NextResponse } from "next/server";
import type { BoundSql } from "@/lib/cloudflare/sql";
import { paywallConfig, type PaywallEnv } from "@/lib/paywall/config";
import { DOWNLOAD_TOKEN_HEADER, verifyDownloadToken } from "@/lib/paywall/download-token";
import { findEntitlement } from "@/lib/paywall/entitlements";
import { paywallTestBypass } from "@/lib/paywall/test-bypass";

/**
 * Server-side gate for file generation. Returns a response to send back,
 * or null when the caller may generate files.
 *
 * - 402 when files can't be bought yet or this scan has no paid entitlement.
 * - 403 when paid but the signed download token is missing, expired, or for another scan.
 */
export async function requireFileAccess(args: {
  db: BoundSql;
  request: Request;
  scanId: string;
  scanToken: string;
  env?: PaywallEnv;
}): Promise<NextResponse | null> {
  const env = args.env ?? process.env;
  // Preview/test only: never honoured on production hosts (see test-bypass.ts).
  if (paywallTestBypass(args.request, env)) return null;

  const config = paywallConfig(env);
  if (!config.enabled) {
    return NextResponse.json(
      {
        error: "Payment required",
        code: "purchase_unavailable",
        message: "File downloads aren't on sale yet.",
      },
      { status: 402 },
    );
  }

  const entitlement = await findEntitlement(args.db, args.scanId);
  if (!entitlement) {
    return NextResponse.json(
      {
        error: "Payment required",
        code: "payment_required",
        message: "Buy the files to download them.",
      },
      { status: 402 },
    );
  }

  const ok = await verifyDownloadToken(
    config,
    args.request.headers.get(DOWNLOAD_TOKEN_HEADER),
    args.scanToken,
    args.scanId,
  );
  if (!ok) {
    return NextResponse.json(
      {
        error: "Forbidden",
        code: "invalid_download_token",
        message: "Your download link expired. Reload the page and try again.",
      },
      { status: 403 },
    );
  }

  return null;
}
