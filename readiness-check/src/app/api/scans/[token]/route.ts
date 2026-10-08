import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { selectScanPayload, type FullScanView } from "@/lib/scan/present";
import { loadScanByPublicToken } from "@/lib/scan/d1-store";
import { unlockCookieName } from "@/lib/scan/unlock";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const db = ((await getCloudflareContext({ async: true })).env as CheckBindings).DB;
  if (!db) {
    return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });
  }

  let loaded: Awaited<ReturnType<typeof loadScanByPublicToken>>;
  try {
    loaded = await loadScanByPublicToken(db, token);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load scan" },
      { status: 500 },
    );
  }

  if (!loaded) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  const unlocked =
    cookieStore.get(unlockCookieName(token))?.value === "1";

  const full: FullScanView = {
    domain: loaded.scan.domain,
    status: loaded.scan.status,
    scoreTotal: loaded.scan.score_total,
    scoreBreakdown: loaded.scan.score_breakdown,
    pages: loaded.pages,
    findings: loaded.findings,
  };

  return NextResponse.json(selectScanPayload(full, unlocked));
}
