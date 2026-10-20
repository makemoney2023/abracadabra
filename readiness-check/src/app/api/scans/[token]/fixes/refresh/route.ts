import { NextResponse } from "next/server";
import {
  generateFixPackage,
  listFixOptions,
  type FixPackageInput,
} from "@/lib/fixes/generate-package";
import { computeRequiredFields } from "@/lib/fixes/required-fields";
import { refreshPageFacts } from "@/lib/scan/refresh-page-facts";
import { checkDb } from "@/lib/paywall/scan-context";
import { loadScanByPublicToken, updateScanPageFacts } from "@/lib/scan/d1-store";

type RouteContext = { params: Promise<{ token: string }> };

/** Refresh page facts via HTML GET (≤10 URLs), reclassify page_type, persist evidence. */
export async function POST(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const db = await checkDb();
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
  if (loaded.scan.status !== "complete") {
    return NextResponse.json(
      { error: "Scan not complete", message: "Wait for the scan to finish before refreshing facts" },
      { status: 409 },
    );
  }

  const refreshed = await refreshPageFacts({
    origin: loaded.scan.origin,
    pages: loaded.pages.map((p) => ({
      url: p.url,
      pageType: p.pageType,
      fetchStatus: p.fetchStatus,
      hasJsonLd: p.hasJsonLd,
      schemaTypes: p.schemaTypes,
      evidence: p.evidence,
    })),
  });

  for (const page of refreshed.pages) {
    if (!refreshed.refreshedUrls.includes(page.url)) continue;
    try {
      await updateScanPageFacts(db, loaded.scan.id, {
        url: page.url,
        pageType: page.pageType,
        hasJsonLd: page.hasJsonLd,
        schemaTypes: page.schemaTypes,
        evidence: page.evidence as unknown as Record<string, unknown>,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to persist evidence: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 500 },
      );
    }
  }

  const input: FixPackageInput = {
    domain: loaded.scan.domain,
    origin: loaded.scan.origin,
    findings: loaded.findings,
    pages: refreshed.pages.map((p) => ({
      url: p.url,
      pageType: p.pageType,
      fetchStatus: p.fetchStatus,
      hasJsonLd: p.hasJsonLd,
      evidence: p.evidence,
    })),
  };

  const { options, defaultSelection, prefills } = listFixOptions(input);
  const requiredFields = computeRequiredFields(input, defaultSelection);

  return NextResponse.json({
    domain: input.domain,
    refreshedUrls: refreshed.refreshedUrls,
    options,
    defaultSelection,
    prefills,
    requiredFields,
    samplePackageValidation: generateFixPackage(input, {
      ...defaultSelection,
      businessType: prefills.businessType,
      email: prefills.email,
      phone: prefills.phone,
      logoUrl: prefills.logoUrl,
      includeSearchAction: prefills.hasSiteSearch,
    }).validation,
  });
}
