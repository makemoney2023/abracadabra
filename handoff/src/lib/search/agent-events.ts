import type { Sql } from "@/db/sql";
import { loadAgentSearch, SEARCH_DATA_UPDATED } from "./agent-search";
import { topOpportunities, type Opportunity } from "./opportunities";

/**
 * "Immediately" (PR 4): when a sync run for a property finishes cleanly, one search.data_updated activity is written
 * for the client, addressed to the agents that act on search data (the client's lead plus the named agents in
 * SEARCH_UPDATE_AGENT_IDS, each only while assigned to that client).
 * Agents see it on their next GET /api/agent-work?dispatches=1 (kind search_update) and in GET /api/agent-search
 * (latest_update). It is staff/agent-only: the kind is not in any client-facing feed.
 * Exactly once per run: the insert is one statement guarded by NOT EXISTS on the run key, so two consumers finishing
 * the last two jobs at the same time still write one row.
 */

export const EVENT_OPPORTUNITIES = 5;
/**
 * Agents that get search updates besides the client's lead, by exact id (no name matching). Each one still has to be
 * assigned to the client: an unassigned agent never gets another client's update. Add an id here to widen the list.
 */
export const SEARCH_UPDATE_AGENT_IDS: readonly string[] = [
  "seo-analytics", // SEO & Analytics: its HQ agent id (client_agents.id, migration 0049, GET /api/agent-agents)
  "d2ab5c97-81b5-4262-a0cd-59aefe9e020c", // SEO & Analytics bot id named in QA review of PR #235; matches only if HQ uses it
];

export async function searchUpdateRecipients(sql: Sql, organizationId: string): Promise<string[]> {
  const rows = await sql.all<{ agent_id: string; role: string }>(
    `SELECT a.agent_id, a.role FROM agent_assignments a JOIN client_agents c ON c.id = a.agent_id
     WHERE a.organization_id = ? AND a.ended_at IS NULL AND c.revoked_at IS NULL
     ORDER BY a.assigned_at`,
    [organizationId],
  );
  const ids = rows.filter((row) => row.role === "lead" || SEARCH_UPDATE_AGENT_IDS.includes(row.agent_id)).map((row) => row.agent_id);
  return [...new Set(ids)];
}

function summary(siteUrl: string, dataThrough: string | null, top: Opportunity[]): string {
  const head = `Search data updated for ${siteUrl}${dataThrough ? ` (through ${dataThrough})` : ""}.`;
  if (top.length === 0) return `${head} No opportunities over the thresholds in the last 28 days.`;
  return `${head} ${top.length} top opportunit${top.length === 1 ? "y" : "ies"}: ${top.map((row) => `${row.type} ${row.query ?? row.page ?? ""}`.trim()).join("; ")}.`;
}

/**
 * Writes the search.data_updated activity for one finished run (runKey identifies the run, e.g. daily:<property>:<plan
 * time>). Returns whether a row was written. Never throws: a failure here must not fail or retry the sync job.
 */
export async function recordSearchDataUpdated(
  deps: { sql: Sql; searchSql: Sql | null },
  input: { organizationId: string; propertyId: string; siteUrl: string; runKey: string; mode: "daily" | "backfill"; now: number },
): Promise<boolean> {
  try {
    const exists = await deps.sql.get<{ id: string }>(
      "SELECT id FROM activities WHERE organization_id = ? AND kind = ? AND json_extract(data_json, '$.run') = ? LIMIT 1",
      [input.organizationId, SEARCH_DATA_UPDATED, input.runKey],
    );
    if (exists) return false;
    const loaded = await loadAgentSearch(deps.sql, deps.searchSql, {
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      range: "28d",
      now: input.now,
    });
    const property = loaded.ok ? loaded.result.properties[0] : undefined;
    const top = topOpportunities(property?.opportunities ?? [], EVENT_OPPORTUNITIES);
    const dataThrough = property?.data_through ?? null;
    const recipients = await searchUpdateRecipients(deps.sql, input.organizationId);
    const data = {
      run: input.runKey,
      mode: input.mode,
      property_id: input.propertyId,
      site_url: input.siteUrl,
      data_through: dataThrough,
      totals: property?.totals ?? null,
      change: property?.change ?? null,
      opportunities: top,
      recipients,
    };
    const id = crypto.randomUUID();
    await deps.sql.run(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
       SELECT ?, ?, ?, 'system', NULL, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM activities WHERE organization_id = ? AND kind = ? AND json_extract(data_json, '$.run') = ?
       )`,
      [
        id, input.organizationId, SEARCH_DATA_UPDATED,
        summary(input.siteUrl, dataThrough, top).slice(0, 2000), JSON.stringify(data), input.now,
        input.organizationId, SEARCH_DATA_UPDATED, input.runKey,
      ],
    );
    const written = await deps.sql.get<{ id: string }>("SELECT id FROM activities WHERE id = ?", [id]);
    return Boolean(written);
  } catch (error) {
    console.error("Search data update event failed:", error instanceof Error ? error.message : "unknown");
    return false;
  }
}
