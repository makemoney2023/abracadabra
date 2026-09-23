import { describe, expect, it } from "vitest";
import { PILLAR_DESCRIPTIONS, getPillarDescription } from "@/lib/scoring/pillar-why";

describe("PILLAR_DESCRIPTIONS", () => {
  it("explains every scoring pillar in plain language", () => {
    expect(Object.keys(PILLAR_DESCRIPTIONS)).toEqual([
      "structuredData",
      "aiDiscoveryFiles",
      "aiCrawlability",
      "pageCoverage",
      "answerReadiness",
    ]);
    for (const key of Object.keys(PILLAR_DESCRIPTIONS) as Array<keyof typeof PILLAR_DESCRIPTIONS>) {
      expect(getPillarDescription(key).length).toBeGreaterThan(20);
    }
  });

  it("mentions the signals each pillar checks", () => {
    expect(PILLAR_DESCRIPTIONS.structuredData).toMatch(/JSON-LD/i);
    expect(PILLAR_DESCRIPTIONS.aiDiscoveryFiles).toMatch(/llms\.txt/i);
    expect(PILLAR_DESCRIPTIONS.aiCrawlability).toMatch(/robots\.txt/i);
    expect(PILLAR_DESCRIPTIONS.pageCoverage).toMatch(/JSON-LD/i);
    expect(PILLAR_DESCRIPTIONS.answerReadiness).toMatch(/FAQ|organization/i);
  });
});
