import { parseSkillCatalog, parseSkillFrontMatter, type SkillCard } from "./client-documents";

export const SKILL_BODY_LIMIT = 12_000;

const STOP = new Set([
  "a",
  "an",
  "and",
  "create",
  "do",
  "for",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "skill",
  "skills",
  "the",
  "to",
  "use",
  "what",
  "which",
  "with",
  "would",
  "you",
]);

export type PublishedSkill = SkillCard & { pack: string };

export type SkillBucket = {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
};

export type SkillHit = SkillCard & { cited: string };

/** One row per skill file. The org pack and files without a name are left out. */
export function skillIndexFromFiles(files: { path: string; raw: string }[]): PublishedSkill[] {
  const rows: PublishedSkill[] = [];
  for (const file of files) {
    const relative = file.path.replaceAll("\\", "/").replace(/^\.\//, "");
    if (!relative.endsWith("/SKILL.md") || relative.startsWith("org/") || relative.split("/").includes("..")) continue;
    const front = parseSkillFrontMatter(file.raw);
    if (!front) continue;
    rows.push({ ...front, path: relative, pack: relative.split("/")[0] || "root" });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/** Best catalog matches for a staff question. Each hit cites the path Cursor should read. */
export function searchSkills(catalog: SkillCard[], query: string, limit = 8): SkillHit[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOP.has(token));
  if (tokens.length === 0) return [];
  return catalog
    .map((skill) => ({ skill, score: score(skill, tokens) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
    .slice(0, limit)
    .map((row) => ({ ...row.skill, cited: cite(row.skill.path) }));
}

/** R2 key for one skill file. A path that leaves the library returns null. */
export function skillObjectKey(input: string): string | null {
  const relative = input
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\.cursor\/skills\//, "")
    .replace(/^skills\//, "");
  if (!relative.endsWith("/SKILL.md") && relative !== "SKILL.md") return null;
  const parts = relative.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  return `skills/${relative}`;
}

export function clipSkillBody(raw: string, max = SKILL_BODY_LIMIT): string {
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}\n\n[truncated]`;
}

export async function searchPublishedSkills(
  bucket: SkillBucket | undefined,
  query: string,
): Promise<{ ok: true; skills: SkillHit[] } | { ok: false; error: string }> {
  if (!bucket) return { ok: false, error: "The skill library is not connected." };
  const object = await bucket.get("skills/index.json");
  if (!object) return { ok: false, error: "The skill library has not been published." };
  if (!query.trim()) return { ok: false, error: "Say what kind of work you need a skill for." };
  return { ok: true, skills: searchSkills(parseSkillCatalog(await object.text()), query) };
}

export async function readPublishedSkill(
  bucket: SkillBucket | undefined,
  skillPath: string,
): Promise<{ ok: true; path: string; cited: string; body: string } | { ok: false; error: string }> {
  if (!bucket) return { ok: false, error: "The skill library is not connected." };
  const key = skillObjectKey(skillPath);
  if (!key) return { ok: false, error: "That skill path is not allowed." };
  const object = await bucket.get(key);
  if (!object) return { ok: false, error: "That skill is not in the library." };
  const relative = key.slice("skills/".length);
  return { ok: true, path: relative, cited: cite(relative), body: clipSkillBody(await object.text()) };
}

function cite(skillPath: string): string {
  if (!skillPath) return "";
  return skillPath.startsWith(".cursor/skills/") ? skillPath : `.cursor/skills/${skillPath}`;
}

function score(skill: SkillCard, tokens: string[]): number {
  const name = skill.name.toLowerCase();
  const description = skill.description.toLowerCase();
  const skillPath = skill.path.toLowerCase();
  let total = 0;
  for (const token of tokens) {
    if (name.includes(token)) total += 8;
    else if (description.includes(token)) total += 3;
    else if (skillPath.includes(token)) total += 2;
  }
  return total;
}
