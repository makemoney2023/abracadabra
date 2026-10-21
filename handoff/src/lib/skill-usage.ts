import type { Sql } from "@/db/sql";
import type { AgentPrincipal } from "@/lib/agent-work-filing";
import { skillObjectKey } from "@/lib/skill-library";

/**
 * Skill library usage (table skill_events, migration 0034). Every list, search, read, attach, detach, and cite by an
 * agent or staff chat writes one row after the response. Logging is best effort: a failed write is swallowed and never
 * fails the request. Stats join Client Services and staff review outcomes on the same cards.
 */

export type SkillEventKind = "list" | "search" | "read" | "attach" | "detach" | "cite";

export type SkillEvent = {
  event: SkillEventKind;
  actorKind: "agent" | "staff" | "system";
  actorId: string | null;
  organizationId?: string | null;
  taskId?: string | null;
  workItemId?: string | null;
  path?: string | null;
  prefix?: string | null;
  query?: string | null;
  resultCount?: number | null;
  status?: number | null;
  libraryVersion?: string | null;
  source: string;
  at: number;
};

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
const DAY = 86_400_000;
export const USAGE_WINDOWS = [7, 30, 90] as const;
export type UsageWindow = (typeof USAGE_WINDOWS)[number];

/**
 * Runs work after the response when the Worker gives us waitUntil; otherwise (tests, local node) awaits it here.
 * Either way a rejection is swallowed.
 */
export async function afterResponse(work: () => Promise<unknown>): Promise<void> {
  const holder = globalThis as typeof globalThis & { [CLOUDFLARE_CONTEXT]?: { ctx?: { waitUntil?: (promise: Promise<unknown>) => void } } };
  const waitUntil = holder[CLOUDFLARE_CONTEXT]?.ctx?.waitUntil;
  let promise: Promise<unknown>;
  try {
    promise = Promise.resolve(work()).catch(() => undefined);
  } catch {
    return;
  }
  if (typeof waitUntil === "function") {
    try {
      waitUntil.call(holder[CLOUDFLARE_CONTEXT]?.ctx, promise);
      return;
    } catch {
      // fall through and await it here
    }
  }
  await promise;
}

/** The skill path relative to the library ("community/x/y/SKILL.md"), or null when it is not one. */
export function skillPathOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = skillObjectKey(raw);
  return key ? key.slice("skills/".length) : null;
}

/** The pack a skill path belongs to: first two parts, or the folder of a top-level SKILL.md. Same as packOf. */
function packOfPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 3) return `${parts.slice(0, 2).join("/")}/`;
  return `${parts[0] ?? ""}/`;
}

/** The pack an attached prefix belongs to ("community/x/sub/" → "community/x/"; a SKILL.md path → its pack). */
export function packOfPrefix(prefix: string): string {
  if (prefix.endsWith("/SKILL.md")) return packOfPath(prefix);
  const parts = prefix.split("/").filter(Boolean);
  return parts.length >= 2 ? `${parts.slice(0, 2).join("/")}/` : `${parts[0] ?? ""}/`;
}

/** The client a request is about: the card's client, else the agent's only client, else none. */
export async function eventOrganization(sql: Sql, agent: AgentPrincipal | null, taskId: string | null | undefined): Promise<string | null> {
  if (taskId) {
    const row = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM tasks WHERE id = ?", [taskId]);
    if (row?.organization_id) return row.organization_id;
  }
  const orgs = [...new Set(agent?.assignments.map((row) => row.organizationId) ?? [])];
  return orgs.length === 1 ? orgs[0] : null;
}

/** Inserts the rows now. Errors are swallowed. Prefer logSkillEvents, which defers this past the response. */
export async function writeSkillEvents(sql: Sql, events: SkillEvent[]): Promise<void> {
  if (!events.length) return;
  try {
    await sql.batch(
      events.slice(0, 100).map((event) => {
        const path = event.path ? skillPathOf(event.path) : null;
        const prefix = event.prefix ?? (path ? packOfPath(path) : null);
        return {
          statement: `INSERT INTO skill_events (id, at, actor_kind, actor_id, organization_id, task_id, work_item_id, event, path, prefix,
             query, result_count, status, library_version, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            crypto.randomUUID(),
            event.at,
            event.actorKind,
            event.actorId,
            event.organizationId ?? null,
            event.taskId ?? null,
            event.workItemId ?? null,
            event.event,
            path,
            prefix,
            event.query ? event.query.slice(0, 200) : null,
            event.resultCount ?? null,
            event.status ?? null,
            event.libraryVersion ?? null,
            event.source,
          ],
        };
      }),
    );
  } catch {
    // Usage logging never fails a request.
  }
}

/**
 * Logs agent skill events after the response. The client is resolved inside the deferred work, so the request pays
 * nothing for it. build may return one event or several.
 */
export function logAgentSkillEvents(
  sql: Sql,
  agent: AgentPrincipal,
  input: { taskId?: string | null; source: string; now: number },
  events: Omit<SkillEvent, "actorKind" | "actorId" | "organizationId" | "taskId" | "source" | "at">[],
): Promise<void> {
  return afterResponse(async () => {
    const organizationId = await eventOrganization(sql, agent, input.taskId ?? null).catch(() => null);
    await writeSkillEvents(
      sql,
      events.map((event) => ({
        ...event,
        actorKind: "agent",
        actorId: agent.agentId,
        organizationId,
        taskId: input.taskId ?? null,
        source: input.source,
        at: input.now,
      })),
    );
  });
}

// ---------- Stats ----------

export type UsageRow = {
  key: string;
  name: string;
  reads: number;
  cites: number;
  attaches: number;
  cards: number;
  reviewed: number;
  approved: number;
  sentBack: number;
  /** approved / reviewed cards, 0..1, or null with no review yet. */
  approvalRate: number | null;
  agents: number;
  lastUsedAt: number | null;
};

export type UsageStats = {
  days: UsageWindow;
  since: number;
  totals: { lists: number; searches: number; reads: number; cites: number; attaches: number; detaches: number; failedReads: number };
  packs: UsageRow[];
  skills: UsageRow[];
  /** Library packs with no read, cite, or attach since tracking started. */
  neverUsedPacks: { prefix: string; count: number }[];
  trackingSince: number | null;
};

type EventRow = { event: string; path: string | null; prefix: string | null; task_id: string | null; actor_id: string | null; at: number; status: number | null };

export function usageWindow(raw: unknown): UsageWindow {
  const value = Number(raw);
  return (USAGE_WINDOWS as readonly number[]).includes(value) ? (value as UsageWindow) : 30;
}

type Acc = { name: string; reads: number; cites: number; attaches: number; cards: Set<string>; agents: Set<string>; last: number | null };

function bump(map: Map<string, Acc>, key: string, name: string, row: EventRow): Acc {
  const acc = map.get(key) ?? { name, reads: 0, cites: 0, attaches: 0, cards: new Set<string>(), agents: new Set<string>(), last: null };
  map.set(key, acc);
  if (row.task_id) acc.cards.add(row.task_id);
  if (row.actor_id) acc.agents.add(row.actor_id);
  acc.last = Math.max(acc.last ?? 0, row.at);
  if (row.event === "read") acc.reads += 1;
  else if (row.event === "cite") acc.cites += 1;
  else if (row.event === "attach") acc.attaches += 1;
  return acc;
}

/** Latest review decision per card, and whether it was ever sent back. Reads both review activity kinds. */
async function reviewOutcomes(sql: Sql, taskIds: string[]): Promise<Map<string, { latest: string; sentBack: boolean }>> {
  const out = new Map<string, { latest: string; sentBack: boolean; at: number }>();
  for (let start = 0; start < taskIds.length; start += 90) {
    const chunk = taskIds.slice(start, start + 90);
    const marks = chunk.map(() => "?").join(", ");
    const rows = await sql.all<{ task_id: string; decision: string | null; created_at: number }>(
      `SELECT json_extract(data_json, '$.taskId') AS task_id, json_extract(data_json, '$.decision') AS decision, created_at
       FROM activities WHERE kind IN ('client_services.task_review', 'staff.task_review')
         AND json_extract(data_json, '$.taskId') IN (${marks})`,
      chunk,
    );
    for (const row of rows) {
      if (!row.task_id || !row.decision) continue;
      const entry = out.get(row.task_id) ?? { latest: row.decision, sentBack: false, at: -1 };
      if (row.decision !== "approve") entry.sentBack = true;
      if (row.created_at >= entry.at) {
        entry.latest = row.decision;
        entry.at = row.created_at;
      }
      out.set(row.task_id, entry);
    }
  }
  return new Map([...out.entries()].map(([id, value]) => [id, { latest: value.latest, sentBack: value.sentBack }]));
}

function finish(map: Map<string, Acc>, reviews: Map<string, { latest: string; sentBack: boolean }>): UsageRow[] {
  return [...map.entries()]
    .map(([key, acc]) => {
      let reviewed = 0;
      let approved = 0;
      let sentBack = 0;
      for (const card of acc.cards) {
        const outcome = reviews.get(card);
        if (!outcome) continue;
        reviewed += 1;
        if (outcome.latest === "approve") approved += 1;
        if (outcome.sentBack) sentBack += 1;
      }
      return {
        key,
        name: acc.name,
        reads: acc.reads,
        cites: acc.cites,
        attaches: acc.attaches,
        cards: acc.cards.size,
        reviewed,
        approved,
        sentBack,
        approvalRate: reviewed ? approved / reviewed : null,
        agents: acc.agents.size,
        lastUsedAt: acc.last,
      };
    })
    .sort((a, b) => b.reads + b.cites + b.attaches - (a.reads + a.cites + a.attaches) || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.key.localeCompare(b.key));
}

/**
 * Usage per pack and per skill over the last `days`, with review outcomes of the cards that used them, plus library
 * packs nobody has used since tracking started. libraryPacks is the published pack list (prefix and skill count).
 */
export async function skillUsageStats(
  sql: Sql,
  input: { now: number; days: UsageWindow; libraryPacks: { prefix: string; count: number }[]; skillNames?: Map<string, string> },
): Promise<UsageStats> {
  const since = input.now - input.days * DAY;
  const counts = await sql.all<{ event: string; n: number; failed: number }>(
    `SELECT event, COUNT(*) AS n, SUM(CASE WHEN status IS NOT NULL AND status >= 400 THEN 1 ELSE 0 END) AS failed
     FROM skill_events WHERE at >= ? GROUP BY event`,
    [since],
  );
  const totals = { lists: 0, searches: 0, reads: 0, cites: 0, attaches: 0, detaches: 0, failedReads: 0 };
  for (const row of counts) {
    const n = Number(row.n);
    if (row.event === "list") totals.lists = n;
    else if (row.event === "search") totals.searches = n;
    else if (row.event === "read") {
      totals.reads = n - Number(row.failed ?? 0);
      totals.failedReads = Number(row.failed ?? 0);
    } else if (row.event === "cite") totals.cites = n;
    else if (row.event === "attach") totals.attaches = n;
    else if (row.event === "detach") totals.detaches = n;
  }
  const rows = await sql.all<EventRow>(
    `SELECT event, path, prefix, task_id, actor_id, at, status FROM skill_events
     WHERE at >= ? AND event IN ('read', 'cite', 'attach') AND (status IS NULL OR status < 400)
     ORDER BY at DESC LIMIT 20000`,
    [since],
  );
  const packs = new Map<string, Acc>();
  const skills = new Map<string, Acc>();
  for (const row of rows) {
    const path = row.path && row.path.endsWith("SKILL.md") ? row.path : null;
    const pack = path ? packOfPath(path) : row.prefix ? packOfPrefix(row.prefix) : null;
    if (pack) bump(packs, pack, pack.split("/").filter(Boolean).slice(-1)[0] ?? pack, row);
    if (path) {
      const parts = path.split("/");
      bump(skills, path, input.skillNames?.get(path) ?? parts[parts.length - 2] ?? path, row);
    }
  }
  const cards = [...new Set(rows.map((row) => row.task_id).filter((id): id is string => Boolean(id)))];
  const reviews = await reviewOutcomes(sql, cards);

  const used = await sql.all<{ prefix: string | null; path: string | null }>(
    `SELECT DISTINCT prefix, path FROM skill_events WHERE event IN ('read', 'cite', 'attach') AND (status IS NULL OR status < 400)`,
  );
  const usedPacks = new Set<string>();
  for (const row of used) {
    if (row.path) usedPacks.add(packOfPath(row.path));
    if (row.prefix) usedPacks.add(packOfPrefix(row.prefix));
  }
  const first = await sql.get<{ at: number | null }>("SELECT MIN(at) AS at FROM skill_events");
  return {
    days: input.days,
    since,
    totals,
    packs: finish(packs, reviews),
    skills: finish(skills, reviews),
    neverUsedPacks: input.libraryPacks.filter((pack) => !usedPacks.has(pack.prefix)).map((pack) => ({ prefix: pack.prefix, count: pack.count })),
    trackingSince: first?.at ?? null,
  };
}

// ---------- Filings ----------

/**
 * Stores a filing's skills_used on its work item and logs one cite per skill. Paths not in the published index are
 * dropped and returned as unknown; with no index reachable every well-formed path is kept. Never throws.
 */
export async function recordSkillsUsed(
  sql: Sql,
  input: { agent: AgentPrincipal; workItemId: string; paths: string[]; known: Set<string> | null; now: number },
): Promise<{ used: string[]; unknown: string[] }> {
  const used = input.known ? input.paths.filter((path) => input.known!.has(path)) : [...input.paths];
  const unknown = input.known ? input.paths.filter((path) => !input.known!.has(path)) : [];
  if (!used.length) return { used, unknown };
  try {
    await sql.run("UPDATE agent_work_items SET skills_used_json = ? WHERE id = ? AND agent_id = ?", [JSON.stringify(used), input.workItemId, input.agent.agentId]);
  } catch {
    return { used, unknown };
  }
  await afterResponse(async () => {
    const row = await sql.get<{ task_id: string | null; organization_id: string | null }>(
      "SELECT task_id, organization_id FROM agent_work_items WHERE id = ?",
      [input.workItemId],
    );
    await writeSkillEvents(
      sql,
      used.map((path) => ({
        event: "cite" as const,
        actorKind: "agent" as const,
        actorId: input.agent.agentId,
        organizationId: row?.organization_id ?? null,
        taskId: row?.task_id ?? null,
        workItemId: input.workItemId,
        path,
        source: "filing",
        at: input.now,
      })),
    );
  });
  return { used, unknown };
}
