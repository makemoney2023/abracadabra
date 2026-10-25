import { describe, expect, it } from "vitest";
import { explainCoverage } from "./coverage-reasons";

describe("explainCoverage", () => {
  it("explains common Google reasons in plain words with a tone", () => {
    expect(explainCoverage("Page with redirect")).toMatchObject({ tone: "expected" });
    expect(explainCoverage("Page with redirect").text).toMatch(/usually expected/i);
    expect(explainCoverage("Crawled - currently not indexed").tone).toBe("fix");
    expect(explainCoverage("Submitted and indexed").tone).toBe("expected");
    expect(explainCoverage("Excluded by \u2018noindex\u2019 tag").tone).toBe("watch");
    expect(explainCoverage("  NOT FOUND (404) ").tone).toBe("fix");
  });

  it("falls back for unknown or empty states", () => {
    expect(explainCoverage("Something new from Google").tone).toBe("watch");
    expect(explainCoverage(null).text).toMatch(/don't have a plain explanation/);
  });
});
