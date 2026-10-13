import { describe, expect, it } from "vitest";
import { buildSpecialistAssignment, readSkillExcerpt, SPECIALIST_ASSIGNMENT_LIMIT } from "./specialist-assignment";

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

  it("puts the first 1500 characters of the skill into the assignment", async () => {
    const body = "n".repeat(2000);
    const excerpt = await readSkillExcerpt("community/marketingskills/copywriting/SKILL.md", async () => body);
    const text = buildSpecialistAssignment({
      job: "Write 7 posts",
      skillPath: "community/marketingskills/copywriting/SKILL.md",
      shape: "Return exactly 7 rows.",
      excerpt,
    });
    expect(text).toContain("Skill notes:");
    expect(text).toContain("n".repeat(1500));
    expect(text).not.toContain("n".repeat(1501));
  });

  it("builds the assignment with no excerpt when the skill reader is absent", async () => {
    const excerpt = await readSkillExcerpt("community/marketingskills/copywriting/SKILL.md");
    const text = buildSpecialistAssignment({
      job: "Write 7 posts",
      skillPath: "community/marketingskills/copywriting/SKILL.md",
      shape: "Return exactly 7 rows.",
      excerpt,
    });
    expect(excerpt).toBe("");
    expect(text).not.toContain("Skill notes:");
  });

  it("does not read a path that leaves the library", async () => {
    const calls: string[] = [];
    const readSkill = async (skillPath: string) => {
      calls.push(skillPath);
      return "secret";
    };
    expect(await readSkillExcerpt("../x/SKILL.md", readSkill)).toBe("");
    expect(await readSkillExcerpt("foo.md", readSkill)).toBe("");
    expect(calls).toEqual([]);
  });
});
