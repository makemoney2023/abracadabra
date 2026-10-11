import type { SkillCard } from "./client-documents";

export type PackAgentType = "researcher" | "writer" | "editor" | "publisher" | "critic" | "summarizer";

export type PackTemplate = {
  id: string;
  name: string;
  description: string;
  nodes: {
    id: string;
    type: PackAgentType;
    name: string;
    instructions: string;
    position: { x: number; y: number };
  }[];
  edges: { id: string; source: string; target: string }[];
};

/** Every pack node and every swarm brief. One job, sourced, and short enough to stay specific. */
export const SWARM_BATCH_CONTRACT =
  "Do this skill's one job. Write at most 7 items, for one persona or one theme. Use only facts in the input and name each source. Do not invent competitors, credentials, testimonials, prices, dates, or KPIs. Do not repeat a phrase. Do not open with Transform your, Real smiles, Unlock, Discover the secret, or Ready to. If a fact is missing, say it is missing.";

export type DeliverableKind = "research" | "copy" | "visual" | "language" | "skill";

const OUTPUT_SHAPES: Record<Exclude<DeliverableKind, "skill">, string> = {
  research: "Return a table with columns name, fact, source, and unknown. One row per competitor or persona. Do not write posts.",
  copy: "Return exactly 7 rows for one persona. Columns: platform, type, hook, body, hashtags, CTA. A proof row uses a quote from the input. Do not write a 90-day calendar.",
  visual: "Return one image prompt and one video prompt for each approved post in the input. Use the brand colors and fonts from the input. No placeholder model name.",
  language: "Return the same 7 rows with repeated and generic lines replaced. Do not add posts.",
};

/** Which deliverable this skill is allowed to produce. */
export function deliverableKind(skill: { name: string; path: string }): DeliverableKind {
  const name = skill.name.toLowerCase();
  const path = skill.path.toLowerCase();
  if (name.includes("generic-language") || path.includes("generic-language")) return "language";
  if (path.includes("visual-skills") || name === "image" || name === "video") return "visual";
  if (
    name === "copywriting" ||
    path.includes("copywriting") ||
    name === "social" ||
    path.includes("/social/") ||
    name === "ad-creative" ||
    path.includes("ad-creative")
  ) {
    return "copy";
  }
  if (
    name === "parallel-web-search" ||
    name === "parallel-deep-research" ||
    name === "competitor-teardown" ||
    path.includes("parallel-web-search")
  ) {
    return "research";
  }
  return "skill";
}

export function outputShape(kind: DeliverableKind): string {
  return kind === "skill" ? "" : OUTPUT_SHAPES[kind];
}

/** Copy, visuals, and the language pass need facts and banned lines in the brief. */
export function needsSourcePacket(kind: DeliverableKind): boolean {
  return kind === "copy" || kind === "visual" || kind === "language";
}

export function sourcePacketReady(brief: string): boolean {
  const text = brief.toLowerCase();
  return text.includes("facts:") && text.includes("do not use:");
}

/** Skill path, a short description, the batch contract, and the output shape. */
export function packSkillInstructions(skill: { name: string; path: string; description: string }): string {
  const path = skill.path.trim().replace(/^\.cursor\/skills\//, "");
  const description = skill.description.replace(/\s+/g, " ").trim().slice(0, 280);
  const shape = outputShape(deliverableKind(skill));
  return `Follow .cursor/skills/${path}. ${description} ${SWARM_BATCH_CONTRACT}${shape ? ` ${shape}` : ""}`.trim();
}

/** One swarm template for one skill. A path that is not a pack skill returns null. */
export function skillTemplateId(skillPath: string): string | null {
  const relative = skillPath.trim().replace(/^\/+/, "").replace(/^\.cursor\/skills\//, "");
  if (!relative || !relative.toLowerCase().endsWith("/skill.md")) return null;
  const pack = packKey(relative);
  if (!pack || pack.split("/").length < 2 || skipped(pack) || skipped(relative)) return null;
  return `skill-${slug(relative.replace(/\/skill\.md$/i, ""))}`;
}

const SKIP = ["openmontage", "remotion", "img2threejs", "text-to-cad", "openvid", "cursor-managed", "context-engineering"];

/** Folder that groups related skills. The skill's own directory is not the pack. */
export function packKey(skillPath: string): string {
  const parts = skillPath.replaceAll("\\", "/").split("/").filter(Boolean);
  if (parts.at(-1)?.toLowerCase() === "skill.md") parts.pop();
  if (parts.length >= 2) parts.pop();
  while (parts.at(-1) === "skills") parts.pop();
  return parts.join("/") || "root";
}

function skipped(value: string): boolean {
  const parts = value.split("/");
  return SKIP.some((part) => parts.includes(part));
}

/** The swarm template id for a task skill path. A path that is not a pack skill returns null. */
export function packTemplateId(skillPath: string): string | null {
  return skillTemplateId(skillPath);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function agentType(skill: SkillCard): PackAgentType {
  const text = `${skill.name} ${skill.description}`.toLowerCase();
  if (/\b(generate|write|create|draft)\b/.test(text)) return "writer";
  if (/research|seo|audit|competitor|teardown|discover/.test(text)) return "researcher";
  if (/\b(critic|critique|review|objection|risk|qa|check)\b/.test(text)) return "critic";
  if (/edit|proof|rewrite/.test(text)) return "editor";
  if (/publish|brief|checklist|report/.test(text)) return "publisher";
  if (/summar/.test(text)) return "summarizer";
  return "writer";
}

/** One single-skill template per pack skill. The swarm runs that skill alone. */
export function packTemplatesFromCatalog(catalog: SkillCard[]): PackTemplate[] {
  const templates: PackTemplate[] = [];
  for (const skill of catalog) {
    const id = skillTemplateId(skill.path);
    if (!id) continue;
    const kind = deliverableKind(skill);
    const shape = outputShape(kind);
    const description = skill.description.replace(/\s+/g, " ").trim().slice(0, 140);
    templates.push({
      id,
      name: skill.name,
      description: shape ? `${skill.name}. ${shape}` : `${skill.name}. ${description}`,
      nodes: [
        {
          id: `${id}-1`,
          type: agentType(skill),
          name: skill.name,
          instructions: packSkillInstructions(skill),
          position: { x: 50, y: 120 },
        },
      ],
      edges: [],
    });
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export const MARKETING_PACK_ID = "pack-community-marketingskills";
export const OPENING_PACK_ID = "pack-schema-readiness";
