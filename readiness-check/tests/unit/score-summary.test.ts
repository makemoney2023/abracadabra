import { describe, expect, it } from "vitest";
import { buildScoreSummary } from "@/lib/scoring/score-summary";

describe("buildScoreSummary", () => {
  it("explains a mid score with weakest pillars and top gaps", () => {
    const summary = buildScoreSummary({
      domain: "us.superpatch.com",
      scoreTotal: 59,
      scoreBreakdown: {
        structuredData: 18,
        aiDiscoveryFiles: 8,
        aiCrawlability: 20,
        pageCoverage: 8,
        answerReadiness: 5,
      },
      topGaps: [
        {
          code: "MISSING_LLMS_TXT",
          severity: "critical",
          message: "No llms.txt found at the site root.",
        },
        {
          code: "LOW_JSON_LD_COVERAGE",
          severity: "warn",
          message: "Low JSON-LD coverage across scanned pages.",
        },
      ],
    });

    expect(summary.headline).toMatch(/59/);
    expect(summary.headline.toLowerCase()).toMatch(/fair|good|poor|strong/);
    expect(summary.body).toMatch(/us\.superpatch\.com/);
    expect(summary.body.toLowerCase()).toMatch(/ai discovery|structured data|page coverage/);
    expect(summary.drivers.length).toBeGreaterThanOrEqual(2);
    expect(summary.drivers.some((d) => /llms\.txt/i.test(d))).toBe(true);
  });

  it("celebrates a strong score without inventing critical gaps", () => {
    const summary = buildScoreSummary({
      domain: "example.com",
      scoreTotal: 92,
      scoreBreakdown: {
        structuredData: 33,
        aiDiscoveryFiles: 18,
        aiCrawlability: 20,
        pageCoverage: 13,
        answerReadiness: 8,
      },
      topGaps: [],
    });

    expect(summary.headline.toLowerCase()).toContain("strong");
    expect(summary.body.toLowerCase()).toMatch(/strong|ready|solid/);
    expect(summary.drivers.every((d) => !/critical/i.test(d))).toBe(true);
  });

  it("handles a missing score", () => {
    const summary = buildScoreSummary({
      domain: "example.com",
      scoreTotal: null,
      scoreBreakdown: null,
      topGaps: [],
    });

    expect(summary.headline).toMatch(/unavailable|pending|—/i);
    expect(summary.body.length).toBeGreaterThan(10);
  });
});
