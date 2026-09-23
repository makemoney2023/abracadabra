import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/auth";
import { selectScanPayload, type FullScanView } from "@/lib/scan/present";
import { loadScanByPublicToken } from "@/lib/scan/supabase-repository";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

/** Ops-only full scan detail (pages + findings). No public soft-gate bypass. */
export async function GET(_request: Request, context: RouteContext) {
  const session = await requireOpsSession();
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = createAdminClient();
  let loaded: Awaited<ReturnType<typeof loadScanByPublicToken>>;
  try {
    loaded = await loadScanByPublicToken(token, admin);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load scan" },
      { status: 500 },
    );
  }

  if (!loaded) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const full: FullScanView = {
    domain: loaded.scan.domain,
    status: loaded.scan.status,
    scoreTotal: loaded.scan.score_total,
    scoreBreakdown: loaded.scan.score_breakdown,
    pages: loaded.pages,
    findings: loaded.findings,
  };

  return NextResponse.json(selectScanPayload(full, true));
}
