import type { Sql } from "@/db/sql";
import type { UrlInspection } from "./gsc";
import { addDays, utcDay } from "./sync-jobs";

/**
 * Which URLs to spend the daily URL Inspection budget on (spec 4.6), in order:
 * 1. new in the sitemap, or its <lastmod> changed since the last check;
 * 2. impressions fell more than 50% week over week (or to zero) and not checked in 3 days;
 * 0. URLs an agent asked to re-check (POST /api/agent-search/inspect, at most 20 a day per property) and not checked
 *    since the ask;
 * 3. (PR 5) pages a finding or card asks to re-check;
 * 4. top 50 pages by clicks over 28 days, weekly;
 * 5. round-robin over other sitemap URLs not checked in 14 days, oldest check first.
 */

export type InspectionReason = "requested" | "sitemap_changed" | "impressions_drop" | "top_page" | "round_robin";
export type InspectionCandidate = { pageId: number; url: string; reason: InspectionReason };

const DAY = 86_400_000;
export const TOP_PAGES = 50;

export async function pickInspectionCandidates(input: {
  sql: Sql;
  propertyId: string;
  now: number;
  limit: number;
  /** Agent re-check asks: the URL and when it was asked. Checked first when not inspected since. */
  requested?: { url: string; at: number }[];
}): Promise<InspectionCandidate[]> {
  const { sql, propertyId, now } = input;
  const out = new Map<number, InspectionCandidate>();
  const room = () => input.limit - out.size;
  const add = (rows: { id: number; url: string }[], reason: InspectionReason) => {
    for (const row of rows) {
      if (room() <= 0) return;
      if (!out.has(row.id)) out.set(row.id, { pageId: row.id, url: row.url, reason });
    }
  };
  if (room() <= 0) return [];
  const stateJoin = "LEFT JOIN search_url_state s ON s.property_id = p.property_id AND s.page_id = p.id";

  const asked = new Map<string, number>();
  for (const row of (input.requested ?? []).slice(0, 100)) asked.set(row.url, Math.max(asked.get(row.url) ?? 0, row.at));
  if (asked.size > 0) {
    const urls = [...asked.keys()];
    const rows = await sql.all<{ id: number; url: string; inspected_at: number | null }>(
      `SELECT p.id, p.url, s.inspected_at FROM search_pages p ${stateJoin}
       WHERE p.property_id = ? AND p.url IN (${urls.map(() => "?").join(", ")})
       ORDER BY p.id`,
      [propertyId, ...urls],
    );
    add(rows.filter((row) => row.inspected_at === null || row.inspected_at < (asked.get(row.url) ?? 0)), "requested");
    if (room() <= 0) return [...out.values()];
  }

  add(
    await sql.all<{ id: number; url: string }>(
      `SELECT p.id, p.url FROM search_pages p ${stateJoin}
       WHERE p.property_id = ? AND p.in_sitemap = 1
         AND (s.page_id IS NULL OR (p.sitemap_changed_at IS NOT NULL AND p.sitemap_changed_at > s.inspected_at))
       ORDER BY p.sitemap_changed_at DESC, p.id LIMIT ?`,
      [propertyId, room()],
    ),
    "sitemap_changed",
  );
  if (room() <= 0) return [...out.values()];

  const today = utcDay(now);
  const recentFrom = addDays(today, -7);
  const priorFrom = addDays(today, -14);
  add(
    await sql.all<{ id: number; url: string }>(
      `SELECT p.id, p.url FROM (
         SELECT page_id,
                sum(CASE WHEN day >= ? THEN impressions ELSE 0 END) AS recent,
                sum(CASE WHEN day < ? THEN impressions ELSE 0 END) AS prior
         FROM search_daily_page WHERE property_id = ? AND day >= ? AND day < ? GROUP BY page_id
       ) w
       JOIN search_pages p ON p.id = w.page_id AND p.property_id = ?
       ${stateJoin}
       WHERE w.prior >= 10 AND w.recent * 2 < w.prior AND (s.page_id IS NULL OR s.inspected_at < ?)
       ORDER BY w.prior - w.recent DESC, p.id LIMIT ?`,
      [recentFrom, recentFrom, propertyId, priorFrom, today, propertyId, now - 3 * DAY, room()],
    ),
    "impressions_drop",
  );
  if (room() <= 0) return [...out.values()];

  add(
    await sql.all<{ id: number; url: string }>(
      `SELECT p.id, p.url FROM (
         SELECT page_id, sum(clicks) AS clicks FROM search_daily_page
         WHERE property_id = ? AND day >= ? GROUP BY page_id HAVING sum(clicks) > 0 ORDER BY clicks DESC, page_id LIMIT ${TOP_PAGES}
       ) t
       JOIN search_pages p ON p.id = t.page_id AND p.property_id = ?
       ${stateJoin}
       WHERE s.page_id IS NULL OR s.inspected_at < ?
       ORDER BY t.clicks DESC, p.id LIMIT ?`,
      [propertyId, addDays(today, -28), propertyId, now - 7 * DAY, room()],
    ),
    "top_page",
  );
  if (room() <= 0) return [...out.values()];

  add(
    await sql.all<{ id: number; url: string }>(
      `SELECT p.id, p.url FROM search_pages p ${stateJoin}
       WHERE p.property_id = ? AND p.in_sitemap = 1 AND (s.page_id IS NULL OR s.inspected_at < ?)
       ORDER BY coalesce(s.inspected_at, 0), p.id LIMIT ?`,
      [propertyId, now - 14 * DAY, room() + out.size],
    ),
    "round_robin",
  );
  return [...out.values()];
}

/** Latest state per page, plus an event row when the coverage state changes (or on the first check). */
export async function recordInspection(input: {
  sql: Sql;
  organizationId: string;
  propertyId: string;
  pageId: number;
  result: UrlInspection;
  now: number;
}): Promise<{ changed: boolean }> {
  const { sql, organizationId, propertyId, pageId, result, now } = input;
  const previous = await sql.get<{ coverage_state: string | null; verdict: string | null }>(
    "SELECT coverage_state, verdict FROM search_url_state WHERE property_id = ? AND page_id = ?",
    [propertyId, pageId],
  );
  const state = result.coverageState ?? result.verdict ?? "unknown";
  const before = previous ? previous.coverage_state ?? previous.verdict ?? "unknown" : null;
  const changed = before !== state;
  await sql.batch([
    {
      statement: `INSERT INTO search_url_state (property_id, page_id, organization_id, verdict, coverage_state, indexing_state, robots_state,
                    fetch_state, google_canonical, user_canonical, last_crawl_at, inspected_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT (property_id, page_id) DO UPDATE SET organization_id = excluded.organization_id, verdict = excluded.verdict,
                    coverage_state = excluded.coverage_state, indexing_state = excluded.indexing_state, robots_state = excluded.robots_state,
                    fetch_state = excluded.fetch_state, google_canonical = excluded.google_canonical, user_canonical = excluded.user_canonical,
                    last_crawl_at = excluded.last_crawl_at, inspected_at = excluded.inspected_at`,
      params: [
        propertyId, pageId, organizationId, result.verdict, result.coverageState, result.indexingState, result.robotsTxtState,
        result.pageFetchState, result.googleCanonical, result.userCanonical, result.lastCrawlTime, now,
      ],
    },
    ...(changed
      ? [{
          statement: "INSERT INTO search_url_events (property_id, page_id, organization_id, from_state, to_state, at) VALUES (?, ?, ?, ?, ?, ?)",
          params: [propertyId, pageId, organizationId, before, state, now],
        }]
      : []),
  ]);
  return { changed };
}
