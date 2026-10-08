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

const MAX_NODES = 4;

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

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function agentType(skill: SkillCard): PackAgentType {
  const text = `${skill.name} ${skill.description}`.toLowerCase();
  if (/research|seo|audit|competitor|teardown|discover/.test(text)) return "researcher";
  if (/critic|review|objection|risk|qa|check/.test(text)) return "critic";
  if (/edit|proof|rewrite/.test(text)) return "editor";
  if (/publish|brief|checklist|report/.test(text)) return "publisher";
  if (/summar/.test(text)) return "summarizer";
  return "writer";
}

function titleFrom(pack: string): string {
  const last = pack.split("/").at(-1) ?? pack;
  return last
    .replace(/^\d+-/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** One chainable template per related pack. A pack needs two skills. Each template keeps four. */
export function packTemplatesFromCatalog(catalog: SkillCard[]): PackTemplate[] {
  const groups = new Map<string, SkillCard[]>();
  for (const skill of catalog) {
    const pack = packKey(skill.path);
    if (!pack || pack.split("/").length < 2 || skipped(pack) || skipped(skill.path)) continue;
    const list = groups.get(pack) ?? [];
    list.push(skill);
    groups.set(pack, list);
  }
  const templates: PackTemplate[] = [];
  for (const [pack, skills] of groups) {
    const chosen = [...skills].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_NODES);
    if (chosen.length < 2) continue;
    const id = `pack-${slug(pack)}`;
    const nodes = chosen.map((skill, index) => ({
      id: `${slug(id)}-${index + 1}`,
      type: agentType(skill),
      name: skill.name,
      instructions: `Follow .cursor/skills/${skill.path}. ${skill.description.replace(/\s+/g, " ").slice(0, 280)}`.trim(),
      position: { x: 50 + index * 310, y: 120 },
    }));
    const edges = nodes.slice(1).map((node, index) => ({
      id: `${slug(id)}-e${index + 1}`,
      source: nodes[index]!.id,
      target: node.id,
    }));
    templates.push({
      id,
      name: titleFrom(pack),
      description: `Chain this pack. Skills: ${chosen.map((skill) => skill.name).join(", ")}.`,
      nodes,
      edges,
    });
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export const MARKETING_PACK_ID = "pack-community-marketingskills";
export const OPENING_PACK_ID = "pack-schema-readiness";
