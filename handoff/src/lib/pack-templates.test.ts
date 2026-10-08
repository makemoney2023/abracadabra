import { describe, expect, it } from "vitest";
import { packKey, packTemplatesFromCatalog } from "./pack-templates";

const catalog = [
  {
    name: "copywriting",
    description: "Write landing page copy.",
    path: "community/marketingskills/copywriting/SKILL.md",
  },
  {
    name: "seo-audit",
    description: "Audit a site for search.",
    path: "community/marketingskills/seo-audit/SKILL.md",
  },
  {
    name: "account-research",
    description: "Research a sales account.",
    path: "community/awesome-claude-corporate-skills/05-sales/account-research/SKILL.md",
  },
  {
    name: "call-prep",
    description: "Prepare a sales call.",
    path: "community/awesome-claude-corporate-skills/05-sales/call-prep/SKILL.md",
  },
  {
    name: "scene",
    description: "Build a scene.",
    path: "community/openmontage/tools/scene/SKILL.md",
  },
  {
    name: "lonely",
    description: "Only one skill in this folder.",
    path: "community/lonely-pack/only/SKILL.md",
  },
  {
    name: "one",
    description: "A top-level community skill.",
    path: "community/one/SKILL.md",
  },
  {
    name: "two",
    description: "Another top-level community skill.",
    path: "community/two/SKILL.md",
  },
];

describe("pack templates", () => {
  it("groups a skill with its related folder", () => {
    expect(packKey("community/marketingskills/copywriting/SKILL.md")).toBe("community/marketingskills");
    expect(packKey("community/awesome-claude-corporate-skills/05-sales/account-research/SKILL.md")).toBe(
      "community/awesome-claude-corporate-skills/05-sales",
    );
    expect(packKey("community/business-analysis-skills/skills/probe/SKILL.md")).toBe("community/business-analysis-skills");
  });

  it("builds a chain for each related pack and leaves tool trees out", () => {
    const templates = packTemplatesFromCatalog(catalog);
    expect(templates.map((template) => template.id)).toEqual([
      "pack-community-marketingskills",
      "pack-community-awesome-claude-corporate-skills-05-sales",
    ]);
    const marketing = templates.find((template) => template.id === "pack-community-marketingskills");
    expect(marketing?.nodes.map((node) => node.name)).toEqual(["copywriting", "seo-audit"]);
    expect(marketing?.nodes[1]?.type).toBe("researcher");
    expect(marketing?.nodes[0]?.instructions).toContain(".cursor/skills/community/marketingskills/copywriting/SKILL.md");
    expect(templates.some((template) => template.id === "pack-community")).toBe(false);
    expect(marketing?.edges).toEqual([
      {
        id: "pack-community-marketingskills-e1",
        source: "pack-community-marketingskills-1",
        target: "pack-community-marketingskills-2",
      },
    ]);
  });
});
