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

const FALLBACK_DESCRIPTION_MAX = 300;

/**
 * Name and description for a SKILL.md with no YAML front matter (some community packs start with "# Title" or
 * "## Purpose"). Name: the folder name, like the slug names in front matter. Description: a "description:" line, else the
 * first plain paragraph (headings, lists, and code skipped), up to 300 characters.
 */
export function fallbackSkillCard(relativePath: string, raw: string): { name: string; description: string } {
  const parts = relativePath.split("/").filter(Boolean);
  const folder = parts.length >= 2 ? parts[parts.length - 2] : "skill";
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  const name = folder.slice(0, 120);
  const described = lines.find((line) => /^description:\s*\S/i.test(line.trim()))?.trim().replace(/^description:\s*/i, "");
  let description = described?.replace(/^["']|["']$/g, "").trim() ?? "";
  if (!description) {
    const paragraph: string[] = [];
    let fenced = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        fenced = !fenced;
        if (paragraph.length) break;
        continue;
      }
      if (fenced) continue;
      if (!trimmed) {
        if (paragraph.length) break;
        continue;
      }
      if (/^(#|[-*+]\s|\d+\.\s|>|\||---)/.test(trimmed)) {
        if (paragraph.length) break;
        continue;
      }
      paragraph.push(trimmed);
    }
    description = paragraph.join(" ");
  }
  if (description.length > FALLBACK_DESCRIPTION_MAX) description = `${description.slice(0, FALLBACK_DESCRIPTION_MAX - 1).trimEnd()}…`;
  return { name, description };
}

/**
 * One row per skill file. The org pack is left out. A file with no front matter is still indexed, with a name and
 * description read from its heading and first paragraph (fallbackSkillCard), so every SKILL.md is browsable.
 */
export function skillIndexFromFiles(files: { path: string; raw: string }[]): PublishedSkill[] {
  const rows: PublishedSkill[] = [];
  for (const file of files) {
    const relative = file.path.replaceAll("\\", "/").replace(/^\.\//, "");
    if (!relative.endsWith("/SKILL.md") || relative.startsWith("org/") || relative.split("/").includes("..")) continue;
    const front = parseSkillFrontMatter(file.raw) ?? fallbackSkillCard(relative, file.raw);
    rows.push({ ...front, path: relative, pack: relative.split("/")[0] || "root" });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

export type LibraryManifest = {
  published_at: string;
  git_sha: string | null;
  file_count: number;
  skill_count: number;
  pack_count: number;
  fallback_count: number;
};

/** skills/manifest.json: when and from which commit the library was published, and its counts. */
export function libraryManifest(input: {
  files: { path: string; raw: string }[];
  index: PublishedSkill[];
  packCount: number;
  gitSha: string | null;
  now: Date;
}): LibraryManifest {
  return {
    published_at: input.now.toISOString(),
    git_sha: input.gitSha,
    file_count: input.files.length,
    skill_count: input.index.length,
    pack_count: input.packCount,
    fallback_count: input.files.filter((file) => !parseSkillFrontMatter(file.raw)).length,
  };
}

/** The manifest from its JSON. Anything malformed reads as null (an older publish had none). */
export function parseLibraryManifest(raw: string | null | undefined): LibraryManifest | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LibraryManifest>;
    if (typeof value.published_at !== "string" || typeof value.skill_count !== "number") return null;
    return {
      published_at: value.published_at,
      git_sha: typeof value.git_sha === "string" ? value.git_sha : null,
      file_count: typeof value.file_count === "number" ? value.file_count : value.skill_count,
      skill_count: value.skill_count,
      pack_count: typeof value.pack_count === "number" ? value.pack_count : 0,
      fallback_count: typeof value.fallback_count === "number" ? value.fallback_count : 0,
    };
  } catch {
    return null;
  }
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

/** The skill text stored under the same key the agent worker reads. A bad path returns null. */
export async function readSkillFromBucket(
  bucket: SkillBucket | undefined,
  skillPath: string,
): Promise<string | null> {
  if (!bucket) return null;
  const key = skillObjectKey(skillPath);
  if (!key) return null;
  try {
    const object = await bucket.get(key);
    return object ? await object.text() : null;
  } catch {
    return null;
  }
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
