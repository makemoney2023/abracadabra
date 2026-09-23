import { describe, expect, it } from "vitest";
import { buildOutreachBlurb } from "@/lib/ops/outreach";

describe("buildOutreachBlurb", () => {
  it("includes company, score, and top gaps", () => {
    const blurb = buildOutreachBlurb(
      { name: "Acme Co", domain: "acme.example" },
      {
        scoreTotal: 32,
        topGaps: [
          { message: "Missing llms.txt" },
          { message: "No JSON-LD on home" },
        ],
      },
    );

    expect(blurb).toContain("Acme Co");
    expect(blurb).toContain("acme.example");
    expect(blurb).toContain("32");
    expect(blurb).toContain("Missing llms.txt");
    expect(blurb).toContain("No JSON-LD on home");
  });

  it("falls back to domain when name missing", () => {
    const blurb = buildOutreachBlurb(
      { domain: "solo.example" },
      { scoreTotal: 50, topGaps: [] },
    );
    expect(blurb).toContain("solo.example");
    expect(blurb).toContain("50");
  });
});
