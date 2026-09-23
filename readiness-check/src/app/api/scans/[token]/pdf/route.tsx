import { renderToBuffer } from "@react-pdf/renderer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildReportProps, ScanReportDocument } from "@/lib/pdf/report";
import { loadScanByPublicToken } from "@/lib/scan/supabase-repository";
import { unlockCookieName } from "@/lib/scan/unlock";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const unlockedCookie =
    cookieStore.get(unlockCookieName(token))?.value === "1";

  if (!unlockedCookie) {
    return NextResponse.json(
      { error: "Unlock required", message: "Provide email unlock before PDF export" },
      { status: 401 },
    );
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

  const props = buildReportProps({
    domain: loaded.scan.domain,
    scoreTotal: loaded.scan.score_total,
    scoreBreakdown: loaded.scan.score_breakdown,
    pages: loaded.pages,
    findings: loaded.findings,
  });

  const buffer = await renderToBuffer(<ScanReportDocument {...props} />);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="schema-${loaded.scan.domain}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
