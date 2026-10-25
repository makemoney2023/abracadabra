import { describe, expect, it, vi } from "vitest";
import { META_COPY, READINESS_META_COPY } from "@/lib/marketing/copy";

vi.mock("@/components/check/CheckSession", () => ({ CheckSession: () => null }));
vi.mock("@/components/check/CheckMenu", () => ({ CheckMenu: () => null }));

/** The Readiness Check is never called "free" (Christopher). Scores are shown since #227, so "score" is allowed. */
const FREE = /\bfree\b/i;
/** No fixed tip count (Christopher, Oct 25): "three suggestions in each section", "up to three next steps" and the like. */
const TIP_COUNT = /\b(?:one|two|three|four|five|[1-5]|up to \w+)\s+(?:suggestions?|tips?|next steps?|ideas|fixes)\b|\b(?:suggestions|tips|next steps)\s+(?:in|for|per)\s+(?:each|every)\s+section\b/i;

describe("Readiness Check metadata", () => {
  it("results-page copy names the stage and next steps, never free, never a tip count", () => {
    for (const text of [READINESS_META_COPY.title, READINESS_META_COPY.description]) {
      expect(text).not.toMatch(FREE);
      expect(text).not.toMatch(TIP_COUNT);
    }
    expect(READINESS_META_COPY.description).toMatch(/stage/i);
    expect(READINESS_META_COPY.description).toMatch(/next steps/i);
  });

  it("the root fallback description (the Schema landing's) does not call anything free", () => {
    expect(META_COPY.description).not.toMatch(FREE);
  });

  it("the results page (/check/[token]) and the check layout use the Readiness Check description, not the Schema landing's", async () => {
    const page = await import("@/app/check/[token]/page");
    const layout = await import("@/app/check/layout");
    for (const metadata of [page.metadata, layout.metadata]) {
      expect(metadata.description).toBe(READINESS_META_COPY.description);
      expect(metadata.description).not.toBe(META_COPY.description);
    }
  });

  it("the check landing and FAQ copy never give a fixed tip count or call the check free", async () => {
    const { CHECK_FAQ } = await import("@/components/check/landing/CheckFaq");
    for (const item of CHECK_FAQ) {
      expect(item.a).not.toMatch(TIP_COUNT);
      expect(`${item.q} ${item.a}`).not.toMatch(FREE);
    }
  });
});
