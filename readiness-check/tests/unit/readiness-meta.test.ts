import { describe, expect, it, vi } from "vitest";
import { META_COPY, READINESS_META_COPY } from "@/lib/marketing/copy";

vi.mock("@/components/check/CheckSession", () => ({ CheckSession: () => null }));
vi.mock("@/components/check/CheckMenu", () => ({ CheckMenu: () => null }));

/** The Readiness Check never says "free" and never promises a score, band or grade (Christopher, Oct 25). */
const BANNED = /\bfree\b|\bscor(e|es|ed|ing)\b|\bband\b|\bgrade\b|out of 100|\/100/i;

describe("Readiness Check metadata", () => {
  it("results-page copy says stage name and next steps, with no free or score wording", () => {
    expect(READINESS_META_COPY.description).not.toMatch(BANNED);
    expect(READINESS_META_COPY.title).not.toMatch(BANNED);
    expect(READINESS_META_COPY.description).toMatch(/stage name/i);
    expect(READINESS_META_COPY.description).toMatch(/next steps/i);
  });

  it("the root fallback description has no free or score wording", () => {
    expect(META_COPY.description).not.toMatch(BANNED);
  });

  it("the results page (/check/[token]) and the check layout use the Readiness Check description", async () => {
    const page = await import("@/app/check/[token]/page");
    const layout = await import("@/app/check/layout");
    for (const metadata of [page.metadata, layout.metadata]) {
      expect(metadata.description).toBe(READINESS_META_COPY.description);
      expect(String(metadata.description)).not.toMatch(BANNED);
    }
  });
});
