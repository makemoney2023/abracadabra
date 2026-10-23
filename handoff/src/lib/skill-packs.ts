import type { Sql } from "@/db/sql";
import { parseSkillCatalog, type SkillCard } from "@/lib/client-documents";
import { cleanSkillPrefix } from "@/lib/agent-skills";
import { skillObjectKey, type SkillBucket } from "@/lib/skill-library";

/**
 * The full skill library (handoff-skills, skills/index.json) for any registered agent, and the packs an agent attaches to
 * one task card. A pack is the first two path parts ("community/marketingskills/"), or the folder of a top-level
 * SKILL.md ("context-engineering/"). org/ paths are private to a client and never listed here.
 */

const MAX_SKILL_BYTES = 200_000;

export type LibrarySkill = { name: string; description: string; path: string; pack: string };
export type LibraryPack = { prefix: string; name: string; count: number; description: string };
export type Catalog = { version: string; skills: LibrarySkill[] };
export type LibraryError = { ok: false; status: 503; message: string };

async function sha12(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The pack prefix a skill path belongs to. */
export function packOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 3) return `${parts.slice(0, 2).join("/")}/`;
  return `${parts[0] ?? ""}/`;
}

function publicSkill(card: SkillCard): boolean {
  return Boolean(card.path) && !card.path.startsWith("org/") && card.path.endsWith("SKILL.md");
}

export async function loadCatalog(bucket: SkillBucket | undefined): Promise<({ ok: true } & Catalog) | LibraryError> {
  if (!bucket) return { ok: false, status: 503, message: "The skill library is not connected." };
  let object: { text(): Promise<string> } | null;
  try {
    object = await bucket.get("skills/index.json");
  } catch {
    return { ok: false, status: 503, message: "The skill library did not answer." };
  }
  if (!object) return { ok: false, status: 503, message: "The skill library has not been published." };
  const raw = await object.text();
  const skills = parseSkillCatalog(raw)
    .filter(publicSkill)
    .map((skill) => ({ ...skill, pack: packOf(skill.path) }));
  return { ok: true, version: await sha12(raw), skills };
}

function describePack(prefix: string, skills: LibrarySkill[]): string {
  const root = skills.find((skill) => skill.path === `${prefix}SKILL.md`);
  if (root?.description) return root.description.slice(0, 300);
  const names = skills.map((skill) => skill.name);
  const shown = names.slice(0, 6).join(", ");
  return `${names.length} skill${names.length === 1 ? "" : "s"}: ${shown}${names.length > 6 ? ", …" : ""}`;
}

export function packsFrom(skills: LibrarySkill[]): LibraryPack[] {
  const groups = new Map<string, LibrarySkill[]>();
  for (const skill of skills) {
    const list = groups.get(skill.pack);
    if (list) list.push(skill);
    else groups.set(skill.pack, [skill]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([prefix, list]) => ({
      prefix,
      name: prefix.split("/").filter(Boolean).slice(-1)[0] ?? prefix,
      count: list.length,
      description: describePack(prefix, list),
    }));
}

export async function libraryPacks(bucket: SkillBucket | undefined): Promise<{ ok: true; version: string; packs: LibraryPack[] } | LibraryError> {
  const catalog = await loadCatalog(bucket);
  if (!catalog.ok) return catalog;
  return { ok: true, version: catalog.version, packs: packsFrom(catalog.skills) };
}

function words(q: string | null | undefined): string[] {
  return (q ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 2);
}

/**
 * GET /api/agent-skill-library: every pack with its count and description. With ?q= (words) or ?pack= (a pack prefix),
 * also the matching skills (up to 500).
 */
export async function browseLibrary(
  bucket: SkillBucket | undefined,
  input: { q?: string | null; pack?: string | null },
): Promise<
  | { ok: true; library_version: string; skill_count: number; packs: LibraryPack[]; skills?: LibrarySkill[] }
  | LibraryError
> {
  const catalog = await loadCatalog(bucket);
  if (!catalog.ok) return catalog;
  const packs = packsFrom(catalog.skills);
  const wanted = words(input.q);
  const pack = input.pack ? cleanSkillPrefix(input.pack) : null;
  const base = { ok: true as const, library_version: catalog.version, skill_count: catalog.skills.length, packs };
  if (!wanted.length && !input.pack) return base;
  const skills = catalog.skills
    .filter((skill) => !input.pack || (pack !== null && underPrefix(skill.path, pack)))
    .filter((skill) => wanted.every((word) => `${skill.name} ${skill.description} ${skill.path}`.toLowerCase().includes(word)))
    .slice(0, 500);
  return { ...base, skills };
}

/** GET /api/agent-skill-library/<path>/SKILL.md: any public skill, granted or not. */
export async function readLibrarySkill(
  bucket: SkillBucket | undefined,
  skillPath: string,
): Promise<{ ok: true; path: string; version: string; body: string } | { ok: false; status: 404 | 503; message: string }> {
  if (!bucket) return { ok: false, status: 503, message: "The skill library is not connected." };
  const key = skillObjectKey(skillPath);
  if (!key) return { ok: false, status: 404, message: "That is not a skill path." };
  const relative = key.slice("skills/".length);
  if (relative.startsWith("org/")) return { ok: false, status: 404, message: "That skill is not in the library." };
  const object = await bucket.get(key);
  if (!object) return { ok: false, status: 404, message: "That skill is not in the library." };
  const body = (await object.text()).slice(0, MAX_SKILL_BYTES);
  return { ok: true, path: relative, version: await sha12(body), body };
}

export function underPrefix(path: string, prefix: string): boolean {
  return prefix.endsWith("/SKILL.md") ? path === prefix : path.startsWith(prefix);
}

/** Cleans each prefix and checks that at least one library skill sits under it. Returns the first bad one. */
export function checkPrefixes(skills: LibrarySkill[], raw: unknown[]): { ok: true; prefixes: string[] } | { ok: false; bad: string } {
  const prefixes: string[] = [];
  for (const value of raw.slice(0, 50)) {
    const text = typeof value === "string" ? value : "";
    const prefix = cleanSkillPrefix(text);
    if (!prefix || prefix.startsWith("org/") || !skills.some((skill) => underPrefix(skill.path, prefix))) return { ok: false, bad: text || String(value) };
    if (!prefixes.includes(prefix)) prefixes.push(prefix);
  }
  return { ok: true, prefixes };
}

/** Live attachments on one card, oldest first. */
export async function cardSkillPacks(sql: Sql, taskId: string): Promise<string[]> {
  const rows = await sql.all<{ prefix: string }>(
    "SELECT prefix FROM task_skill_packs WHERE task_id = ? AND detached_at IS NULL ORDER BY attached_at, rowid",
    [taskId],
  );
  return rows.map((row) => row.prefix);
}

/** Adds prefixes to a card. Already attached ones are skipped. Returns the ones that were new. */
export async function attachCardSkills(
  sql: Sql,
  input: { taskId: string; prefixes: string[]; actor: { kind: "staff" | "agent" | "system"; id: string }; now: number },
): Promise<string[]> {
  const live = new Set(await cardSkillPacks(sql, input.taskId));
  const added = input.prefixes.filter((prefix) => !live.has(prefix));
  if (added.length) {
    await sql.batch(
      added.map((prefix) => ({
        statement: `INSERT INTO task_skill_packs (id, task_id, prefix, attached_by_kind, attached_by, attached_at, detached_by, detached_at)
                    VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
        params: [crypto.randomUUID(), input.taskId, prefix, input.actor.kind, input.actor.id, input.now],
      })),
    );
  }
  return added;
}

/** Detaches prefixes from a card. Returns the ones that were attached. */
export async function detachCardSkills(
  sql: Sql,
  input: { taskId: string; prefixes: string[]; actor: { id: string }; now: number },
): Promise<string[]> {
  const live = new Set(await cardSkillPacks(sql, input.taskId));
  const removed = input.prefixes.filter((prefix) => live.has(prefix));
  for (const prefix of removed) {
    await sql.run(
      "UPDATE task_skill_packs SET detached_at = ?, detached_by = ? WHERE task_id = ? AND prefix = ? AND detached_at IS NULL",
      [input.now, input.actor.id, input.taskId, prefix],
    );
  }
  return removed;
}

/**
 * Packs attached to open (not done) cards on these clients. taskId narrows to that one card.
 * Rows come back as { task_id, prefix }, oldest attachment first.
 */
export async function attachedOnOpenCards(
  sql: Sql,
  organizationIds: string[],
  taskId?: string | null,
): Promise<{ task_id: string; prefix: string }[]> {
  if (organizationIds.length === 0) return [];
  const marks = organizationIds.map(() => "?").join(", ");
  return sql.all<{ task_id: string; prefix: string }>(
    `SELECT s.task_id, s.prefix FROM task_skill_packs s JOIN tasks t ON t.id = s.task_id
     WHERE s.detached_at IS NULL AND t.status != 'done' AND t.organization_id IN (${marks}) AND (? IS NULL OR t.id = ?)
     ORDER BY s.attached_at, s.rowid`,
    [...organizationIds, taskId ?? null, taskId ?? null],
  );
}

/** Text for a lead handoff: what is on the card, and how to add more. */
export function skillHint(taskId: string, attached: string[]): { attached: string[]; library: string; guide: string; attach: string } {
  return {
    attached,
    library: `GET /api/agent-skill-library?q=<what the task needs, e.g. caption>&task_id=${taskId}`,
    guide: "GET /api/agent-skill-guide",
    attach: `POST /api/agent-board/tasks/${taskId} {"action":"attach_skills","prefixes":["<pack prefix, e.g. community/marketingskills/>"]}`,
  };
}
