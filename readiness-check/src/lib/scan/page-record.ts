import type { DetectedPage } from "@/lib/types";
import type { ScanPageRecord } from "./repository";

const SCRAPE_LIMIT = 12_000;

/** Keep the schema facts and the scraped page text together on the scan row. */
export function scanPageRecord(page: DetectedPage, scrapedText: string): ScanPageRecord {
  const text = scrapedText.replace(/\s+/g, " ").trim().slice(0, SCRAPE_LIMIT);
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
