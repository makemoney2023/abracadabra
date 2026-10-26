import type { Sql } from "@/db/sql";
import { listSearchProperties, type SearchProperty } from "./properties";
import { opportunityId, shortHash } from "./opportunities";
import { resolveWindow, type PeriodQuery } from "./periods";
import { compareTotals, isMissingTable, totalsFromSums, type Change, type SearchWindow, type Totals } from "./report";

/**
 * Row-level reads for agents (PR 4, SEO & Analytics asks): GET /api/agent-search/rows and /api/agent-search/indexing.
 * Read-only, never calls Google. Every query is scoped by organization_id AND property_id, has a bounded day range
 * (clamped to the 16 months HQ keeps) and a LIMIT (at most 1,000 rows a page, offset cursor up to 50,000 rows).
 *
 * What is stored (s0001), so what can be asked for:
 * - query, page, and query x page per day (query x page is Google's top 5,000 pairs a day; the full set is only in R2);
 * - country x device per day, site level only (not per query or page);
 * - search type web only. No search appearance, no AI Overview or AI Mode split (Search Console's API does not
 *   separate AI Overviews; they are counted inside web), no image, video, news or Discover.
 * - URL Inspection results (search_url_state, search_url_events) and the sitemap list (search_sitemaps).
 */

export const ROW_DIMENSIONS = ["query", "page", "query_page", "country", "device", "country_device"] as const;
export type RowDimension = (typeof ROW_DIMENSIONS)[number];
export const ROW_SORTS = ["clicks", "impressions", "ctr", "position"] as const;
export type RowSort = (typeof ROW_SORTS)[number];

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;
export const MAX_OFFSET = 50_000;
export const MAX_TERMS = 10;
export const MAX_TERM_LENGTH = 60;
/** Whole words that make a query a question or a comparison (query_preset=questions). */
export const QUESTION_WORDS = ["how", "what", "why", "when", "where", "who", "which", "can", "does", "is", "should", "best", "vs", "versus"];

export const STORED_DIMENSIONS = {
  daily: ["query", "page", "query_page (top 5,000 pairs a day)", "country x device (site level)"],
  search_type: ["web"],
  search_appearance: false,
  ai_overview_or_ai_mode: false,
  url_inspection: true,
  sitemaps: true,
  note: "Search Console's API reports AI Overview and AI Mode traffic inside web search; it is not a separate dimension, so HQ cannot split it.",
} as const;

export type RowFilters = {
  page: string | null;
  pagePrefix: string | null;
  queryContains: string[];
  queryWords: string[];
  queryExclude: string[];
};

export type RowsQuery = {
  dimension: RowDimension;
  period: PeriodQuery;
  filters: RowFilters;
  sort: RowSort;
  limit: number;
  cursor: string | null;
  minImpressions: number;
  /** max_clicks=0: rows with impressions but no clicks (e.g. pages Google shows that nobody picks). */
  maxClicks: number | null;
};

function terms(value: string | null, name: string): { ok: true; list: string[] } | { ok: false; message: string } {
  if (!value) return { ok: true, list: [] };
  const list = value.split(",").map((term) => term.trim().toLowerCase()).filter(Boolean);
  if (list.length > MAX_TERMS) return { ok: false, message: `${name} takes at most ${MAX_TERMS} comma-separated terms.` };
  if (list.some((term) => term.length > MAX_TERM_LENGTH)) return { ok: false, message: `Each ${name} term is at most ${MAX_TERM_LENGTH} characters.` };
  return { ok: true, list: [...new Set(list)] };
}

/** dimension, page, page_prefix, query_contains, query_words, query_exclude, query_preset, sort, limit, cursor, min_impressions. */
export function parseRowsQuery(get: (name: string) => string | null, period: PeriodQuery): { ok: true; value: RowsQuery } | { ok: false; message: string } {
  const text = (name: string) => get(name)?.trim() || null;
  const dimension = (text("dimension") ?? "query") as RowDimension;
  if (!ROW_DIMENSIONS.includes(dimension)) return { ok: false, message: `dimension must be one of ${ROW_DIMENSIONS.join(", ")}.` };
  const sort = (text("sort") ?? "clicks") as RowSort;
  if (!ROW_SORTS.includes(sort)) return { ok: false, message: `sort must be one of ${ROW_SORTS.join(", ")}.` };
  const limitText = text("limit");
  const limit = limitText ? Number(limitText) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { ok: false, message: `limit must be 1-${MAX_LIMIT}.` };
  const minText = text("min_impressions");
  const minImpressions = minText ? Number(minText) : 1;
  if (!Number.isInteger(minImpressions) || minImpressions < 0) return { ok: false, message: "min_impressions must be a whole number." };
  const maxText = text("max_clicks");
  const maxClicks = maxText ? Number(maxText) : null;
  if (maxClicks !== null && (!Number.isInteger(maxClicks) || maxClicks < 0)) return { ok: false, message: "max_clicks must be a whole number." };
  const page = text("page");
  const pagePrefix = text("page_prefix");
  if (page && pagePrefix) return { ok: false, message: "Use page or page_prefix, not both." };
  if ((page?.length ?? 0) > 2048 || (pagePrefix?.length ?? 0) > 2048) return { ok: false, message: "page is too long." };
  const contains = terms(text("query_contains"), "query_contains");
  if (!contains.ok) return contains;
  const words = terms(text("query_words"), "query_words");
  if (!words.ok) return words;
  const exclude = terms(text("query_exclude"), "query_exclude");
  if (!exclude.ok) return exclude;
  const preset = text("query_preset");
  if (preset && preset !== "questions") return { ok: false, message: "query_preset must be questions." };
  if (text("query_regex")) {
    return { ok: false, message: "query_regex is not supported (D1 has no REGEXP). Use query_contains, query_words, or query_preset=questions." };
  }
  const queryWords = preset ? [...new Set([...words.list, ...QUESTION_WORDS])] : words.list;
  if (queryWords.length > MAX_TERMS + QUESTION_WORDS.length) return { ok: false, message: "Too many query_words." };
  const filters: RowFilters = { page, pagePrefix, queryContains: contains.list, queryWords, queryExclude: exclude.list };
  const segment = dimension === "country" || dimension === "device" || dimension === "country_device";
  const hasQueryFilter = filters.queryContains.length + filters.queryWords.length + filters.queryExclude.length > 0;
  if (segment && (page || pagePrefix || hasQueryFilter)) {
    return { ok: false, message: "Country and device rows are site level: page and query filters do not apply." };
  }
  if (dimension === "page" && hasQueryFilter) return { ok: false, message: "Query filters need dimension query or query_page." };
  if (dimension === "query" && (page || pagePrefix)) return { ok: false, message: "Page filters need dimension page or query_page." };
  return { ok: true, value: { dimension, period, filters, sort, limit, cursor: text("cursor"), minImpressions, maxClicks } };
}

function fingerprint(propertyId: string, query: RowsQuery): string {
  return shortHash(JSON.stringify([propertyId, { ...query, cursor: null, limit: null }]));
}

export function encodeCursor(offset: number, print: string): string {
  return btoa(JSON.stringify({ o: offset, f: print })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string | null, print: string): number | null {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/"))) as { o?: unknown; f?: unknown };
    if (parsed.f !== print || typeof parsed.o !== "number" || !Number.isInteger(parsed.o) || parsed.o < 0 || parsed.o > MAX_OFFSET) return null;
    return parsed.o;
  } catch {
    return null;
  }
}

const like = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

export type PropertyHeader = {
  id: string;
  site_url: string;
  status: SearchProperty["status"];
  data_through: string | null;
  last_sync_at: string | null;
};

export function propertyHeader(property: SearchProperty): PropertyHeader {
  return {
    id: property.id,
    site_url: property.site_url,
    status: property.status,
    data_through: property.data_through,
    last_sync_at: property.last_success_at === null ? null : new Date(property.last_success_at).toISOString(),
  };
}

/** The asked property (404 when not this organization's), else the first active one, else the first. */
export async function pickProperty(
  sql: Sql,
  organizationId: string,
  propertyId: string | null,
): Promise<{ ok: true; property: SearchProperty } | { ok: false; status: 404; message: string }> {
  const all = (await listSearchProperties(sql, organizationId)).filter((row) => row.provider === "gsc");
  const wanted = propertyId?.trim() || null;
  const property = wanted ? all.find((row) => row.id === wanted) : (all.find((row) => row.status === "active") ?? all[0]);
  if (!property) {
    return { ok: false, status: 404, message: wanted ? "That Search Console property is not on this client." : "This client has no Search Console property mapped." };
  }
  return { ok: true, property };
}

async function anchorFor(searchSql: Sql, property: SearchProperty, now: number, includePartial: boolean): Promise<string | null> {
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const row = await searchSql.get<{ day: string | null }>(
    `SELECT MAX(day) AS day FROM search_daily_site WHERE organization_id = ? AND property_id = ? AND search_type = 'web' AND day <= ?${includePartial ? "" : " AND is_final = 1"}`,
    [property.organization_id, property.id, yesterday],
  );
  if (!row?.day && !includePartial) return anchorFor(searchSql, property, now, true);
  return row?.day ?? null;
}

export type ExploreRow = {
  query?: string;
  page?: string;
  country?: string;
  device?: string;
  /** For query rows: the low_ctr / striking_distance opportunity id this query would have (to match /api/agent-search). */
  opportunity_ids?: string[];
} & Totals & { previous: Totals | null; change: Record<keyof Totals, Change> | null };

export type RowsResult = {
  property: PropertyHeader;
  data_through: string | null;
  last_sync_at: string | null;
  state: "ok" | "empty" | "pending" | "unavailable";
  reason: "no_db" | "not_ready" | "error" | null;
  dimension: RowDimension;
  window: SearchWindow | null;
  clamped: boolean;
  retention_floor: string | null;
  sort: RowSort;
  limit: number;
  rows: ExploreRow[];
  next_cursor: string | null;
  stored_dimensions: typeof STORED_DIMENSIONS;
};

const ORDER: Record<RowSort, string> = {
  clicks: "clicks DESC, impressions DESC",
  impressions: "impressions DESC, clicks DESC",
  ctr: "CAST(clicks AS REAL) / impressions DESC, impressions DESC",
  position: "pos_sum / impressions ASC, impressions DESC",
};

type Built = { select: string; from: string; where: string[]; params: unknown[]; group: string; tie: string };

function build(query: RowsQuery, property: SearchProperty): Built {
  const scope = ["f.organization_id = ?", "f.property_id = ?"];
  const params: unknown[] = [property.organization_id, property.id];
  const { filters } = query;
  const where: string[] = [];
  const filterParams: unknown[] = [];
  if (filters.page) {
    where.push("p.url = ?");
    filterParams.push(filters.page);
  }
  if (filters.pagePrefix) {
    where.push("p.url LIKE ? ESCAPE '\\'");
    filterParams.push(`${like(filters.pagePrefix)}%`);
  }
  if (filters.queryContains.length) {
    where.push(`(${filters.queryContains.map(() => "lower(q.text) LIKE ? ESCAPE '\\'").join(" OR ")})`);
    filterParams.push(...filters.queryContains.map((term) => `%${like(term)}%`));
  }
  if (filters.queryWords.length) {
    where.push(`(${filters.queryWords.map(() => "(' ' || lower(q.text) || ' ') LIKE ? ESCAPE '\\'").join(" OR ")})`);
    filterParams.push(...filters.queryWords.map((term) => `% ${like(term)} %`));
  }
  for (const term of filters.queryExclude) {
    where.push("lower(q.text) NOT LIKE ? ESCAPE '\\'");
    filterParams.push(`%${like(term)}%`);
  }
  switch (query.dimension) {
    case "query":
      return {
        select: "q.text AS query",
        from: "search_daily_query f JOIN search_queries q ON q.id = f.query_id AND q.property_id = f.property_id",
        where: [...scope, ...where], params: [...params, ...filterParams], group: "f.query_id", tie: "f.query_id",
      };
    case "page":
      return {
        select: "p.url AS page",
        from: "search_daily_page f JOIN search_pages p ON p.id = f.page_id AND p.property_id = f.property_id",
        where: [...scope, ...where], params: [...params, ...filterParams], group: "f.page_id", tie: "f.page_id",
      };
    case "query_page":
      return {
        select: "q.text AS query, p.url AS page",
        from: `search_daily_query_page f
               JOIN search_queries q ON q.id = f.query_id AND q.property_id = f.property_id
               JOIN search_pages p ON p.id = f.page_id AND p.property_id = f.property_id`,
        where: [...scope, ...where], params: [...params, ...filterParams], group: "f.query_id, f.page_id", tie: "f.query_id, f.page_id",
      };
    case "country":
      return { select: "f.country AS country", from: "search_daily_segment f", where: scope, params, group: "f.country", tie: "f.country" };
    case "device":
      return { select: "f.device AS device", from: "search_daily_segment f", where: scope, params, group: "f.device", tie: "f.device" };
    case "country_device":
      return {
        select: "f.country AS country, f.device AS device", from: "search_daily_segment f", where: scope, params,
        group: "f.country, f.device", tie: "f.country, f.device",
      };
  }
}

type RawRow = {
  query?: string; page?: string; country?: string; device?: string;
  clicks: number | null; impressions: number | null; pos_sum: number | null;
  p_clicks: number | null; p_impressions: number | null; p_pos_sum: number | null;
};

/** One page of rows for one property. Never calls Google; never throws (errors become state unavailable/error). */
export async function exploreRows(
  sql: Sql,
  searchSql: Sql | null,
  input: { organizationId: string; propertyId: string | null; query: RowsQuery; now: number },
): Promise<{ ok: true; result: RowsResult } | { ok: false; status: 400 | 404; message: string }> {
  const picked = await pickProperty(sql, input.organizationId, input.propertyId);
  if (!picked.ok) return picked;
  const property = picked.property;
  const print = fingerprint(property.id, input.query);
  const offset = decodeCursor(input.query.cursor, print);
  if (offset === null) return { ok: false, status: 400, message: "cursor does not match this query (or is too deep). Start again without it." };
  const header = propertyHeader(property);
  const base: RowsResult = {
    property: header,
    data_through: header.data_through,
    last_sync_at: header.last_sync_at,
    state: "pending",
    reason: null,
    dimension: input.query.dimension,
    window: null,
    clamped: false,
    retention_floor: null,
    sort: input.query.sort,
    limit: input.query.limit,
    rows: [],
    next_cursor: null,
    stored_dimensions: STORED_DIMENSIONS,
  };
  if (property.status === "pending") return { ok: true, result: base };
  if (!searchSql) return { ok: true, result: { ...base, state: "unavailable", reason: "no_db" } };
  try {
    const anchor = await anchorFor(searchSql, property, input.now, input.query.period.includePartial);
    const resolved = resolveWindow(input.query.period, anchor ?? new Date(input.now - 86_400_000).toISOString().slice(0, 10));
    const { current, previous } = resolved.window;
    const framed = { ...base, window: resolved.window, clamped: resolved.clamped, retention_floor: resolved.floor };
    if (!anchor) return { ok: true, result: { ...framed, state: "empty" } };
    const built = build(input.query, property);
    const dayFilter = previous ? "(f.day BETWEEN ? AND ? OR f.day BETWEEN ? AND ?)" : "f.day BETWEEN ? AND ?";
    const dayParams = previous ? [current.start, current.end, previous.start, previous.end] : [current.start, current.end];
    const prevCols = previous
      ? `SUM(CASE WHEN f.day BETWEEN ? AND ? THEN f.clicks ELSE 0 END) AS p_clicks,
         SUM(CASE WHEN f.day BETWEEN ? AND ? THEN f.impressions ELSE 0 END) AS p_impressions,
         SUM(CASE WHEN f.day BETWEEN ? AND ? THEN f.pos_sum ELSE 0 END) AS p_pos_sum`
      : "NULL AS p_clicks, NULL AS p_impressions, NULL AS p_pos_sum";
    const prevParams = previous ? [previous.start, previous.end, previous.start, previous.end, previous.start, previous.end] : [];
    const rows = await searchSql.all<RawRow>(
      `SELECT ${built.select},
              SUM(CASE WHEN f.day BETWEEN ? AND ? THEN f.clicks ELSE 0 END) AS clicks,
              SUM(CASE WHEN f.day BETWEEN ? AND ? THEN f.impressions ELSE 0 END) AS impressions,
              SUM(CASE WHEN f.day BETWEEN ? AND ? THEN f.pos_sum ELSE 0 END) AS pos_sum,
              ${prevCols}
       FROM ${built.from}
       WHERE ${[...built.where, dayFilter].join(" AND ")}
       GROUP BY ${built.group}
       HAVING SUM(CASE WHEN f.day BETWEEN ? AND ? THEN f.impressions ELSE 0 END) >= ? AND impressions > 0${input.query.maxClicks === null ? "" : " AND clicks <= ?"}
       ORDER BY ${ORDER[input.query.sort]}, ${built.tie}
       LIMIT ? OFFSET ?`,
      [
        current.start, current.end, current.start, current.end, current.start, current.end,
        ...prevParams,
        ...built.params,
        ...dayParams,
        current.start, current.end, input.query.minImpressions,
        ...(input.query.maxClicks === null ? [] : [input.query.maxClicks]),
        input.query.limit + 1, offset,
      ],
    );
    const more = rows.length > input.query.limit;
    const out: ExploreRow[] = rows.slice(0, input.query.limit).map((row) => {
      const totals = totalsFromSums(row);
      const before = previous ? totalsFromSums({ clicks: row.p_clicks, impressions: row.p_impressions, pos_sum: row.p_pos_sum }) : null;
      const comparable = before && before.impressions > 0 ? before : null;
      const labels: Pick<ExploreRow, "query" | "page" | "country" | "device"> = {};
      if (row.query !== undefined) labels.query = row.query;
      if (row.page !== undefined) labels.page = row.page;
      if (row.country !== undefined) labels.country = row.country;
      if (row.device !== undefined) labels.device = row.device;
      return {
        ...labels,
        ...(input.query.dimension === "query" && row.query
          ? { opportunity_ids: [opportunityId("low_ctr", row.query), opportunityId("striking_distance", row.query), opportunityId("query_drop", row.query)] }
          : {}),
        ...(input.query.dimension === "page" && row.page ? { opportunity_ids: [opportunityId("page_drop", row.page)] } : {}),
        ...totals,
        previous: comparable,
        change: comparable ? compareTotals(totals, comparable) : null,
      };
    });
    const nextOffset = offset + input.query.limit;
    return {
      ok: true,
      result: { ...framed, state: out.length || offset ? "ok" : "empty", rows: out, next_cursor: more && nextOffset <= MAX_OFFSET ? encodeCursor(nextOffset, print) : null },
    };
  } catch (error) {
    if (isMissingTable(error)) return { ok: true, result: { ...base, state: "unavailable", reason: "not_ready" } };
    console.error("Search rows read failed:", error instanceof Error ? error.message : "unknown");
    return { ok: true, result: { ...base, state: "unavailable", reason: "error" } };
  }
}

// ---------- Indexing: stored URL Inspection results and sitemaps ----------

export type IndexingQuery = { url: string | null; urlPrefix: string | null; verdict: string | null; canonicalMismatch: boolean; limit: number; cursor: string | null };

export function parseIndexingQuery(get: (name: string) => string | null): { ok: true; value: IndexingQuery } | { ok: false; message: string } {
  const text = (name: string) => get(name)?.trim() || null;
  const url = text("url");
  const urlPrefix = text("url_prefix");
  if (url && urlPrefix) return { ok: false, message: "Use url or url_prefix, not both." };
  if ((url?.length ?? 0) > 2048 || (urlPrefix?.length ?? 0) > 2048) return { ok: false, message: "url is too long." };
  const verdict = text("verdict")?.toUpperCase() ?? null;
  if (verdict && !/^[A-Z_]{1,40}$/.test(verdict)) return { ok: false, message: "verdict is a Search Console verdict such as PASS, NEUTRAL, or FAIL." };
  const limitText = text("limit");
  const limit = limitText ? Number(limitText) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { ok: false, message: `limit must be 1-${MAX_LIMIT}.` };
  return { ok: true, value: { url, urlPrefix, verdict, canonicalMismatch: text("canonical_mismatch") === "1", limit, cursor: text("cursor") } };
}

export type IndexingUrl = {
  url: string;
  verdict: string | null;
  coverage_state: string | null;
  indexing_state: string | null;
  robots_state: string | null;
  fetch_state: string | null;
  google_canonical: string | null;
  user_canonical: string | null;
  canonical_mismatch: boolean;
  last_crawl_at: string | null;
  inspected_at: string;
  in_sitemap: boolean;
  sitemap_lastmod: string | null;
};

export type IndexingResult = {
  property: PropertyHeader;
  data_through: string | null;
  last_sync_at: string | null;
  state: "ok" | "empty" | "pending" | "unavailable";
  reason: "no_db" | "not_ready" | "error" | null;
  /**
   * URL Inspection runs inside the daily sync (about 15 minutes after it starts), never from this endpoint: sitemap
   * URLs that are new or changed first, then pages whose impressions fell, the top 50 pages weekly, then the rest
   * round-robin. daily_budget is the property's inspect_budget (default 200, staff can set 0-1,800).
   */
  inspection: { daily_budget: number; used_today: number; inspected_urls: number; last_inspected_at: string | null; live_calls_from_this_endpoint: false };
  sitemaps: { path: string; last_submitted: string | null; last_downloaded: string | null; is_pending: boolean; errors: number | null; warnings: number | null; submitted_urls: number | null; fetched_at: string }[];
  urls: IndexingUrl[];
  /** For one exact url: its last 20 coverage changes, newest first. */
  events: { from_state: string | null; to_state: string; at: string }[] | null;
  next_cursor: string | null;
};

export async function exploreIndexing(
  sql: Sql,
  searchSql: Sql | null,
  input: { organizationId: string; propertyId: string | null; query: IndexingQuery; now: number },
): Promise<{ ok: true; result: IndexingResult } | { ok: false; status: 400 | 404; message: string }> {
  const picked = await pickProperty(sql, input.organizationId, input.propertyId);
  if (!picked.ok) return picked;
  const property = picked.property;
  const print = shortHash(JSON.stringify([property.id, "indexing", { ...input.query, cursor: null, limit: null }]));
  const offset = decodeCursor(input.query.cursor, print);
  if (offset === null) return { ok: false, status: 400, message: "cursor does not match this query (or is too deep). Start again without it." };
  const header = propertyHeader(property);
  const dayStart = Date.parse(`${new Date(input.now).toISOString().slice(0, 10)}T00:00:00Z`);
  const used = await sql.get<{ n: number | null }>(
    "SELECT sum(api_calls) AS n FROM search_sync_runs WHERE property_id = ? AND kind = 'inspect' AND created_at >= ?",
    [property.id, dayStart],
  );
  const base: IndexingResult = {
    property: header,
    data_through: header.data_through,
    last_sync_at: header.last_sync_at,
    state: "pending",
    reason: null,
    inspection: { daily_budget: property.inspect_budget, used_today: Number(used?.n ?? 0), inspected_urls: 0, last_inspected_at: null, live_calls_from_this_endpoint: false },
    sitemaps: [],
    urls: [],
    events: null,
    next_cursor: null,
  };
  if (property.status === "pending") return { ok: true, result: base };
  if (!searchSql) return { ok: true, result: { ...base, state: "unavailable", reason: "no_db" } };
  try {
    const scope = [property.organization_id, property.id];
    const summary = await searchSql.get<{ n: number; last: number | null }>(
      "SELECT count(*) AS n, MAX(inspected_at) AS last FROM search_url_state WHERE organization_id = ? AND property_id = ?",
      scope,
    );
    const sitemaps = await searchSql.all<{
      path: string; last_submitted: string | null; last_downloaded: string | null; is_pending: number | null;
      errors: number | null; warnings: number | null; submitted_urls: number | null; fetched_at: number;
    }>(
      `SELECT path, last_submitted, last_downloaded, is_pending, errors, warnings, submitted_urls, fetched_at
       FROM search_sitemaps WHERE organization_id = ? AND property_id = ? ORDER BY path LIMIT 200`,
      scope,
    );
    const where = ["s.organization_id = ?", "s.property_id = ?"];
    const params: unknown[] = [...scope];
    if (input.query.url) {
      where.push("p.url = ?");
      params.push(input.query.url);
    }
    if (input.query.urlPrefix) {
      where.push("p.url LIKE ? ESCAPE '\\'");
      params.push(`${like(input.query.urlPrefix)}%`);
    }
    if (input.query.verdict) {
      where.push("s.verdict = ?");
      params.push(input.query.verdict);
    }
    if (input.query.canonicalMismatch) where.push("s.google_canonical IS NOT NULL AND s.user_canonical IS NOT NULL AND s.google_canonical <> s.user_canonical");
    const rows = await searchSql.all<{
      url: string; verdict: string | null; coverage_state: string | null; indexing_state: string | null; robots_state: string | null;
      fetch_state: string | null; google_canonical: string | null; user_canonical: string | null; last_crawl_at: string | null;
      inspected_at: number; in_sitemap: number; sitemap_lastmod: string | null; page_id: number;
    }>(
      `SELECT p.url, s.verdict, s.coverage_state, s.indexing_state, s.robots_state, s.fetch_state, s.google_canonical, s.user_canonical,
              s.last_crawl_at, s.inspected_at, p.in_sitemap, p.sitemap_lastmod, s.page_id
       FROM search_url_state s JOIN search_pages p ON p.id = s.page_id AND p.property_id = s.property_id
       WHERE ${where.join(" AND ")}
       ORDER BY s.inspected_at DESC, s.page_id
       LIMIT ? OFFSET ?`,
      [...params, input.query.limit + 1, offset],
    );
    let events: IndexingResult["events"] = null;
    if (input.query.url && rows[0]) {
      const list = await searchSql.all<{ from_state: string | null; to_state: string; at: number }>(
        `SELECT from_state, to_state, at FROM search_url_events WHERE organization_id = ? AND property_id = ? AND page_id = ?
         ORDER BY at DESC, id DESC LIMIT 20`,
        [...scope, rows[0].page_id],
      );
      events = list.map((row) => ({ from_state: row.from_state, to_state: row.to_state, at: new Date(row.at).toISOString() }));
    }
    const more = rows.length > input.query.limit;
    const nextOffset = offset + input.query.limit;
    return {
      ok: true,
      result: {
        ...base,
        state: Number(summary?.n ?? 0) > 0 || sitemaps.length > 0 ? "ok" : "empty",
        inspection: { ...base.inspection, inspected_urls: Number(summary?.n ?? 0), last_inspected_at: summary?.last ? new Date(summary.last).toISOString() : null },
        sitemaps: sitemaps.map((row) => ({ ...row, is_pending: row.is_pending === 1, fetched_at: new Date(row.fetched_at).toISOString() })),
        urls: rows.slice(0, input.query.limit).map((row) => ({
          url: row.url,
          verdict: row.verdict,
          coverage_state: row.coverage_state,
          indexing_state: row.indexing_state,
          robots_state: row.robots_state,
          fetch_state: row.fetch_state,
          google_canonical: row.google_canonical,
          user_canonical: row.user_canonical,
          last_crawl_at: row.last_crawl_at,
          sitemap_lastmod: row.sitemap_lastmod,
          canonical_mismatch: Boolean(row.google_canonical && row.user_canonical && row.google_canonical !== row.user_canonical),
          inspected_at: new Date(row.inspected_at).toISOString(),
          in_sitemap: row.in_sitemap === 1,
        })),
        events,
        next_cursor: more && nextOffset <= MAX_OFFSET ? encodeCursor(nextOffset, print) : null,
      },
    };
  } catch (error) {
    if (isMissingTable(error)) return { ok: true, result: { ...base, state: "unavailable", reason: "not_ready" } };
    console.error("Search indexing read failed:", error instanceof Error ? error.message : "unknown");
    return { ok: true, result: { ...base, state: "unavailable", reason: "error" } };
  }
}
