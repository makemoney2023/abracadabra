import type { Sql } from "@/db/sql";
import { parseSkillCatalog } from "@/lib/client-documents";
import { skillObjectKey, type SkillBucket } from "@/lib/skill-library";
import type { AgentPrincipal } from "@/lib/agent-work-filing";

/**
 * Client agents read skill packs from the handoff-skills bucket through HQ, scoped by their own token.
 * Grants are path prefixes (e.g. "community/marketingskills/") on the agent, or on a client for every agent assigned to it.
 * HQ reads the bucket through its binding. No bucket credential or signed URL leaves HQ.
 */

const MAX_SKILL_BYTES = 200_000;

async function sha12(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A prefix stays inside the library: no leading slash, no dot segments, ends with "/" unless it names one SKILL.md. */
export function cleanSkillPrefix(raw: string): string | null {
  let value = raw.trim().replaceAll("\\", "/").replace(/^\.cursor\/skills\//, "").replace(/^skills\//, "");
  if (!value || value.startsWith("/") || value.split("/").some((part) => part === "." || part === "..")) return null;
  if (!/^[A-Za-z0-9._\-/]+$/.test(value)) return null;
  if (!value.endsWith("/SKILL.md") && !value.endsWith("/")) value = `${value}/`;
  if (value.startsWith("org/")) return null;
  return value;
}

export async function grantSkills(
  sql: Sql,
  input: { agentId?: string | null; organizationId?: string | null; prefixes: string[]; actor: string; now: number },
): Promise<{ ok: true; prefixes: string[] } | { ok: false; message: string }> {
  const agentId = input.agentId?.trim().toLowerCase() || null;
  const organizationId = input.organizationId?.trim() || null;
  if (!agentId && !organizationId) return { ok: false, message: "Name an agent or a client." };
  if (agentId && !(await sql.get("SELECT id FROM client_agents WHERE id = ?", [agentId]))) return { ok: false, message: "Unknown agent." };
  if (organizationId && !(await sql.get("SELECT id FROM organizations WHERE id = ? AND archived_at IS NULL", [organizationId]))) {
    return { ok: false, message: "Unknown client." };
  }
  const prefixes: string[] = [];
  for (const raw of input.prefixes.slice(0, 50)) {
    const prefix = cleanSkillPrefix(raw);
    if (!prefix) return { ok: false, message: `Not a skill path: ${raw}` };
    if (!prefixes.includes(prefix)) prefixes.push(prefix);
  }
  if (prefixes.length === 0) return { ok: false, message: "Name at least one skill pack path." };
  const writes = [];
  for (const prefix of prefixes) {
    const live = await sql.get<{ id: string }>(
      "SELECT id FROM skill_grants WHERE prefix = ? AND agent_id IS ? AND organization_id IS ? AND revoked_at IS NULL",
      [prefix, agentId, organizationId],
    );
    if (live) continue;
    writes.push({
      statement: "INSERT INTO skill_grants (id, agent_id, organization_id, prefix, granted_by, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
      params: [crypto.randomUUID(), agentId, organizationId, prefix, input.actor, input.now],
    });
  }
  if (writes.length) await sql.batch(writes);
  return { ok: true, prefixes };
}

export async function revokeSkills(sql: Sql, input: { agentId?: string | null; organizationId?: string | null; prefixes: string[]; now: number }): Promise<number> {
  let revoked = 0;
  for (const raw of input.prefixes) {
    const prefix = cleanSkillPrefix(raw);
    if (!prefix) continue;
    const rows = await sql.all<{ id: string }>(
      "SELECT id FROM skill_grants WHERE prefix = ? AND agent_id IS ? AND organization_id IS ? AND revoked_at IS NULL",
      [prefix, input.agentId?.trim().toLowerCase() || null, input.organizationId?.trim() || null],
    );
    for (const row of rows) {
      await sql.run("UPDATE skill_grants SET revoked_at = ? WHERE id = ?", [input.now, row.id]);
      revoked += 1;
    }
  }
  return revoked;
}

/** Live prefixes for this agent: its own grants plus grants on clients it is assigned to now. */
export async function skillPrefixesFor(sql: Sql, agent: AgentPrincipal): Promise<string[]> {
  const orgs = agent.assignments.map((row) => row.organizationId);
  const marks = orgs.map(() => "?").join(", ");
  const rows = await sql.all<{ prefix: string }>(
    `SELECT DISTINCT prefix FROM skill_grants WHERE revoked_at IS NULL
       AND (agent_id = ? ${orgs.length ? `OR (agent_id IS NULL AND organization_id IN (${marks}))` : ""})`,
    [agent.agentId, ...orgs],
  );
  return rows.map((row) => row.prefix).sort();
}

function allowed(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => (prefix.endsWith("/SKILL.md") ? path === prefix : path.startsWith(prefix)));
}

export type AgentSkillList =
  | { ok: true; library_version: string; prefixes: string[]; skills: { name: string; description: string; path: string; pack: string }[] }
  | { ok: false; status: 503; message: string };

/** GET /api/agent-skills: the published index, cut down to this agent's grants. Optional q filters by words. */
export async function listAgentSkills(sql: Sql, bucket: SkillBucket | undefined, agent: AgentPrincipal, q?: string | null): Promise<AgentSkillList> {
  if (!bucket) return { ok: false, status: 503, message: "The skill library is not connected." };
  const object = await bucket.get("skills/index.json");
  if (!object) return { ok: false, status: 503, message: "The skill library has not been published." };
  const raw = await object.text();
  const prefixes = await skillPrefixesFor(sql, agent);
  const words = (q ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 2);
  const skills = parseSkillCatalog(raw)
    .filter((skill) => allowed(skill.path, prefixes))
    .filter((skill) => words.every((word) => `${skill.name} ${skill.description} ${skill.path}`.toLowerCase().includes(word)))
    .slice(0, 500)
    .map((skill) => ({ ...skill, pack: skill.path.split("/").slice(0, 2).join("/") }));
  return { ok: true, library_version: await sha12(raw), prefixes, skills };
}

/** GET /api/agent-skills/<path>/SKILL.md: one granted skill body with a content version. */
export async function readAgentSkill(
  sql: Sql,
  bucket: SkillBucket | undefined,
  agent: AgentPrincipal,
  skillPath: string,
): Promise<{ ok: true; path: string; version: string; body: string } | { ok: false; status: 403 | 404 | 503; message: string }> {
  if (!bucket) return { ok: false, status: 503, message: "The skill library is not connected." };
  const key = skillObjectKey(skillPath);
  if (!key) return { ok: false, status: 404, message: "That is not a skill path." };
  const relative = key.slice("skills/".length);
  if (relative.startsWith("org/") || !allowed(relative, await skillPrefixesFor(sql, agent))) {
    return { ok: false, status: 403, message: "This agent has no grant for that skill." };
  }
  const object = await bucket.get(key);
  if (!object) return { ok: false, status: 404, message: "That skill is not in the library." };
  const body = (await object.text()).slice(0, MAX_SKILL_BYTES);
  return { ok: true, path: relative, version: await sha12(body), body };
}
