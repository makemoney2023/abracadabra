import type { Sql } from "@/db/sql";
import { totalsFromSums, type SearchWindow, type Totals } from "./report";

/**
 * Search Console opportunities for agents (PR 4): the four kinds of finding an agent can turn into a card.
 * - low_ctr: a query already on page 1 (position <= 10) with plenty of impressions whose CTR is under half of what
 *   that position usually gets. The fix is the title and description.
 * - striking_distance: a query at position 4-20 with real impressions. The fix is content and internal links.
 * - query_drop / page_drop: a query or page that lost at least 30% (and at least 5) of its clicks vs the previous period.
 * - site_drop: the whole property lost at least 20% of its clicks vs the previous period.
 * Thresholds are written for 28 days and scale with the window length, so 7 days asks for a quarter of the volume.
 * Reads only search_daily_query / search_daily_page, scoped by organization_id AND property_id, bounded and limited.
 */

export const OPPORTUNITY_TYPES = ["low_ctr", "striking_distance", "query_drop", "page_drop", "site_drop"] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** Typical organic CTR by rounded position 1-10 (industry curve, conservative). Past 10: 1%. */
export const EXPECTED_CTR = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018] as const;
/** Striking distance is measured against a top-3 CTR (content-planner's clickPotential uses 10%). */
const TOP3_CTR = 0.1;

export const THRESHOLDS_28D = {
  lowCtrImpressions: 300,
  lowCtrRatio: 0.5,
  strikingImpressions: 100,
  strikingMin: 4,
  strikingMax: 20,
  dropPreviousClicks: 10,
  dropRatio: 0.3,
  dropMinClicks: 5,
  siteDropRatio: 0.2,
  siteDropPreviousClicks: 20,
} as const;

/** Most of each kind returned. */
export const OPPORTUNITY_LIMIT = 5;
const CANDIDATES = 300;
const DROP_CANDIDATES = 50;

export function expectedCtr(position: number): number {
  const rounded = Math.max(1, Math.round(position));
  return rounded <= EXPECTED_CTR.length ? EXPECTED_CTR[rounded - 1] : 0.01;
}

/** Thresholds for a window of `days`, scaled from 28 days (never below a small floor). */
export function scaledThresholds(days: number) {
  const scale = Math.max(days, 1) / 28;
  const at = (value: number, floor: number) => Math.max(floor, Math.round(value * scale));
  return {
    lowCtrImpressions: at(THRESHOLDS_28D.lowCtrImpressions, 50),
    strikingImpressions: at(THRESHOLDS_28D.strikingImpressions, 20),
    dropPreviousClicks: at(THRESHOLDS_28D.dropPreviousClicks, 5),
    siteDropPreviousClicks: at(THRESHOLDS_28D.siteDropPreviousClicks, 10),
  };
}

export type Opportunity = {
  /** Stable for the same finding: `<type>:<hash of the query or page>`. Pass it to POST /api/agent-search/cards. */
  id: string;
  type: OpportunityType;
  query: string | null;
  page: string | null;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  /** Previous period clicks (drops only). */
  previous_clicks: number | null;
  /** Estimated clicks a period to gain (low_ctr, striking_distance) or clicks lost (drops). Always >= 0. */
  clicks_at_stake: number;
  /** One plain sentence: what was found and what usually fixes it. Staff/agent wording; never shown to the client. */
  why: string;
};

/** FNV-1a, 32 bit: a short stable id for a query or URL. */
export function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function opportunityId(type: OpportunityType, label: string): string {
  return `${type}:${shortHash(label)}`;
}

type Row = { label: string } & Totals;
type DropRow = { label: string; clicks: number; previous_clicks: number; impressions: number; ctr: number | null; position: number | null };

const pct = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const pos = (value: number | null) => (value === null ? "n/a" : value.toFixed(1));

/** Pure: low CTR and striking distance from the current period's query rows. */
export function currentOpportunities(rows: Row[], days: number): Opportunity[] {
  const limits = scaledThresholds(days);
  const lowCtr: Opportunity[] = [];
  const striking: Opportunity[] = [];
  for (const row of rows) {
    if (row.position === null || row.ctr === null || row.impressions <= 0) continue;
    const expected = expectedCtr(row.position);
    if (
      row.impressions >= limits.lowCtrImpressions &&
      row.position <= 10 &&
      row.ctr < expected * THRESHOLDS_28D.lowCtrRatio
    ) {
      lowCtr.push({
        id: opportunityId("low_ctr", row.label),
        type: "low_ctr",
        query: row.label,
        page: null,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        previous_clicks: null,
        clicks_at_stake: Math.max(0, Math.round(row.impressions * (expected - row.ctr))),
        why: `"${row.label}" ranks ${pos(row.position)} with ${row.impressions} impressions but a ${pct(row.ctr)} CTR (about ${pct(expected)} is typical). Rewrite the title and meta description.`,
      });
      continue;
    }
    if (
      row.impressions >= limits.strikingImpressions &&
      row.position >= THRESHOLDS_28D.strikingMin &&
      row.position <= THRESHOLDS_28D.strikingMax
    ) {
      striking.push({
        id: opportunityId("striking_distance", row.label),
        type: "striking_distance",
        query: row.label,
        page: null,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        previous_clicks: null,
        clicks_at_stake: Math.max(0, Math.round(row.impressions * (TOP3_CTR - row.ctr))),
        why: `"${row.label}" sits at position ${pos(row.position)} with ${row.impressions} impressions. Strengthen the ranking page (content depth, internal links) to reach the top 3.`,
      });
    }
  }
  const top = (list: Opportunity[]) =>
    list.sort((a, b) => b.clicks_at_stake - a.clicks_at_stake || b.impressions - a.impressions).slice(0, OPPORTUNITY_LIMIT);
  return [...top(lowCtr), ...top(striking)];
}

/** Pure: queries or pages that lost clicks vs the previous period. */
export function dropOpportunities(kind: "query" | "page", rows: DropRow[], days: number): Opportunity[] {
  const limits = scaledThresholds(days);
  const type: OpportunityType = kind === "query" ? "query_drop" : "page_drop";
  const out: Opportunity[] = [];
  for (const row of rows) {
    const lost = row.previous_clicks - row.clicks;
    if (row.previous_clicks < limits.dropPreviousClicks) continue;
    if (lost < THRESHOLDS_28D.dropMinClicks || lost / row.previous_clicks < THRESHOLDS_28D.dropRatio) continue;
    const share = Math.round((lost / row.previous_clicks) * 100);
    out.push({
      id: opportunityId(type, row.label),
      type,
      query: kind === "query" ? row.label : null,
      page: kind === "page" ? row.label : null,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      previous_clicks: row.previous_clicks,
      clicks_at_stake: lost,
      why:
        kind === "query"
          ? `"${row.label}" fell from ${row.previous_clicks} to ${row.clicks} clicks (-${share}%) vs the previous period. Check rankings, the SERP, and the page that ranks.`
          : `${row.label} fell from ${row.previous_clicks} to ${row.clicks} clicks (-${share}%) vs the previous period. Check indexing, recent changes, and its top queries.`,
    });
  }
  return out.sort((a, b) => b.clicks_at_stake - a.clicks_at_stake).slice(0, OPPORTUNITY_LIMIT);
}

/** Pure: the whole property lost clicks. */
export function siteDrop(siteUrl: string, totals: Totals, previous: Totals | null, days: number): Opportunity | null {
  if (!previous) return null;
  const limits = scaledThresholds(days);
  const lost = previous.clicks - totals.clicks;
  if (previous.clicks < limits.siteDropPreviousClicks || lost <= 0 || lost / previous.clicks < THRESHOLDS_28D.siteDropRatio) return null;
  return {
    id: opportunityId("site_drop", siteUrl),
    type: "site_drop",
    query: null,
    page: null,
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.ctr,
    position: totals.position,
    previous_clicks: previous.clicks,
    clicks_at_stake: lost,
    why: `Site clicks fell from ${previous.clicks} to ${totals.clicks} (-${Math.round((lost / previous.clicks) * 100)}%) vs the previous period. Look at the pages and queries that dropped first.`,
  };
}

type Scope = { organizationId: string; propertyId: string };

async function currentRows(sql: Sql, scope: Scope, window: SearchWindow, minImpressions: number): Promise<Row[]> {
  const rows = await sql.all<{ label: string; clicks: number; impressions: number; pos_sum: number }>(
    `SELECT d.text AS label, t.clicks, t.impressions, t.pos_sum
     FROM (
       SELECT query_id AS id, SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(pos_sum) AS pos_sum
       FROM search_daily_query
       WHERE organization_id = ? AND property_id = ? AND day BETWEEN ? AND ?
       GROUP BY query_id
       HAVING SUM(impressions) >= ?
       ORDER BY impressions DESC
       LIMIT ${CANDIDATES}
     ) AS t
     JOIN search_queries AS d ON d.id = t.id AND d.property_id = ?`,
    [scope.organizationId, scope.propertyId, window.current.start, window.current.end, minImpressions, scope.propertyId],
  );
  return rows.map((row) => ({ label: row.label, ...totalsFromSums(row) }));
}

async function dropRows(sql: Sql, kind: "query" | "page", scope: Scope, window: SearchWindow, minPrevious: number): Promise<DropRow[]> {
  if (!window.previous) return [];
  const fact = kind === "query" ? "search_daily_query" : "search_daily_page";
  const idColumn = kind === "query" ? "query_id" : "page_id";
  const dim = kind === "query" ? "search_queries" : "search_pages";
  const labelColumn = kind === "query" ? "text" : "url";
  const { current, previous } = window;
  const rows = await sql.all<{ label: string; clicks: number | null; impressions: number | null; pos_sum: number | null; previous_clicks: number }>(
    `SELECT d.${labelColumn} AS label, t.clicks, t.impressions, t.pos_sum, t.previous_clicks
     FROM (
       SELECT ${idColumn} AS id,
              SUM(CASE WHEN day >= ? THEN clicks ELSE 0 END) AS clicks,
              SUM(CASE WHEN day >= ? THEN impressions ELSE 0 END) AS impressions,
              SUM(CASE WHEN day >= ? THEN pos_sum ELSE 0 END) AS pos_sum,
              SUM(CASE WHEN day <= ? THEN clicks ELSE 0 END) AS previous_clicks
       FROM ${fact}
       WHERE organization_id = ? AND property_id = ? AND day BETWEEN ? AND ?
       GROUP BY ${idColumn}
       HAVING previous_clicks >= ?
       ORDER BY previous_clicks - clicks DESC
       LIMIT ${DROP_CANDIDATES}
     ) AS t
     JOIN ${dim} AS d ON d.id = t.id AND d.property_id = ?`,
    [
      current.start, current.start, current.start, previous.end,
      scope.organizationId, scope.propertyId, previous.start, current.end,
      minPrevious, scope.propertyId,
    ],
  );
  return rows.map((row) => {
    const totals = totalsFromSums(row);
    return { label: row.label, clicks: totals.clicks, impressions: totals.impressions, ctr: totals.ctr, position: totals.position, previous_clicks: Number(row.previous_clicks ?? 0) };
  });
}

/**
 * Every opportunity for one property in one window, biggest first within each kind. Throws on a broken read; callers
 * (loadAgentSearch) turn that into an error state.
 */
export async function loadOpportunities(
  sql: Sql,
  input: Scope & { siteUrl: string; window: SearchWindow; totals: Totals; previous: Totals | null },
): Promise<Opportunity[]> {
  const days = input.window.current.days;
  const limits = scaledThresholds(days);
  const scope = { organizationId: input.organizationId, propertyId: input.propertyId };
  const [rows, queryDrops, pageDrops] = await Promise.all([
    currentRows(sql, scope, input.window, Math.min(limits.lowCtrImpressions, limits.strikingImpressions)),
    dropRows(sql, "query", scope, input.window, limits.dropPreviousClicks),
    dropRows(sql, "page", scope, input.window, limits.dropPreviousClicks),
  ]);
  const site = siteDrop(input.siteUrl, input.totals, input.previous, days);
  return [
    ...(site ? [site] : []),
    ...currentOpportunities(rows, days),
    ...dropOpportunities("query", queryDrops, days),
    ...dropOpportunities("page", pageDrops, days),
  ];
}

/** The few biggest across kinds (for the sync event and the client context). */
export function topOpportunities(list: Opportunity[], count: number): Opportunity[] {
  return [...list].sort((a, b) => b.clicks_at_stake - a.clicks_at_stake).slice(0, count);
}
