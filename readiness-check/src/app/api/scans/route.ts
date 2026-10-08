import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { normalizeDomain } from "@/lib/domain";
import { countRecentPublicScansOnD1, deleteScan, insertScan } from "@/lib/scan/d1-store";

const createScanSchema = z.object({
  url: z.string().min(1),
  source: z.literal("public").optional().default("public"),
});

async function bindings(): Promise<CheckBindings> {
  const context = await getCloudflareContext({ async: true });
  return context.env as CheckBindings;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let domain: string;
  let origin: string;
  try {
    ({ domain, origin } = normalizeDomain(parsed.data.url));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid domain" },
      { status: 400 },
    );
  }

  const env = await bindings();
  const db = env.DB;
  const queue = env.SCAN_JOBS;
  if (!db || !queue) {
    return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });
  }

  try {
    const limit = await countRecentPublicScansOnD1(db, domain);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: "Maximum 3 public scans per domain per 24 hours",
          count: limit.count,
        },
        { status: 429 },
      );
    }

    const scan = await insertScan(db, { domain, origin, source: "public" });
    try {
      await queue.send({ type: "scan", scanId: scan.id });
    } catch (err) {
      await deleteScan(db, scan.id);
      const message = err instanceof Error ? err.message : "Could not queue the scan";
      return NextResponse.json({ error: "Scan create failed", message }, { status: 500 });
    }

    return NextResponse.json({ token: scan.token, id: scan.id, status: scan.status }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: "Scan create failed", message }, { status: 500 });
  }
}
