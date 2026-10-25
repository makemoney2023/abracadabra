import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrateSearch } from "@/db/migrate-search";
import { sqliteSql, type Sql } from "@/db/sql";
import type { UrlInspection } from "./gsc";
import { pickInspectionCandidates, recordInspection } from "./inspection";

const NOW = Date.UTC(2026, 9, 24, 9);
const DAY = 86_400_000;

async function searchDb() {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrateSearch(sql);
  return sql;
}

async function page(sql: Sql, id: number, options: { inSitemap?: boolean; changedAt?: number | null; inspectedAt?: number | null } = {}) {
  await sql.run("INSERT INTO search_pages (id, property_id, url, in_sitemap, sitemap_changed_at) VALUES (?, 'prop-a', ?, ?, ?)", [
    id, `https://a.com/${id}`, options.inSitemap ? 1 : 0, options.changedAt ?? null,
  ]);
  if (options.inspectedAt != null) {
    await sql.run("INSERT INTO search_url_state (property_id, page_id, organization_id, coverage_state, inspected_at) VALUES ('prop-a', ?, 'org-a', 'Submitted and indexed', ?)", [id, options.inspectedAt]);
  }
}

async function impressions(sql: Sql, id: number, day: string, value: number, clicks = 0) {
  await sql.run("INSERT INTO search_daily_page (organization_id, property_id, day, page_id, clicks, impressions, pos_sum) VALUES ('org-a', 'prop-a', ?, ?, ?, ?, 0)", [day, id, clicks, value]);
}

const result = (coverageState: string): UrlInspection => ({
  verdict: "PASS", coverageState, indexingState: "INDEXING_ALLOWED", robotsTxtState: "ALLOWED", pageFetchState: "SUCCESSFUL",
  lastCrawlTime: "2026-10-20T00:00:00Z", googleCanonical: "https://a.com/1", userCanonical: "https://a.com/1", sitemaps: [],
});

describe("URL Inspection priority", () => {
  it("checks new or changed sitemap URLs first, then impression drops, then top pages, then round-robin", async () => {
    const sql = await searchDb();
    await page(sql, 1, { inSitemap: true, changedAt: NOW - DAY }); // new in sitemap, never inspected
    await page(sql, 2, { inSitemap: true, changedAt: NOW - DAY, inspectedAt: NOW - 2 * DAY }); // lastmod changed after the check
    await page(sql, 3, { inSitemap: true, changedAt: NOW - 5 * DAY, inspectedAt: NOW - 4 * DAY }); // unchanged, checked recently
    await page(sql, 4, { inspectedAt: NOW - 10 * DAY }); // impressions fell
    await impressions(sql, 4, "2026-10-12", 100);
    await impressions(sql, 4, "2026-10-20", 10);
    await page(sql, 5, { inspectedAt: NOW - 8 * DAY }); // top page by clicks
    await impressions(sql, 5, "2026-10-20", 100, 40);
    await page(sql, 6, { inSitemap: true, inspectedAt: NOW - 30 * DAY }); // round-robin, stale
    await page(sql, 7, { inSitemap: true, inspectedAt: NOW - 20 * DAY });
    const picked = await pickInspectionCandidates({ sql, propertyId: "prop-a", now: NOW, limit: 10 });
    expect(picked.map((item) => [item.pageId, item.reason])).toEqual([
      [1, "sitemap_changed"],
      [2, "sitemap_changed"],
      [4, "impressions_drop"],
      [5, "top_page"],
      [6, "round_robin"],
      [7, "round_robin"],
    ]);
  });

  it("stops at the budget and returns nothing with no budget", async () => {
    const sql = await searchDb();
    for (let id = 1; id <= 5; id += 1) await page(sql, id, { inSitemap: true, changedAt: NOW - id });
    expect(await pickInspectionCandidates({ sql, propertyId: "prop-a", now: NOW, limit: 2 })).toHaveLength(2);
    expect(await pickInspectionCandidates({ sql, propertyId: "prop-a", now: NOW, limit: 0 })).toEqual([]);
    expect(await pickInspectionCandidates({ sql, propertyId: "prop-b", now: NOW, limit: 5 })).toEqual([]);
  });

  it("records the latest state and an event only when coverage changes", async () => {
    const sql = await searchDb();
    await page(sql, 1, { inSitemap: true });
    const base = { sql, organizationId: "org-a", propertyId: "prop-a", pageId: 1 };
    expect(await recordInspection({ ...base, result: result("Discovered - currently not indexed"), now: NOW })).toEqual({ changed: true });
    expect(await recordInspection({ ...base, result: result("Discovered - currently not indexed"), now: NOW + 1 })).toEqual({ changed: false });
    expect(await recordInspection({ ...base, result: result("Submitted and indexed"), now: NOW + 2 })).toEqual({ changed: true });
    expect(await sql.all("SELECT from_state, to_state FROM search_url_events ORDER BY id")).toEqual([
      { from_state: null, to_state: "Discovered - currently not indexed" },
      { from_state: "Discovered - currently not indexed", to_state: "Submitted and indexed" },
    ]);
    expect(await sql.get("SELECT coverage_state, inspected_at FROM search_url_state")).toEqual({ coverage_state: "Submitted and indexed", inspected_at: NOW + 2 });
  });
});
