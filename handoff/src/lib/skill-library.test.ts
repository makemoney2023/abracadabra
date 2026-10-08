import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clipSkillBody,
  readPublishedSkill,
  searchPublishedSkills,
  searchSkills,
  skillIndexFromFiles,
  skillObjectKey,
  type SkillBucket,
} from "./skill-library";
import { readSkillTree } from "./skill-tree";

const SCROLL = `---
name: scroll-world
description: >-
  Build a 3D scroll cinematic landing page. Use when the user wants a scrollable world.
---
# scroll-world
Fly through the scenes.
`;

const COPY = `---
name: copywriting
description: Write landing page copy.
---
# copy
Write the page.
`;

function bucket(objects: Record<string, string>): SkillBucket {
  return {
    async get(key) {
      const body = objects[key];
      if (body === undefined) return null;
      return { text: async () => body };
    },
  };
}

describe("skill library", () => {
  it("keeps a folded description and skips the org pack", () => {
    const index = skillIndexFromFiles([
      { path: "community/scroll-world/SKILL.md", raw: SCROLL },
      { path: "org/orchestrator/SKILL.md", raw: COPY },
      { path: "notes.txt", raw: COPY },
    ]);
    expect(index).toEqual([
      {
        name: "scroll-world",
        description: "Build a 3D scroll cinematic landing page. Use when the user wants a scrollable world.",
        path: "community/scroll-world/SKILL.md",
        pack: "community",
      },
    ]);
  });

  it("ranks a 3D scroll site to the scroll skill and cites the repo path", () => {
    const hits = searchSkills(
      [
        { name: "copywriting", description: "Write landing page copy.", path: "community/marketingskills/copywriting/SKILL.md" },
        { name: "scroll-world", description: "Build a 3D scroll cinematic landing page.", path: "community/scroll-world/SKILL.md" },
      ],
      "what skill would you use to create a 3d scroll website?",
    );
    expect(hits[0]).toMatchObject({
      name: "scroll-world",
      cited: ".cursor/skills/community/scroll-world/SKILL.md",
    });
    expect(hits.map((hit) => hit.name)).not.toContain("copywriting");
  });

  it("refuses a path that leaves the library", () => {
    expect(skillObjectKey("community/scroll-world/SKILL.md")).toBe("skills/community/scroll-world/SKILL.md");
    expect(skillObjectKey(".cursor/skills/community/scroll-world/SKILL.md")).toBe(
      "skills/community/scroll-world/SKILL.md",
    );
    expect(skillObjectKey("../secrets/SKILL.md")).toBeNull();
    expect(skillObjectKey("community/scroll-world/README.md")).toBeNull();
  });

  it("searches the published index and reads one skill", async () => {
    const store = bucket({
      "skills/index.json": JSON.stringify({
        skills: [
          {
            name: "scroll-world",
            description: "Build a 3D scroll cinematic landing page.",
            path: "community/scroll-world/SKILL.md",
          },
        ],
      }),
      "skills/community/scroll-world/SKILL.md": SCROLL,
    });
    const found = await searchPublishedSkills(store, "3d scroll website");
    expect(found).toMatchObject({ ok: true });
    if (!found.ok) return;
    expect(found.skills[0]?.cited).toBe(".cursor/skills/community/scroll-world/SKILL.md");

    const skill = await readPublishedSkill(store, found.skills[0]?.path ?? "");
    expect(skill).toMatchObject({ ok: true, cited: ".cursor/skills/community/scroll-world/SKILL.md" });
    if (skill.ok) expect(skill.body).toContain("Fly through the scenes.");

    expect(await searchPublishedSkills(undefined, "scroll")).toEqual({
      ok: false,
      error: "The skill library is not connected.",
    });
    expect(await searchPublishedSkills(bucket({}), "scroll")).toEqual({
      ok: false,
      error: "The skill library has not been published.",
    });
    expect(await readPublishedSkill(store, "../secrets/SKILL.md")).toEqual({
      ok: false,
      error: "That skill path is not allowed.",
    });
  });

  it("clips a long skill body", () => {
    const body = clipSkillBody("a".repeat(20), 8);
    expect(body.startsWith("aaaaaaaa")).toBe(true);
    expect(body).toContain("[truncated]");
  });

  it("reads SKILL.md files from a tree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skills-"));
    await mkdir(path.join(root, "community", "scroll-world"), { recursive: true });
    await mkdir(path.join(root, "org", "seat"), { recursive: true });
    await writeFile(path.join(root, "community", "scroll-world", "SKILL.md"), SCROLL);
    await writeFile(path.join(root, "org", "seat", "SKILL.md"), COPY);
    await mkdir(path.join(root, ".agents", "threejs"), { recursive: true });
    await writeFile(path.join(root, ".agents", "threejs", "SKILL.md"), COPY);
    const files = await readSkillTree(root);
    expect(files.map((file) => file.path)).toEqual([
      ".agents/threejs/SKILL.md",
      "community/scroll-world/SKILL.md",
    ]);
  });
});
