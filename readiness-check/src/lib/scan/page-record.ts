import type { DetectedPage } from "@/lib/types";
import type { ScanPageRecord } from "./repository";

/** Scraped text kept per page. HQ reads it as client context, so the first pages keep the full amount. */
export const SCRAPE_LIMIT = 12_000;
/** Deep scans keep a short excerpt past the first MAX_PAGES pages, so 1,000 rows stay a few MB in shared D1. */
export const DEEP_SCRAPE_LIMIT = 1_500;

/** Keep the schema facts and the scraped page text together on the scan row. */
export function scanPageRecord(page: DetectedPage, scrapedText: string, textLimit = SCRAPE_LIMIT): ScanPageRecord {
  const text = scrapedText.replace(/\s+/g, " ").trim().slice(0, textLimit);
  const evidence: Record<string, unknown> = { ...(page.evidence ?? {}) };
  if (text) evidence.scrapedText = text;
  return {
    url: page.url,
    pageType: page.pageType,
    fetchStatus: page.fetchStatus,
    hasJsonLd: page.hasJsonLd,
    schemaTypes: page.schemaTypes,
    evidence,
  };
}
