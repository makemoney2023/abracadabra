import { describe, expect, it } from "vitest";
import { buildReportProps, type ReportInput } from "@/lib/pdf/report";

describe("buildReportProps", () => {
  it("maps scan payload into PDF-friendly props", () => {
    const input: ReportInput = {
      domain: "acme.example",
      scoreTotal: 62,
      scoreBreakdown: {
        structuredData: 20,
        aiDiscoveryFiles: 12,
        aiCrawlability: 15,
        pageCoverage: 10,
        answerReadiness: 5,
      },
      pages: [
        {
          url: "https://acme.example/",
          pageType: "home",
          fetchStatus: "ok",
          hasJsonLd: true,
          schemaTypes: ["Organization"],
        },
      ],
      findings: [
        {
          code: "MISSING_LLMS_TXT",
          severity: "critical",
          passed: false,
          message: "No llms.txt",
        },
      ],
    };

    const props = buildReportProps(input);
    expect(props.title).toContain("acme.example");
    expect(props.scoreTotal).toBe(62);
    expect(props.summaryHeadline).toMatch(/62/);
    expect(props.summaryBody).toMatch(/acme\.example/);
    expect(props.summaryDrivers.length).toBeGreaterThan(0);
    expect(props.pillars).toHaveLength(5);
    expect(props.pages[0]?.url).toBe("https://acme.example/");
    expect(props.findings[0]?.code).toBe("MISSING_LLMS_TXT");
  });
});
