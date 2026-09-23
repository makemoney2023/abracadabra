import { describe, expect, it } from "vitest";
import { assessmentConfigSchema } from "@/lib/assessment/config-schema";
import { config } from "@/lib/assessment/config";
import { CHECK_GUIDES } from "@/content/check-guides";
import { getSteps, nextStep } from "@/lib/assessment/steps";
import { validateAnswer } from "@/lib/assessment/validate-answer";
import { FINDING_IMPACT } from "@/lib/scoring/constants";
import type { FindingCode } from "@/lib/types";

const BANNED = /\b(streamline|innovative|transformational|leverage)\b/i;

function withoutProductName(text: string): string {
  return text.replace(/LLM Leverage/g, "").replace(/llm-leverage-course/g, "");
}

describe("assessment config", () => {
  it("validates the shipped v1 config", () => {
    expect(config.meta.version).toBe("v1");
    expect(config.questions.filter((q) => q.id.startsWith("P") || q.id === "pressure")).toBeTruthy();
    const pressure = config.questions.find((q) => q.id === "pressure");
    expect(pressure?.options).toHaveLength(12);
    expect(config.questions.filter((q) => q.id.startsWith("R"))).toHaveLength(8);
    expect(config.questions.filter((q) => q.id.startsWith("G"))).toHaveLength(4);
    expect(config.questions.filter((q) => q.id.startsWith("Q"))).toHaveLength(4);
  });

  it("rejects a broken offer row and a gap in bands", () => {
    const broken = structuredClone(config);
    broken.questions[0].options![0].offerRow = "nope";
    expect(assessmentConfigSchema.safeParse(broken).success).toBe(false);
    const gapped = structuredClone(config);
    gapped.bands[1].min = 50;
    expect(assessmentConfigSchema.safeParse(gapped).success).toBe(false);
  });

  it("keeps banned brand words out of config and guides", () => {
    const blob = withoutProductName(JSON.stringify(config) + JSON.stringify(CHECK_GUIDES));
    expect(blob.match(BANNED)).toBeNull();
  });

  it("maps every finding code to a fix guide", () => {
    for (const code of Object.keys(FINDING_IMPACT) as FindingCode[]) {
      const slug = `fix/${code.toLowerCase().replace(/_/g, "-")}`;
      expect(config.suggestions.some((s) => s.code === code && s.guideSlug === slug)).toBe(true);
      expect(CHECK_GUIDES.some((g) => g.slug === slug)).toBe(true);
    }
  });

  it("adds a severity step only for selected symptoms", () => {
    const none = getSteps(config, {});
    expect(none.map((s) => s.id)).not.toContain("severity:P01");
    const some = getSteps(config, { pressure: ["P02", "P01"] });
    expect(some.map((s) => s.id)).toEqual(
      expect.arrayContaining(["pressure", "severity:P02", "severity:P01", "R01", "G04", "Q04"]),
    );
    const dropped = getSteps(config, { pressure: ["P01"] });
    expect(dropped.map((s) => s.id)).not.toContain("severity:P02");
    expect(nextStep(config, { pressure: ["P01"] }, "Q04")).toBe("gate");
  });

  it("rejects a bad option and normalizes a URL", () => {
    expect(validateAnswer(config, "R01", "9").ok).toBe(false);
    const url = validateAnswer(config, "G04", "WWW.Example.com/path");
    expect(url.ok).toBe(true);
    if (url.ok) {
      expect(url.domain).toBe("example.com");
      expect(url.origin).toBe("https://example.com");
    }
  });
});
