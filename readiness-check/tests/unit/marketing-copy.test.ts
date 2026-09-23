import { describe, expect, it } from "vitest";
import {
  LANDING_COPY,
  OPT_IN_COPY,
  SCAN_CTA,
  SCORE_PREVIEW_COPY,
  UNLOCK_COPY,
} from "@/lib/marketing/copy";

describe("marketing copy — AI Blind Spot", () => {
  it("uses AI visibility as the primary scan CTA", () => {
    expect(SCAN_CTA).toBe("Check your AI visibility");
  });

  it("frames the landing around the AI blind spot, not schema jargon", () => {
    expect(LANDING_COPY.eyebrow).toMatch(/AI readiness/i);
    expect(LANDING_COPY.brand).toBe("Schema");
    expect(LANDING_COPY.heroSubhead.toLowerCase()).toMatch(/chatgpt|perplexity|gemini|answer/);
    expect(LANDING_COPY.heroSubhead.toLowerCase()).not.toMatch(/json-ld/);
    expect(LANDING_COPY.problemTitle.toLowerCase()).toMatch(/blind spot|blue link|ai/);
    expect(LANDING_COPY.analogyTitle.toLowerCase()).toMatch(/translation|business card|brochure/);
    expect(LANDING_COPY.steps.length).toBeGreaterThanOrEqual(3);
    expect(LANDING_COPY.faqs.length).toBeGreaterThanOrEqual(3);
  });

  it("aligns unlock and opt-in with AI-readability language", () => {
    expect(UNLOCK_COPY.title.toLowerCase()).toMatch(/unlock|pages|ai/);
    expect(UNLOCK_COPY.body.toLowerCase()).toMatch(/page|ai|read/);
    expect(OPT_IN_COPY.title.toLowerCase()).toMatch(/blind spot|help|fix/);
    expect(SCORE_PREVIEW_COPY.label.toLowerCase()).toMatch(/visibility|readiness/);
  });
});
