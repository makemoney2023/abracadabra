import { describe, expect, it } from "vitest";
import { buildSpecialistAssignment, SPECIALIST_ASSIGNMENT_LIMIT } from "./specialist-assignment";

describe("buildSpecialistAssignment", () => {
  it("includes the source packet, the skill, and the accepted page", () => {
    const text = buildSpecialistAssignment({
      job: "Write 7 posts",
      skillPath: ".cursor/skills/community/marketingskills/copywriting/SKILL.md",
      shape: "Return exactly 7 rows.",
      facts: "Open Sundays",
      banned: "Unlock",
      voice: "Voice:\nShort lines.",
      handoff: JSON.stringify([{ name: "North", fact: "Open Sundays", source: "https://north.example" }]),
      rejected: "REJECTED DRAFT",
    });
    expect(text).toContain("Facts:");
    expect(text).toContain("Do not use:");
    expect(text).toContain("Shape:");
    expect(text).toContain("copywriting/SKILL.md");
    expect(text).toContain("Open Sundays");
    expect(text).not.toContain("REJECTED DRAFT");
    expect(text).toContain("Voice:");
  });

  it("cuts a long excerpt and a long table on a row boundary", () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({ name: `n${index}`, fact: "x".repeat(200), source: "https://example.com" }));
    const text = buildSpecialistAssignment({
      job: "Audit",
      skillPath: ".cursor/skills/community/marketingskills/seo-audit/SKILL.md",
      shape: "Return the audit.",
      excerpt: "e".repeat(2000),
      handoff: JSON.stringify(rows),
    });
    expect(text).toContain("rows omitted");
    expect(text).not.toContain("e".repeat(1600));
    expect(text.length).toBeLessThanOrEqual(SPECIALIST_ASSIGNMENT_LIMIT);
  });

  it("omits an empty voice card and does not include golden pages", () => {
    const text = buildSpecialistAssignment({
      job: "Headline",
      skillPath: ".cursor/skills/community/marketingskills/copywriting/SKILL.md",
      shape: "One headline.",
    });
    expect(text).not.toContain("Voice:");
    expect(text).not.toContain("Sunday hours");
  });
});
