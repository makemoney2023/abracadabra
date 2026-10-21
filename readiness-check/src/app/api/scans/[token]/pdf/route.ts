import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkDb } from "@/lib/paywall/scan-context";
import { buildReportProps } from "@/lib/pdf/report-props";
import { renderScanReportPdf } from "@/lib/pdf/scan-report-pdf";
import { loadStudioFontBytes } from "@/lib/pdf/studio-font-bytes";
import { loadScanByPublicToken } from "@/lib/scan/d1-store";
import { unlockCookieName } from "@/lib/scan/unlock";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const unlockedCookie = cookieStore.get(unlockCookieName(token))?.value === "1";

  if (!unlockedCookie) {
    return NextResponse.json(
      { error: "Unlock required", message: "Provide email unlock before PDF export" },
      { status: 401 },
    );
  }

  const db = await checkDb();
  if (!db) {
    return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });
  }
  let loaded: Awaited<ReturnType<typeof loadScanByPublicToken>>;
  try {
    loaded = await loadScanByPublicToken(db, token, { pages: "matrix" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load scan" },
      { status: 500 },
    );
  }

  if (!loaded) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const props = buildReportProps({
    domain: loaded.scan.domain,
    scoreTotal: loaded.scan.score_total,
    scoreBreakdown: loaded.scan.score_breakdown,
    pages: loaded.pages,
    findings: loaded.findings,
  });

  let bytes: Uint8Array;
  try {
    const env = (await getCloudflareContext({ async: true })).env as {
      ASSETS?: { fetch: (input: Request | string) => Promise<Response> };
    };
    const fonts = await loadStudioFontBytes(env.ASSETS ?? null, new URL(request.url).origin);
    bytes = await renderScanReportPdf(props, fonts);
  } catch (err) {
    console.error("scan pdf render failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "PDF render failed" }, { status: 500 });
  }

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="schema-${loaded.scan.domain}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
