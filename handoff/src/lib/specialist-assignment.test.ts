import { describe, expect, it } from "vitest";
import {
  buildSpecialistAssignment,
  labeledSection,
  readSkillExcerpt,
  SPECIALIST_ASSIGNMENT_LIMIT,
  withoutSections,
} from "./specialist-assignment";

describe("brief sections", () => {
  const brief = "Write 7 posts for North.\n\nFacts:\nOpen Sundays\n\nAnswers:\nUse a warm tone\n\nDo not use:\nUnlock";

  it("stops a section at the Answers label", () => {
    expect(labeledSection(brief, "Facts")).toBe("Open Sundays");
    expect(labeledSection(brief, "Answers")).toBe("Use a warm tone");
  });

  it("removes repeated sections from the job and keeps the rest", () => {
    const job = withoutSections(brief, ["Facts", "Do not use", "Answers"]);
    expect(job).toBe("Write 7 posts for North.");
  });

  it("puts each fact into the assignment once", () => {
    const text = buildSpecialistAssignment({
      job: withoutSections(brief, ["Facts", "Do not use", "Answers"]),
      skillPath: "copywriting/SKILL.md",
      shape: "Return exactly 7 rows.",
      facts: labeledSection(brief, "Facts"),
    });
    expect(text.match(/Facts:/g)).toHaveLength(1);
    expect(text.match(/Open Sundays/g)).toHaveLength(1);
  });
});

describe("readSkillExcerpt frontmatter", () => {
  it("drops YAML frontmatter before the excerpt", async () => {
    const excerpt = await readSkillExcerpt("x/SKILL.md", async () => "---\nname: copy\ndescription: long\n---\n# Copy\nWrite plainly.");
    expect(excerpt).toBe("# Copy\nWrite plainly.");
  });
});

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
