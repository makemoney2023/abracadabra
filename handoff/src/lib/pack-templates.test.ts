import { describe, expect, it } from "vitest";
import { deliverableKind, needsSourcePacket, packKey, packTemplateId, packTemplatesFromCatalog, sourcePacketReady } from "./pack-templates";

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

  it("builds one skill template per skill and leaves tool trees out", () => {
    const templates = packTemplatesFromCatalog(catalog);
    expect(templates.map((template) => template.id)).toEqual([
      "skill-community-awesome-claude-corporate-skills-05-sales-account-research",
      "skill-community-awesome-claude-corporate-skills-05-sales-call-prep",
      "skill-community-marketingskills-copywriting",
      "skill-community-lonely-pack-only",
      "skill-community-marketingskills-seo-audit",
    ]);
    const copy = templates.find((template) => template.name === "copywriting");
    expect(copy?.nodes).toHaveLength(1);
    expect(copy?.edges).toEqual([]);
    expect(copy?.nodes[0]?.instructions).toContain(".cursor/skills/community/marketingskills/copywriting/SKILL.md");
    expect(copy?.nodes[0]?.instructions).toContain("at most 7");
    expect(copy?.nodes[0]?.instructions).toContain("platform, type, hook, body, hashtags, CTA");
    expect(copy?.nodes[0]?.instructions).toContain("Do not invent");
    const audit = templates.find((template) => template.name === "seo-audit");
    expect(audit?.nodes[0]?.type).toBe("researcher");
    expect(templates.some((template) => template.id === "pack-community")).toBe(false);
  });

  it("types a generation skill as a writer even when its text mentions review words", () => {
    const templates = packTemplatesFromCatalog([
      {
        name: "ad-creative",
        description: "When the user wants to generate ad creative — headlines and RSA copy. Check platform limits.",
        path: "community/marketingskills/ad-creative/SKILL.md",
      },
      {
        name: "page-cro",
        description: "Review a landing page for conversion issues.",
        path: "community/marketingskills/page-cro/SKILL.md",
      },
    ]);
    expect(templates.find((template) => template.name === "ad-creative")?.nodes[0]?.type).toBe("writer");
    expect(templates.find((template) => template.name === "page-cro")?.nodes[0]?.type).toBe("critic");
    expect(templates.find((template) => template.name === "ad-creative")?.nodes[0]?.instructions).toContain(
      "Do not write a 90-day calendar",
    );
  });

  it("maps a task skill path to the live pack id", () => {
    expect(packTemplateId(".cursor/skills/community/marketingskills/ad-creative/SKILL.md")).toBe(
      "skill-community-marketingskills-ad-creative",
    );
    expect(
      packTemplateId(".cursor/skills/community/advertising-skills/skills/operator-os/scroll-stopping-creative/SKILL.md"),
    ).toBe("skill-community-advertising-skills-skills-operator-os-scroll-stopping-creative");
    expect(packTemplateId("notes.md")).toBeNull();
  });

  it("asks copy and visuals for a source packet and lets research gather sources", () => {
    expect(sourcePacketReady("Facts: Ken Miller smiled.\nDo not use: transform your smile")).toBe(true);
    expect(sourcePacketReady("Write 90 posts")).toBe(false);
    expect(needsSourcePacket(deliverableKind({ name: "copywriting", path: "community/marketingskills/copywriting/SKILL.md" }))).toBe(
      true,
    );
    expect(needsSourcePacket(deliverableKind({ name: "image", path: "community/visual-skills/image/SKILL.md" }))).toBe(true);
    expect(
      needsSourcePacket(
        deliverableKind({ name: "parallel-web-search", path: "plugins/parallel/parallel-web-search/SKILL.md" }),
      ),
    ).toBe(false);
  });
});
