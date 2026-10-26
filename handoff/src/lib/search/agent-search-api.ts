import type { Sql } from "@/db/sql";
import type { AgentPrincipal } from "@/lib/agent-work-filing";
import { loadAgentSearch, type AgentSearchResult } from "./agent-search";
import { exploreIndexing, exploreRows, parseIndexingQuery, parseRowsQuery, type IndexingResult, type RowsResult } from "./explore";
import { parsePeriodQuery } from "./periods";
import { agentSearchOrg } from "./agent-search-cards";

/** ?client= as a string: a domain (has a dot), an organization id (uuid), else a space slug. Same as the other agent APIs. */
export function clientRef(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const client = value.trim();
  if (!client) return null;
  return client.includes(".") ? { domain: client } : /^[0-9a-f-]{36}$/i.test(client) ? { organization_id: client } : { space_slug: client };
}

export const SEARCH_AGENT_READ = "search.agent_read";

/** One search.agent_read activity per agent per client per UTC day (spec section 6), so staff can see who reads what. */
export async function noteRead(sql: Sql, agent: AgentPrincipal, organizationId: string, now: number): Promise<void> {
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `${agent.agentId}:${day}`;
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     SELECT ?, ?, ?, 'agent', ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM activities WHERE organization_id = ? AND kind = ? AND json_extract(data_json, '$.key') = ?)`,
    [
      crypto.randomUUID(), organizationId, SEARCH_AGENT_READ, agent.agentId,
      `${agent.label} read Search Console data.`, JSON.stringify({ key, agent_id: agent.agentId, day }), now,
      organizationId, SEARCH_AGENT_READ, key,
    ],
  );
}

/**
 * GET /api/agent-search, minus HTTP: checks the client is assigned to this agent (403 otherwise), the range (400), and
 * the property (404 when it is not this client's), then reads. Never touches another organization.
 */
export async function agentSearchRead(
  sql: Sql,
  searchSql: Sql | null,
  agent: AgentPrincipal,
  query: { client: string | null; property: string | null; params: URLSearchParams; now: number },
): Promise<{ ok: true; result: AgentSearchResult } | { ok: false; status: 400 | 403 | 404; message: string }> {
  const period = parsePeriodQuery((name) => query.params.get(name));
  if (!period.ok) return { ok: false, status: 400, message: period.message };
  const org = await agentSearchOrg(sql, agent, clientRef(query.client));
  if (!org.ok) return org;
  const loaded = await loadAgentSearch(sql, searchSql, { organizationId: org.organizationId, propertyId: query.property, period: period.value, now: query.now });
  if (!loaded.ok) return loaded;
  await noteRead(sql, agent, org.organizationId, query.now);
  return loaded;
}

/** GET /api/agent-search/rows, minus HTTP. 400 bad params, 403 other client, 404 property not this client's. */
export async function agentSearchRows(
  sql: Sql,
  searchSql: Sql | null,
  agent: AgentPrincipal,
  query: { params: URLSearchParams; now: number },
): Promise<{ ok: true; result: RowsResult } | { ok: false; status: 400 | 403 | 404; message: string }> {
  const get = (name: string) => query.params.get(name);
  const period = parsePeriodQuery(get);
  if (!period.ok) return { ok: false, status: 400, message: period.message };
  const rows = parseRowsQuery(get, period.value);
  if (!rows.ok) return { ok: false, status: 400, message: rows.message };
  const org = await agentSearchOrg(sql, agent, clientRef(get("client") ?? get("org")));
  if (!org.ok) return org;
  const result = await exploreRows(sql, searchSql, { organizationId: org.organizationId, propertyId: get("property"), query: rows.value, now: query.now });
  if (result.ok) await noteRead(sql, agent, org.organizationId, query.now);
  return result;
}

/** GET /api/agent-search/indexing, minus HTTP. Stored URL Inspection results and sitemaps; never calls Google. */
export async function agentSearchIndexing(
  sql: Sql,
  searchSql: Sql | null,
  agent: AgentPrincipal,
  query: { params: URLSearchParams; now: number },
): Promise<{ ok: true; result: IndexingResult } | { ok: false; status: 400 | 403 | 404; message: string }> {
  const get = (name: string) => query.params.get(name);
  const parsed = parseIndexingQuery(get);
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
  const org = await agentSearchOrg(sql, agent, clientRef(get("client") ?? get("org")));
  if (!org.ok) return org;
  const result = await exploreIndexing(sql, searchSql, { organizationId: org.organizationId, propertyId: get("property"), query: parsed.value, now: query.now });
  if (result.ok) await noteRead(sql, agent, org.organizationId, query.now);
  return result;
}
