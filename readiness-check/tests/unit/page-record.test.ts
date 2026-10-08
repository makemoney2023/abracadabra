import { describe, expect, it } from "vitest";
import { scanPageRecord } from "@/lib/scan/page-record";
import type { DetectedPage } from "@/lib/types";

const page: DetectedPage = {
  url: "https://northwind.example/",
  pageType: "home",
  fetchStatus: "ok",
  hasJsonLd: true,
  schemaTypes: ["Organization"],
  evidence: { businessName: "Northwind", emails: [], phones: [], sameAs: [], faqPairs: [], reviews: [], howtoSteps: [], hasSiteSearch: false, existingTypes: ["Organization"], existingBlocks: [] },
};

describe("scan page record", () => {
  it("keeps the schema facts and the scraped text", () => {
    const record = scanPageRecord(page, "  We sell foam.  ");
    expect(record.evidence).toMatchObject({ businessName: "Northwind", scrapedText: "We sell foam." });
  });

  it("leaves the facts alone when the scrape is empty", () => {
    const record = scanPageRecord(page, "   ");
    expect(record.evidence).not.toHaveProperty("scrapedText");
  });
});
