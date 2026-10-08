import { describe, expect, it } from "vitest";
import { presentSchemaLead, schemaScanReport } from "./schema-report";

describe("schemaScanReport", () => {
  it("keeps the score, every pillar, the page matrix, and the gaps", () => {
    const report = schemaScanReport({
      status: "complete",
      scoreTotal: 42,
      scoreBreakdown: {
        structuredData: 10,
        aiDiscoveryFiles: 8,
        aiCrawlability: 12,
        pageCoverage: 6,
        answerReadiness: 6,
      },
      error: null,
      publicToken: "scan-token",
      pages: [
        {
          url: "https://needs.example/",
          pageType: "home",
          fetchStatus: "ok",
          hasJsonLd: false,
          schemaTypes: [],
        },
        {
          url: "https://needs.example/faq",
          pageType: "faq",
          fetchStatus: "ok",
          hasJsonLd: true,
          schemaTypes: ["FAQPage"],
        },
      ],
      findings: [
        { severity: "critical", message: "Home page is missing JSON-LD.", passed: false, pageUrl: "https://needs.example/" },
        { severity: "info", message: "Sitemap is present.", passed: true, pageUrl: null },
      ],
    });

    expect(report.scoreTotal).toBe(42);
    expect(report.pillars).toEqual([
      { label: "Structured data", score: 10, max: 35 },
      { label: "AI discovery files", score: 8, max: 20 },
      { label: "AI crawlability", score: 12, max: 20 },
      { label: "Page coverage", score: 6, max: 15 },
      { label: "Answer readiness", score: 6, max: 10 },
    ]);
    expect(report.pages).toHaveLength(2);
    expect(report.gaps.map((gap) => gap.message)).toEqual(["Home page is missing JSON-LD."]);
    expect(report.publicToken).toBe("scan-token");
  });

  it("hides the matrix until the scan is complete", () => {
    const report = schemaScanReport({
      status: "running",
      scoreTotal: null,
      scoreBreakdown: null,
      error: null,
      publicToken: "scan-token",
      pages: [],
      findings: [],
    });
    expect(report.pillars).toEqual([]);
    expect(report.pages).toEqual([]);
    expect(report.gaps).toEqual([]);
    expect(report.status).toBe("running");
  });
});

describe("presentSchemaLead", () => {
  it("puts the score, the pillars, and the report link on the lead", () => {
    const report = schemaScanReport({
      status: "complete",
      scoreTotal: 42,
      scoreBreakdown: {
        structuredData: 10,
        aiDiscoveryFiles: 8,
        aiCrawlability: 12,
        pageCoverage: 6,
        answerReadiness: 6,
      },
      error: null,
      publicToken: "scan-token",
      pages: [],
      findings: [],
    });
    expect(presentSchemaLead(report)).toEqual({
      total: "Schema score 42/100.",
      lines: [
        "Structured data 10/35.",
        "AI discovery files 8/20.",
        "AI crawlability 12/20.",
        "Page coverage 6/15.",
        "Answer readiness 6/10.",
      ],
      reportUrl: "https://check.abra-ca-dabra.app/scan/scan-token",
    });
  });

  it("says a queued scan is queued", () => {
    const report = schemaScanReport({
      status: "queued",
      scoreTotal: null,
      scoreBreakdown: null,
      error: null,
      publicToken: null,
      pages: [],
      findings: [],
    });
    expect(presentSchemaLead(report).total).toBe("Schema scan is queued.");
  });
});
