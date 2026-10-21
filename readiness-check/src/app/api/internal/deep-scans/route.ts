import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { normalizeDomain } from "@/lib/domain";
import { tokensMatch } from "@/lib/jobs/auth";
import { deleteScan, insertScan } from "@/lib/scan/d1-store";
import { resolveTier, tierConfig, TIER_PRICES } from "@/lib/scan/tiers";

const bodySchema = z.object({
  url: z.string().min(1),
  tier: z.string().min(1),
});

/**
 * Internal trigger for a deep scan while pricing and checkout are undecided. Needs the internal job token and
 * DEEP_SCAN_ENABLED=1 (off by default). No payment is taken; the report is the normal public one, email-gated.
 */
export async function POST(request: Request) {
  const env = (await getCloudflareContext({ async: true })).env as CheckBindings;
  if (!tokensMatch(request.headers.get("x-job-token") ?? "", env.CLOUDFLARE_API_TOKEN ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const decision = resolveTier(parsed.data.tier, tierConfig(env));
  if (!decision.ok) {
    const status = decision.reason === "deep_scan_disabled" ? 403 : 400;
    return NextResponse.json({ error: decision.reason }, { status });
  }

  let domain: string;
  let origin: string;
  try {
    ({ domain, origin } = normalizeDomain(parsed.data.url));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid domain" }, { status: 400 });
  }

  const db = env.DB;
  const queue = env.SCAN_JOBS;
  if (!db || !queue) return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });

  const scan = await insertScan(db, {
    domain,
    origin,
    source: "public",
    tier: { tier: decision.tier, pageLimit: decision.pageLimit },
  });
  try {
    await queue.send({ type: "scan", scanId: scan.id });
  } catch (err) {
    await deleteScan(db, scan.id);
    return NextResponse.json(
      { error: "Scan create failed", message: err instanceof Error ? err.message : "Could not queue the scan" },
      { status: 500 },
    );
  }
  return NextResponse.json(
    {
      token: scan.token,
      id: scan.id,
      status: scan.status,
      tier: decision.tier,
      pageLimit: decision.pageLimit,
      price: TIER_PRICES[decision.tier],
    },
    { status: 201 },
  );
}
