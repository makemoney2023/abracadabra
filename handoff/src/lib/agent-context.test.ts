import { describe, expect, it } from "vitest";
import { answerSummaryFromScores, stageSummaryFromScores } from "./agent-context";

const scores = JSON.stringify({
  overall: { total: 55, band: "forming" },
  readiness: { total: 61 },
  growth: { total: 33 },
  visibility: { total: null },
});

describe("Readiness Check summaries", () => {
  it("keeps the numbers for staff and reminds agents not to quote them", () => {
    const text = answerSummaryFromScores(scores, 55);
    expect(text).toContain("Overall forming (55/100).");
    expect(text).toContain("Readiness 61.");
    expect(text).toContain("Staff only: never quote these numbers to the client");
  });

  it("gives the client-safe stage line with no number", () => {
    const text = stageSummaryFromScores(scores);
    expect(text).toBe("Readiness Check stage: Forming.");
    expect(text).not.toMatch(/\d/);
  });

  it("handles missing or unknown stages", () => {
    expect(stageSummaryFromScores("not json")).toBe("No Readiness Check stage is stored.");
    expect(stageSummaryFromScores(JSON.stringify({ overall: { band: "weird" } }))).toBe("No Readiness Check stage is stored.");
    expect(answerSummaryFromScores("{}", null)).toBe("No scored summary is stored.");
  });
});
