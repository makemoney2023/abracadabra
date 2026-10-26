import type { Sql } from "@/db/sql";
import { listSearchProperties, type SearchProperty } from "./properties";
import { loadOpportunities, type Opportunity } from "./opportunities";
import { DEFAULT_PERIOD, resolveWindow, type PeriodQuery } from "./periods";
import {
  loadSearchReport,
  SEARCH_RANGES,
  totalsFromSums,
  type Change,
  type SearchRangeId,
  type SearchWindow,
  type SeriesPoint,
  type Totals,
  type TopRow,
} from "./report";

/**
 * What agents read about a client's Search Console data (PR 4): GET /api/agent-search, the HQ chat tool
 * search_console, and the MCP tool search_console (HQ agent token only, scoped to its assigned clients; the ClientAgent
 * deployment key is refused) all return this. Read-only; reuses the PR 3 report
 * layer (loadSearchReport) and adds opportunities. The caller has already checked that it may see this organization.
 */

export const AGENT_TOP_ROWS = 10;
export const SEARCH_DATA_UPDATED = "search.data_updated";
export const SEARCH_CARD_CREATED = "search.card_created";

/** null: not given (use 28d). undefined: given but not a range (400). */
export function parseAgentRange(value: string | null | undefined): SearchRangeId | null | undefined {
  if (value === null || value === undefined || value.trim() === "") return null;
  const range = SEARCH_RANGES.find((item) => item.id === value.trim());
  return range ? range.id : undefined;
}

export type AgentSearchState = "ok" | "empty" | "pending" | "unavailable";

export type AgentSearchProperty = {
  id: string;
  site_url: string;
  /** search_properties.status: pending | active | access_lost | paused. */
  status: SearchProperty["status"];
  /**
   * ok: data in the window. empty: synced but no rows in the window yet. pending: waiting on the client to grant access
   * (nothing is read). unavailable: SEARCH_DB is not bound (no_db), the first sync has not created tables (not_ready),
   * or the read failed (error).
   */
  state: AgentSearchState;
  reason: "no_db" | "not_ready" | "error" | null;
  backfill_state: SearchProperty["backfill_state"];
  /** Newest final day Google has given us (YYYY-MM-DD), or null. */
  data_through: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  url_inspection: { daily_budget: number; used_today: number };
  window: SearchWindow | null;
  /** True when asked dates were cut to what HQ keeps (16 months back from the newest day, 500 days per period). */
  clamped: boolean;
  /** Oldest day HQ keeps daily rows for, from the newest day it holds. */
  retention_floor: string | null;
  /** Days Google may still change (is_final = 0), newest last. Left out of the window unless include_partial=1. */
  partial_days: string[];
  includes_partial: boolean;
  /** Site totals (search_daily_site): every click and impression, including anonymized queries. */
  totals: Totals | null;
  /**
   * Sum of the query rows in the same window. Lower than the site totals because Google hides rare (anonymized)
   * queries; anonymized_click_share is the part of site clicks no query row explains.
   */
  query_totals: (Totals & { anonymized_click_share: number | null; anonymized_impression_share: number | null }) | null;
  previous: Totals | null;
  change: Record<keyof Totals, Change> | null;
  /** Daily clicks and impressions for the window (at most 500 points), zero-filled. */
  series: SeriesPoint[];
  top_queries: TopRow[];
  top_pages: TopRow[];
  opportunities: Opportunity[];
};

export type AgentSearchUpdate = { at: string; property_id: string | null; site_url: string | null; data_through: string | null; summary: string };

export type AgentSearchResult = {
  organization_id: string;
  source: "google_search_console";
  /** The preset asked for, or custom (start/end). */
  range: SearchRangeId | "custom";
  /** Newest data_through and last_sync_at across the properties returned (each property has its own). */
  data_through: string | null;
  last_sync_at: string | null;
  /** Positions are impression-weighted averages; CTR is clicks / impressions. Days are UTC (Google's Pacific day). */
  notes: string;
  properties: AgentSearchProperty[];
  /** The newest search.data_updated event for this client, if any. */
  latest_update: AgentSearchUpdate | null;
  /** How to act on an opportunity. */
  act: string;
};

const ACT =
  "Turn an opportunity into a card with POST /api/agent-search/cards { client, opportunity_id } (at most 5 search cards per client per UTC day, one open card per opportunity). " +
  "Cards land on the HQ board like any agent card; nothing is published to the client.";

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

async function inspectionsToday(sql: Sql, propertyId: string, now: number): Promise<number> {
  const dayStart = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  const row = await sql.get<{ n: number | null }>(
    "SELECT sum(api_calls) AS n FROM search_sync_runs WHERE property_id = ? AND kind = 'inspect' AND created_at >= ?",
    [propertyId, dayStart],
  );
  return Number(row?.n ?? 0);
}

export async function latestSearchUpdate(sql: Sql, organizationId: string): Promise<AgentSearchUpdate | null> {
  const row = await sql.get<{ body: string; data_json: string; created_at: number }>(
    `SELECT body, data_json, created_at FROM activities WHERE organization_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1`,
    [organizationId, SEARCH_DATA_UPDATED],
  );
  if (!row) return null;
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(row.data_json) as Record<string, unknown>;
  } catch {
    data = {};
  }
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    at: new Date(row.created_at).toISOString(),
    property_id: str(data.property_id),
    site_url: str(data.site_url),
    data_through: str(data.data_through),
    summary: row.body,
  };
}

async function partialDaysOf(searchSql: Sql, property: SearchProperty, now: number): Promise<string[]> {
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const rows = await searchSql.all<{ day: string }>(
    `SELECT day FROM search_daily_site WHERE organization_id = ? AND property_id = ? AND search_type = 'web' AND is_final = 0 AND day <= ?
     ORDER BY day DESC LIMIT 7`,
    [property.organization_id, property.id, yesterday],
  );
  return rows.map((row) => row.day).reverse();
}

async function oneProperty(
  sql: Sql,
  searchSql: Sql | null,
  property: SearchProperty,
  period: PeriodQuery,
  now: number,
): Promise<AgentSearchProperty> {
  const base: AgentSearchProperty = {
    id: property.id,
    site_url: property.site_url,
    status: property.status,
    state: "pending",
    reason: null,
    backfill_state: property.backfill_state,
    data_through: property.data_through,
    last_sync_at: iso(property.last_success_at),
    last_error: property.last_error,
    url_inspection: { daily_budget: property.inspect_budget, used_today: await inspectionsToday(sql, property.id, now) },
    window: null,
    clamped: false,
    retention_floor: null,
    partial_days: [],
    includes_partial: period.includePartial,
    totals: null,
    query_totals: null,
    previous: null,
    change: null,
    series: [],
    top_queries: [],
    top_pages: [],
    opportunities: [],
  };
  if (property.status === "pending") return base;
  let clamped = false;
  let floor: string | null = null;
  const report = await loadSearchReport(searchSql, {
    organizationId: property.organization_id,
    propertyId: property.id,
    range: period.range ?? "28d",
    now,
    finalOnly: !period.includePartial,
    window: (anchor) => {
      const resolved = resolveWindow(period, anchor);
      clamped = resolved.clamped;
      floor = resolved.floor;
      return resolved.window;
    },
  });
  if (report.state === "unavailable") return { ...base, state: "unavailable", reason: report.reason };
  const partialDays = await partialDaysOf(searchSql!, property, now);
  if (report.state === "empty") return { ...base, state: "empty", window: report.window, clamped, retention_floor: floor, partial_days: partialDays };
  let opportunities: Opportunity[] = [];
  let queryTotals: AgentSearchProperty["query_totals"] = null;
  let reason: AgentSearchProperty["reason"] = null;
  try {
    const sums = await searchSql!.get<{ clicks: number | null; impressions: number | null; pos_sum: number | null }>(
      `SELECT SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(pos_sum) AS pos_sum FROM search_daily_query
       WHERE organization_id = ? AND property_id = ? AND day BETWEEN ? AND ?`,
      [property.organization_id, property.id, report.window.current.start, report.window.current.end],
    );
    const fromQueries = totalsFromSums(sums);
    const share = (part: number, whole: number) => (whole > 0 ? Math.max(0, (whole - part) / whole) : null);
    queryTotals = {
      ...fromQueries,
      anonymized_click_share: share(fromQueries.clicks, report.totals.clicks),
      anonymized_impression_share: share(fromQueries.impressions, report.totals.impressions),
    };
    opportunities = await loadOpportunities(searchSql!, {
      organizationId: property.organization_id,
      propertyId: property.id,
      siteUrl: property.site_url,
      window: report.window,
      totals: report.totals,
      previous: report.previous,
    });
  } catch (error) {
    console.error("Search opportunities read failed:", error instanceof Error ? error.message : "unknown");
    reason = "error";
  }
  return {
    ...base,
    state: "ok",
    reason,
    window: report.window,
    clamped,
    retention_floor: floor,
    partial_days: partialDays,
    totals: report.totals,
    query_totals: queryTotals,
    previous: report.previous,
    change: report.change,
    series: report.series,
    top_queries: report.queries.slice(0, AGENT_TOP_ROWS),
    top_pages: report.pages.slice(0, AGENT_TOP_ROWS),
    opportunities,
  };
}

/**
 * Search data for one organization: every mapped Search Console property, or just `propertyId`. A property id that
 * is not this organization's (or was removed) gives { ok: false, status: 404 }, never another client's data.
 */
export async function loadAgentSearch(
  sql: Sql,
  searchSql: Sql | null,
  input: { organizationId: string; propertyId?: string | null; range?: SearchRangeId | null; period?: PeriodQuery; now: number },
): Promise<{ ok: true; result: AgentSearchResult } | { ok: false; status: 404; message: string }> {
  const period: PeriodQuery = input.period ?? { ...DEFAULT_PERIOD, range: input.range ?? null };
  const range = period.start ? "custom" : (period.range ?? "28d");
  const all = (await listSearchProperties(sql, input.organizationId)).filter((row) => row.provider === "gsc");
  const wanted = input.propertyId?.trim() || null;
  const chosen = wanted ? all.filter((row) => row.id === wanted) : all;
  if (wanted && chosen.length === 0) return { ok: false, status: 404, message: "That Search Console property is not on this client." };
  const properties: AgentSearchProperty[] = [];
  for (const property of chosen) properties.push(await oneProperty(sql, searchSql, property, period, input.now));
  const newest = (values: (string | null)[]) => values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return {
    ok: true,
    result: {
      organization_id: input.organizationId,
      source: "google_search_console",
      range,
      data_through: newest(properties.map((row) => row.data_through)),
      last_sync_at: newest(properties.map((row) => row.last_sync_at)),
      notes:
        "Staff and agents only: never quote these numbers to the client as-is. Position is the impression-weighted average; CTR is clicks / impressions; days are Search Console days. The newest 2-3 days can still change.",
      properties,
      latest_update: await latestSearchUpdate(sql, input.organizationId),
      act: ACT,
    },
  };
}

/** Finds one opportunity by id in the current data (any property of this organization, or the one given). */
export async function findOpportunity(
  sql: Sql,
  searchSql: Sql | null,
  input: { organizationId: string; opportunityId: string; propertyId?: string | null; range?: SearchRangeId | null; now: number },
): Promise<{ property: AgentSearchProperty; opportunity: Opportunity; range: SearchRangeId | "custom" } | null> {
  const loaded = await loadAgentSearch(sql, searchSql, input);
  if (!loaded.ok) return null;
  for (const property of loaded.result.properties) {
    const opportunity = property.opportunities.find((row) => row.id === input.opportunityId);
    if (opportunity) return { property, opportunity, range: loaded.result.range };
  }
  return null;
}
