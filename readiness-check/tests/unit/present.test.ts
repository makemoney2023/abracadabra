import { describe, expect, it } from "vitest";
import { selectScanPayload, type FullScanView } from "@/lib/scan/present";

const full: FullScanView = {
  domain: "example.com",
  status: "complete",
  scoreTotal: 72,
  scoreBreakdown: {
    structuredData: 20,
    aiDiscoveryFiles: 15,
    aiCrawlability: 15,
    pageCoverage: 12,
    answerReadiness: 10,
  },
  findings: [
    {
      code: "MISSING_FAQ_SCHEMA",
      severity: "warn",
      passed: false,
      message: "No FAQ schema detected",
    },
    {
      code: "NO_ORG_SCHEMA",
      severity: "critical",
      passed: false,
      message: "Missing Organization schema",
    },
    {
      code: "LOW_JSON_LD_COVERAGE",
      severity: "warn",
      passed: false,
      message: "Low JSON-LD coverage",
    },
    {
      code: "EMPTY_LLMS_TXT",
      severity: "info",
      passed: false,
      message: "llms.txt is thin",
    },
    {
      code: "MISSING_LLMS_TXT",
      severity: "critical",
      passed: true,
      message: "llms.txt present",
    },
  ],
  pages: [
    {
      url: "https://example.com/",
      pageType: "home",
      fetchStatus: "ok",
      hasJsonLd: true,
      schemaTypes: ["Organization"],
    },
    {
      url: "https://example.com/about",
      pageType: "about",
      fetchStatus: "ok",
      hasJsonLd: false,
      schemaTypes: [],
    },
  ],
};

describe("selectScanPayload soft gate", () => {
  it("always returns score preview and top 3 critical/warn gaps", () => {
    const payload = selectScanPayload(full, false);

    expect(payload.domain).toBe("example.com");
    expect(payload.status).toBe("complete");
    expect(payload.scoreTotal).toBe(72);
    expect(payload.scoreBreakdown).toEqual(full.scoreBreakdown);
    expect(payload.unlocked).toBe(false);
    expect(payload.topGaps).toHaveLength(3);
    expect(payload.topGaps.map((g) => g.code)).toEqual([
      "MISSING_FAQ_SCHEMA",
      "NO_ORG_SCHEMA",
      "LOW_JSON_LD_COVERAGE",
    ]);
    expect(payload.topGaps.every((g) => g.severity === "critical" || g.severity === "warn")).toBe(
      true,
    );
    expect(payload.pillarWhy.structuredData.max).toBe(35);
    expect(payload.pillarWhy.structuredData.bullets.length).toBeGreaterThan(0);
    expect(payload.scoreSummary.headline).toMatch(/72/);
    expect(payload.scoreSummary.body).toMatch(/example\.com/);
    expect(payload.scoreSummary.drivers.length).toBeGreaterThan(0);
    expect(payload.pagesMissingJsonLd).toEqual([
      { url: "https://example.com/about", pageType: "about" },
    ]);
    expect(payload.pillarWhy.pageCoverage.bullets.some((b) => b.includes("/about"))).toBe(true);
  });

  it("omits pages and full findings when locked but still lists missing JSON-LD pages", () => {
    const payload = selectScanPayload(full, false);
    expect(payload).not.toHaveProperty("pages");
    expect(payload).not.toHaveProperty("findings");
    expect(payload.pagesMissingJsonLd).toHaveLength(1);
  });

  it("includes pages and all findings when unlocked", () => {
    const payload = selectScanPayload(full, true);
    expect(payload.unlocked).toBe(true);
    if (!payload.unlocked) throw new Error("expected unlocked payload");
    expect(payload.pages).toEqual(full.pages);
    expect(payload.findings).toEqual(full.findings);
    expect(payload.topGaps).toHaveLength(3);
  });
});
