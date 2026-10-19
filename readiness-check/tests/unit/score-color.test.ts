import { describe, expect, it } from "vitest";
import {
  HEAT_STOPS,
  scoreBand,
  scoreBandLabel,
  scoreColorCss,
  scoreColorRgb,
  scorePercent,
  scoreRatio,
} from "@/lib/scoring/score-color";

describe("scoreRatio", () => {
  it("returns 0 when max is 0 or negative", () => {
    expect(scoreRatio(5, 0)).toBe(0);
    expect(scoreRatio(5, -1)).toBe(0);
  });

  it("clamps below 0 and above 1", () => {
    expect(scoreRatio(-3, 10)).toBe(0);
    expect(scoreRatio(15, 10)).toBe(1);
  });

  it("returns score/max for mid values", () => {
    expect(scoreRatio(10, 20)).toBe(0.5);
    expect(scoreRatio(35, 35)).toBe(1);
  });
});

describe("scorePercent", () => {
  it("rounds ratio to a whole percent", () => {
    expect(scorePercent(10, 35)).toBe(29);
    expect(scorePercent(20, 20)).toBe(100);
  });
});

describe("HEAT_STOPS", () => {
  it("defines studio vermilion → amber → cyan → mint hex stops", () => {
    expect(HEAT_STOPS.map((s) => s.t)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(HEAT_STOPS.every((s) => /^#[0-9A-F]{6}$/i.test(s.hex))).toBe(true);
    expect(HEAT_STOPS[0]!.hex.toUpperCase()).toBe("#FF4B24");
    expect(HEAT_STOPS[3]!.hex.toUpperCase()).toBe("#8DEBF2");
    expect(HEAT_STOPS[4]!.hex.toUpperCase()).toBe("#C6FFB3");
  });
});

describe("scoreColorRgb heat palette", () => {
  it("is vermilion at 0, amber-leaning at 0.5, mint at 1", () => {
    const vermilion = scoreColorRgb(0);
    const mid = scoreColorRgb(0.5);
    const mint = scoreColorRgb(1);

    expect(vermilion.r).toBeGreaterThan(230);
    expect(vermilion.g).toBeLessThan(100);
    // Amber mid: high R+G, low B
    expect(mid.r).toBeGreaterThan(180);
    expect(mid.g).toBeGreaterThan(140);
    expect(mid.b).toBeLessThan(120);
    // Mint: green channel leads
    expect(mint.g).toBeGreaterThan(mint.r);
    expect(mint.g).toBeGreaterThan(200);
  });

  it("uses phosphor mint at full score", () => {
    expect(scoreColorCss(1).toUpperCase()).toBe("#C6FFB3");
  });
});

describe("scoreColorCss", () => {
  it("returns #RRGGBB from the heat stops", () => {
    expect(scoreColorCss(0)).toMatch(/^#[0-9A-F]{6}$/i);
    expect(scoreColorCss(0).toUpperCase()).toBe(HEAT_STOPS[0]!.hex.toUpperCase());
    expect(scoreColorCss(1).toUpperCase()).toBe(HEAT_STOPS[4]!.hex.toUpperCase());
  });
});

describe("scoreBand", () => {
  it("labels qualitative ranges without relying on color alone", () => {
    expect(scoreBand(0)).toBe("poor");
    expect(scoreBand(0.24)).toBe("poor");
    expect(scoreBand(0.25)).toBe("fair");
    expect(scoreBand(0.49)).toBe("fair");
    expect(scoreBand(0.5)).toBe("good");
    expect(scoreBand(0.74)).toBe("good");
    expect(scoreBand(0.75)).toBe("strong");
    expect(scoreBand(1)).toBe("strong");
  });
});

describe("scoreBandLabel", () => {
  it("returns human labels for bands", () => {
    expect(scoreBandLabel("poor")).toBe("Poor");
    expect(scoreBandLabel("fair")).toBe("Fair");
    expect(scoreBandLabel("good")).toBe("Good");
    expect(scoreBandLabel("strong")).toBe("Strong");
  });
});
