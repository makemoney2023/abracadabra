import type { Sql } from "@/db/sql";
import type { AgentPrincipal } from "@/lib/agent-work-filing";
import { agentSearchOrg } from "./agent-search-cards";
import { pickProperty } from "./explore";

/**
 * Agents ask HQ to re-check specific URLs with URL Inspection (PR 4). No new table and no live Google call: each ask is
 * a search.inspect_requested activity, and the daily inspection pass (runInspect in sync.ts) checks asked URLs first,
 * inside the same per-property inspect_budget. At most INSPECT_REQUESTS_PER_DAY asks per property per UTC day.
 */

export const INSPECT_REQUESTS_PER_DAY = 20;
export const INSPECT_REQUEST_KIND = "search.inspect_requested";

/** True when the URL is inside the Search Console property (domain property: the host or a subdomain; URL-prefix: the prefix). */
export function urlInProperty(siteUrl: string, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const host = parsed.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  return url.startsWith(siteUrl);
}

export type InspectAskResult =
  | {
      ok: true;
      property_id: string;
      queued: string[];
      rejected: { url: string; reason: "not_in_property" | "invalid" | "duplicate" | "daily_limit" }[];
      requests_left_today: number;
      daily_budget: number;
      when: string;
    }
  | { ok: false; status: 400 | 403 | 404 | 503; message: string };

export async function requestInspection(
  sql: Sql,
  searchSql: Sql | null,
  agent: AgentPrincipal,
  input: { client?: unknown; propertyId?: string | null; urls: unknown; now: number },
): Promise<InspectAskResult> {
  if (!Array.isArray(input.urls) || input.urls.length === 0) return { ok: false, status: 400, message: "urls must be a list of URLs." };
  if (input.urls.length > INSPECT_REQUESTS_PER_DAY) return { ok: false, status: 400, message: `At most ${INSPECT_REQUESTS_PER_DAY} urls per request.` };
  const org = await agentSearchOrg(sql, agent, input.client);
  if (!org.ok) return org;
  const picked = await pickProperty(sql, org.organizationId, input.propertyId ?? null);
  if (!picked.ok) return picked;
  const property = picked.property;
  if (property.status !== "active") return { ok: false, status: 400, message: `This property is ${property.status}; inspection runs only for active properties.` };
  if (!searchSql) return { ok: false, status: 503, message: "Search data is not available here (SEARCH_DB is not bound)." };
  const dayStart = Date.parse(`${new Date(input.now).toISOString().slice(0, 10)}T00:00:00Z`);
  const today = await sql.all<{ url: string | null }>(
    `SELECT json_extract(data_json, '$.url') AS url FROM activities
     WHERE organization_id = ? AND kind = ? AND json_extract(data_json, '$.property_id') = ? AND created_at >= ?`,
    [org.organizationId, INSPECT_REQUEST_KIND, property.id, dayStart],
  );
  const seen = new Set(today.map((row) => row.url));
  let left = INSPECT_REQUESTS_PER_DAY - today.length;
  const queued: string[] = [];
  const rejected: Extract<InspectAskResult, { ok: true }>["rejected"] = [];
  for (const value of input.urls) {
    const url = typeof value === "string" ? value.trim() : "";
    if (!url || url.length > 2048) {
      rejected.push({ url: String(value).slice(0, 200), reason: "invalid" });
      continue;
    }
    if (!urlInProperty(property.site_url, url)) {
      rejected.push({ url, reason: "not_in_property" });
      continue;
    }
    if (seen.has(url)) {
      rejected.push({ url, reason: "duplicate" });
      continue;
    }
    if (left <= 0) {
      rejected.push({ url, reason: "daily_limit" });
      continue;
    }
    seen.add(url);
    left -= 1;
    queued.push(url);
  }
  for (const url of queued) {
    // A URL HQ has not seen (not in the sitemap or search data yet) gets a search_pages row so the picker can find it.
    await searchSql.run("INSERT INTO search_pages (property_id, url) VALUES (?, ?) ON CONFLICT (property_id, url) DO NOTHING", [property.id, url]);
    await sql.run(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
       VALUES (?, ?, ?, 'agent', ?, ?, ?, ?)`,
      [
        crypto.randomUUID(), org.organizationId, INSPECT_REQUEST_KIND, agent.agentId,
        `${agent.label} asked for a URL Inspection re-check of ${url}`.slice(0, 500),
        JSON.stringify({ property_id: property.id, url, agent_id: agent.agentId }), input.now,
      ],
    );
  }
  return {
    ok: true,
    property_id: property.id,
    queued,
    rejected,
    requests_left_today: Math.max(0, left),
    daily_budget: property.inspect_budget,
    when: "Checked first in the next daily inspection pass (about 08:45 UTC), inside the property's daily URL Inspection budget. Read results with GET /api/agent-search/indexing?url=<url>.",
  };
}
