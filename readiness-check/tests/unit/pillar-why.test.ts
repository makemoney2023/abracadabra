import { describe, expect, it } from "vitest";
import { buildPillarWhy } from "@/lib/scoring/pillar-why";

describe("buildPillarWhy", () => {
  it("lists concrete discovery gaps instead of a vague partial summary", () => {
    const why = buildPillarWhy(
      {
        structuredData: 0,
        aiDiscoveryFiles: 8,
        aiCrawlability: 20,
        pageCoverage: 0,
        answerReadiness: 0,
      },
      [
        {
          code: "EMPTY_LLMS_TXT",
          severity: "warn",
          passed: false,
          message: "llms.txt is present but not useful.",
        },
        {
          code: "NO_JSON_LD_HOME",
          severity: "critical",
          passed: false,
          message: "Home page is missing JSON-LD structured data.",
        },
      ],
      [
        {
          url: "https://example.com/",
          pageType: "home",
          fetchStatus: "ok",
          hasJsonLd: false,
        },
        {
          url: "https://example.com/about",
          pageType: "about",
          fetchStatus: "ok",
          hasJsonLd: false,
        },
        {
          url: "https://example.com/ok",
          pageType: "other",
          fetchStatus: "ok",
          hasJsonLd: true,
        },
      ],
    );

    expect(why.aiDiscoveryFiles.summary).toMatch(/gaps?:/i);
    expect(why.aiDiscoveryFiles.summary).toMatch(/llms\.txt/i);
    expect(why.aiDiscoveryFiles.bullets.some((b) => /EMPTY_LLMS_TXT|llms\.txt/i.test(b))).toBe(
      true,
    );

    expect(why.pageCoverage.bullets.some((b) => b.includes("https://example.com/about"))).toBe(
      true,
    );
    expect(why.pageCoverage.bullets.some((b) => b.includes("https://example.com/ok"))).toBe(false);
  });

  it("uses a pass summary when a pillar is full and has no failed findings", () => {
    const why = buildPillarWhy(
      {
        structuredData: 35,
        aiDiscoveryFiles: 20,
        aiCrawlability: 20,
        pageCoverage: 15,
        answerReadiness: 10,
      },
      [],
    );

    expect(why.structuredData.bullets).toHaveLength(0);
    expect(why.structuredData.summary).toMatch(/passed/i);
  });
});
