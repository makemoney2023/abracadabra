import type { Sql } from "@/db/sql";

/**
 * Read side of the Search Console facts (PR 3): what the Search tab shows for one mapped property.
 * Reads the handoff-search database (SEARCH_DB) only. Every query is scoped by organization_id AND property_id, has a
 * bounded day range (at most 16 months) and a LIMIT. Rates are always computed from sums, never averaged:
 * CTR = clicks / impressions, average position = pos_sum / impressions (pos_sum is impression-weighted, see s0001).
 */

export const SEARCH_RANGES = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "28d", label: "28 days", days: 28 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "16m", label: "16 months", days: null },
] as const;

export type SearchRangeId = (typeof SEARCH_RANGES)[number]["id"];

export const SEARCH_SORTS = ["clicks", "impressions", "ctr", "position"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const TOP_ROWS = 25;
/** Never look further back than this many days from the anchor, whatever is asked. */
export const MAX_RANGE_DAYS = 500;

export function searchRangeId(value: string | undefined): SearchRangeId {
  return SEARCH_RANGES.some((range) => range.id === value) ? (value as SearchRangeId) : "28d";
}

export function searchSort(value: string | undefined): SearchSort {
  return (SEARCH_SORTS as readonly string[]).includes(value ?? "") ? (value as SearchSort) : "clicks";
}

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function msOf(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function addDays(day: string, days: number): string {
  return dayOf(msOf(day) + days * DAY_MS);
}

function minusMonths(day: string, months: number): string {
  const date = new Date(msOf(day));
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return dayOf(target.getTime());
}

export type SearchPeriod = { start: string; end: string; days: number };
export type SearchWindow = {
  current: SearchPeriod;
  previous: SearchPeriod | null;
};

/**
 * The current period ends on the anchor (the newest day HQ holds, else yesterday UTC). The previous period is the same
 * number of days right before it. 16 months has no previous period: daily rows are only kept for 16 months.
 */
export function searchWindow(range: SearchRangeId, anchor: string): SearchWindow {
  const end = anchor;
  const spec = SEARCH_RANGES.find((item) => item.id === range) ?? SEARCH_RANGES[1];
  let start = spec.days ? addDays(end, -(spec.days - 1)) : addDays(minusMonths(end, 16), 1);
  if (msOf(end) - msOf(start) > (MAX_RANGE_DAYS - 1) * DAY_MS) start = addDays(end, -(MAX_RANGE_DAYS - 1));
  const days = Math.round((msOf(end) - msOf(start)) / DAY_MS) + 1;
  if (!spec.days) return { current: { start, end, days }, previous: null };
  const prevEnd = addDays(start, -1);
  return {
    current: { start, end, days },
    previous: { start: addDays(prevEnd, -(days - 1)), end: prevEnd, days },
  };
}

export type Totals = {
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
};

type Sums = {
  clicks: number | null;
  impressions: number | null;
  pos_sum: number | null;
};

export function totalsFromSums(row: Sums | undefined): Totals {
  const clicks = Number(row?.clicks ?? 0);
  const impressions = Number(row?.impressions ?? 0);
  const posSum = Number(row?.pos_sum ?? 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: impressions > 0 ? posSum / impressions : null,
  };
}

export type Change = { delta: number | null; better: boolean | null };

/** Change vs the previous period. Clicks and impressions as a ratio, CTR in points, position in places (lower is better). */
export function compareTotals(current: Totals, previous: Totals | null): Record<keyof Totals, Change> {
  const none: Change = { delta: null, better: null };
  if (!previous) return { clicks: none, impressions: none, ctr: none, position: none };
  const ratio = (now: number, before: number): Change =>
    before > 0
      ? {
          delta: (now - before) / before,
          better: now === before ? null : now > before,
        }
      : none;
  const diff = (now: number | null, before: number | null, lowerIsBetter: boolean): Change => {
    if (now === null || before === null) return none;
    const delta = now - before;
    return {
      delta,
      better: delta === 0 ? null : lowerIsBetter ? delta < 0 : delta > 0,
    };
  };
  return {
    clicks: ratio(current.clicks, previous.clicks),
    impressions: ratio(current.impressions, previous.impressions),
    ctr: diff(current.ctr, previous.ctr, false),
    position: diff(current.position, previous.position, true),
  };
}

export type SeriesPoint = { day: string; clicks: number; impressions: number };
export type TopRow = { label: string } & Totals;

export type SearchReport =
  | { state: "unavailable"; reason: "no_db" | "not_ready" | "error" }
  | { state: "empty"; window: SearchWindow }
  | {
      state: "ok";
      window: SearchWindow;
      totals: Totals;
      previous: Totals | null;
      change: Record<keyof Totals, Change>;
      series: SeriesPoint[];
      queries: TopRow[];
      pages: TopRow[];
      sort: SearchSort;
    };

const ORDER: Record<SearchSort, string> = {
  clicks: "clicks DESC, impressions DESC",
  impressions: "impressions DESC, clicks DESC",
  ctr: "CAST(clicks AS REAL) / impressions DESC, impressions DESC",
  position: "pos_sum / impressions ASC, impressions DESC",
};

/** Missing tables mean s0001 has not run yet on handoff-search (it runs on the first real sync batch). */
export function isMissingTable(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}

/** Fills days with no row with zeros, so the chart's x axis is continuous. */
export function fillSeries(rows: SeriesPoint[], period: SearchPeriod): SeriesPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const out: SeriesPoint[] = [];
  for (let day = period.start; day <= period.end; day = addDays(day, 1)) {
    const row = byDay.get(day);
    out.push({
      day,
      clicks: Number(row?.clicks ?? 0),
      impressions: Number(row?.impressions ?? 0),
    });
  }
  return out;
}

async function topRows(
  sql: Sql,
  kind: "query" | "page",
  scope: { organizationId: string; propertyId: string },
  period: SearchPeriod,
  sort: SearchSort,
): Promise<TopRow[]> {
  const fact = kind === "query" ? "search_daily_query" : "search_daily_page";
  const idColumn = kind === "query" ? "query_id" : "page_id";
  const dim = kind === "query" ? "search_queries" : "search_pages";
  const labelColumn = kind === "query" ? "text" : "url";
  const rows = await sql.all<Sums & { label: string }>(
    `SELECT d.${labelColumn} AS label, t.clicks, t.impressions, t.pos_sum
     FROM (
       SELECT ${idColumn} AS id, SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(pos_sum) AS pos_sum
       FROM ${fact}
       WHERE organization_id = ? AND property_id = ? AND day BETWEEN ? AND ?
       GROUP BY ${idColumn}
       HAVING SUM(impressions) > 0
       ORDER BY ${ORDER[sort]}
       LIMIT ${TOP_ROWS}
     ) AS t
     JOIN ${dim} AS d ON d.id = t.id AND d.property_id = ?
     ORDER BY ${ORDER[sort]}`,
    [scope.organizationId, scope.propertyId, period.start, period.end, scope.propertyId],
  );
  return rows.map((row) => ({ label: row.label, ...totalsFromSums(row) }));
}

async function siteTotals(
  sql: Sql,
  scope: { organizationId: string; propertyId: string },
  period: SearchPeriod,
): Promise<Totals> {
  const row = await sql.get<Sums>(
    `SELECT SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(pos_sum) AS pos_sum
     FROM search_daily_site
     WHERE organization_id = ? AND property_id = ? AND search_type = 'web' AND day BETWEEN ? AND ?`,
    [scope.organizationId, scope.propertyId, period.start, period.end],
  );
  return totalsFromSums(row);
}

/**
 * The whole Search tab for one property. searchSql null (SEARCH_DB not bound) or missing tables give "unavailable";
 * no rows in the window give "empty". Never throws: a broken read shows an empty state, not a crashed client page.
 */
export async function loadSearchReport(
  searchSql: Sql | null,
  input: {
    organizationId: string;
    propertyId: string;
    range: SearchRangeId;
    sort?: SearchSort;
    now: number;
    /** Custom dates (agent API): replaces the window the range would give. Already clamped by the caller. */
    window?: (anchor: string) => SearchWindow;
    /** Agent API default: end on the newest final day, leaving out the last ~3 days Google may still change. */
    finalOnly?: boolean;
  },
): Promise<SearchReport> {
  if (!searchSql) return { state: "unavailable", reason: "no_db" };
  const scope = {
    organizationId: input.organizationId,
    propertyId: input.propertyId,
  };
  const sort = input.sort ?? "clicks";
  const yesterday = dayOf(input.now - DAY_MS);
  try {
    const newest = (finalOnly: boolean) =>
      searchSql.get<{ day: string | null }>(
        `SELECT MAX(day) AS day FROM search_daily_site
         WHERE organization_id = ? AND property_id = ? AND search_type = 'web' AND day <= ?${finalOnly ? " AND is_final = 1" : ""}`,
        [scope.organizationId, scope.propertyId, yesterday],
      );
    // Final only: end on the newest day Google has finalized; with none yet, fall back to the newest day there is.
    let latest = await newest(Boolean(input.finalOnly));
    if (input.finalOnly && !latest?.day) latest = await newest(false);
    const anchor = latest?.day && ISO_DAY.test(latest.day) ? latest.day : yesterday;
    const window = input.window ? input.window(anchor) : searchWindow(input.range, anchor);
    if (!latest?.day) return { state: "empty", window };
    const [totals, previous, seriesRows, queries, pages] = await Promise.all([
      siteTotals(searchSql, scope, window.current),
      window.previous ? siteTotals(searchSql, scope, window.previous) : Promise.resolve(null),
      searchSql.all<SeriesPoint>(
        `SELECT day, clicks, impressions FROM search_daily_site
         WHERE organization_id = ? AND property_id = ? AND search_type = 'web' AND day BETWEEN ? AND ?
         ORDER BY day LIMIT ${MAX_RANGE_DAYS}`,
        [scope.organizationId, scope.propertyId, window.current.start, window.current.end],
      ),
      topRows(searchSql, "query", scope, window.current, sort),
      topRows(searchSql, "page", scope, window.current, sort),
    ]);
    if (totals.impressions === 0 && totals.clicks === 0 && seriesRows.length === 0) return { state: "empty", window };
    const comparable = previous && previous.impressions > 0 ? previous : null;
    return {
      state: "ok",
      window,
      totals,
      previous: comparable,
      change: compareTotals(totals, comparable),
      series: fillSeries(seriesRows, window.current),
      queries,
      pages,
      sort,
    };
  } catch (error) {
    if (isMissingTable(error)) return { state: "unavailable", reason: "not_ready" };
    console.error("Search report read failed:", error instanceof Error ? error.message : "unknown");
    return { state: "unavailable", reason: "error" };
  }
}
