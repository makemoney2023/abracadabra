import { describe, expect, it } from "vitest";
import { scoreScan } from "@/lib/scoring/score";
import type { DetectedPage, SiteFiles } from "@/lib/types";

const healthyPages: DetectedPage[] = [
  {
    url: "https://example.com/",
    pageType: "home",
    fetchStatus: "ok",
    hasJsonLd: true,
    schemaTypes: ["Organization", "FAQPage"],
  },
  {
    url: "https://example.com/contact",
    pageType: "contact",
    fetchStatus: "ok",
    hasJsonLd: true,
    schemaTypes: ["LocalBusiness"],
  },
];

const healthyFiles: SiteFiles = {
  robotsTxt: "User-agent: *\nAllow: /\n",
  sitemapXml: "<urlset><url><loc>https://example.com/</loc></url></urlset>",
  llmsTxt: `# Site
> Example company overview for agents.

Canonical pages for this site.

## Core
- [Home](https://example.com/): Primary overview
## Optional
- [About](https://example.com/about): Background
`,
  llmsFullTxt: `# Site
> Example company overview for agents.

Extended annotated index.

## Core
- [Home](https://example.com/): Primary overview
- [About](https://example.com/about): Background
## Optional
- [XML sitemap](https://example.com/sitemap.xml): Full URL inventory
`,
};

describe("scoreScan", () => {
  it("scores healthy site high", () => {
    const result = scoreScan({ pages: healthyPages, siteFiles: healthyFiles });
    expect(result.scoreTotal).toBeGreaterThanOrEqual(75);
    expect(result.findings.some((f) => f.code === "MISSING_LLMS_TXT" && !f.passed)).toBe(false);
  });

  it("penalizes empty site", () => {
    const pages: DetectedPage[] = [
      {
        url: "https://example.com/",
        pageType: "home",
        fetchStatus: "ok",
        hasJsonLd: false,
        schemaTypes: [],
      },
    ];
    const files: SiteFiles = {
      robotsTxt: "User-agent: GPTBot\nDisallow: /\n",
      sitemapXml: null,
      llmsTxt: null,
      llmsFullTxt: null,
    };
    const result = scoreScan({ pages, siteFiles: files });
    expect(result.scoreTotal).toBeLessThan(40);
    expect(result.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["MISSING_LLMS_TXT", "NO_JSON_LD_HOME", "ROBOTS_BLOCKS_GPTBOT"]),
    );
  });

  it("excludes failed pages from coverage denominator", () => {
    const pages: DetectedPage[] = [
      {
        url: "https://example.com/",
        pageType: "home",
        fetchStatus: "ok",
        hasJsonLd: true,
        schemaTypes: ["Organization"],
      },
      {
        url: "https://example.com/x",
        pageType: "other",
        fetchStatus: "failed",
        hasJsonLd: false,
        schemaTypes: [],
      },
    ];
    const result = scoreScan({ pages, siteFiles: healthyFiles });
    expect(result.findings.some((f) => f.code === "PAGES_FETCH_FAILED")).toBe(true);
    expect(result.breakdown.pageCoverage).toBeGreaterThan(0);
  });

  it("pins the exact breakdown and total for the healthy fixture", () => {
    const result = scoreScan({ pages: healthyPages, siteFiles: healthyFiles });
    expect(result.breakdown).toEqual({
      structuredData: 35,
      aiDiscoveryFiles: 20,
      aiCrawlability: 20,
      pageCoverage: 15,
      answerReadiness: 10,
    });
    expect(result.scoreTotal).toBe(100);
  });

  it("caps priorityFixes at 5 and prefers higher-impact failures first", () => {
    const pages: DetectedPage[] = [
      {
        url: "https://example.com/",
        pageType: "home",
        fetchStatus: "ok",
        hasJsonLd: false,
        schemaTypes: [],
      },
    ];
    const files: SiteFiles = {
      robotsTxt: "User-agent: GPTBot\nDisallow: /\n",
      sitemapXml: null,
      llmsTxt: null,
      llmsFullTxt: null,
    };
    const result = scoreScan({ pages, siteFiles: files });
    expect(result.priorityFixes.length).toBeLessThanOrEqual(5);
    // ROBOTS_BLOCKS_GPTBOT zeroes the full aiCrawlability weight (20pts), the
    // largest single recoverable gain among this fixture's findings.
    expect(result.priorityFixes[0]).toMatch(/GPTBot/i);
  });
});
