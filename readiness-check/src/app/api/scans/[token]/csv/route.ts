import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkDb } from "@/lib/paywall/scan-context";
import { loadScanByPublicToken } from "@/lib/scan/d1-store";
import { pagesCsv } from "@/lib/scan/page-groups";
import { scanReportOpen, unlockCookieName } from "@/lib/scan/unlock";

type RouteContext = { params: Promise<{ token: string }> };

/** Every scanned page as CSV, worst first. Behind the same email unlock as the page matrix. */
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = await checkDb();
  if (!db) return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });

  let loaded: Awaited<ReturnType<typeof loadScanByPublicToken>>;
  try {
    loaded = await loadScanByPublicToken(db, token, { pages: "matrix" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load scan" }, { status: 500 });
  }
  if (!loaded) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  const cookieStore = await cookies();
  if (!scanReportOpen(loaded.scan.source, cookieStore.get(unlockCookieName(token))?.value)) {
    return NextResponse.json(
      { error: "Unlock required", message: "Provide email unlock before the CSV download" },
      { status: 401 },
    );
  }
  if (loaded.scan.status !== "complete") {
    return NextResponse.json({ error: "Scan not complete" }, { status: 409 });
  }

  return new NextResponse(pagesCsv(loaded.pages), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="schema-${loaded.scan.domain}-pages.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
