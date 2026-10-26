import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrateSearch } from "@/db/migrate-search";
import { sqliteSql, type Sql } from "@/db/sql";
import {
  compareTotals,
  fillSeries,
  loadSearchReport,
  searchRangeId,
  searchSort,
  searchWindow,
  totalsFromSums,
  TOP_ROWS,
} from "./report";

const NOW = Date.parse("2026-10-25T12:00:00Z");

async function searchDb(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrateSearch(sql);
  return sql;
}

async function site(sql: Sql, org: string, prop: string, day: string, clicks: number, impressions: number, position: number) {
  await sql.run(
    "INSERT INTO search_daily_site (organization_id, property_id, day, search_type, clicks, impressions, pos_sum, is_final) VALUES (?, ?, ?, 'web', ?, ?, ?, 1)",
    [org, prop, day, clicks, impressions, position * impressions],
  );
}

async function query(
  sql: Sql,
  org: string,
  prop: string,
  day: string,
  text: string,
  clicks: number,
  impressions: number,
  position: number,
) {
  await sql.run("INSERT OR IGNORE INTO search_queries (property_id, text) VALUES (?, ?)", [prop, text]);
  await sql.run(
    `INSERT INTO search_daily_query (organization_id, property_id, day, query_id, clicks, impressions, pos_sum)
     VALUES (?, ?, ?, (SELECT id FROM search_queries WHERE property_id = ? AND text = ?), ?, ?, ?)`,
    [org, prop, day, prop, text, clicks, impressions, position * impressions],
  );
}

async function page(
  sql: Sql,
  org: string,
  prop: string,
  day: string,
  url: string,
  clicks: number,
  impressions: number,
  position: number,
) {
  await sql.run("INSERT OR IGNORE INTO search_pages (property_id, url) VALUES (?, ?)", [prop, url]);
  await sql.run(
    `INSERT INTO search_daily_page (organization_id, property_id, day, page_id, clicks, impressions, pos_sum)
     VALUES (?, ?, ?, (SELECT id FROM search_pages WHERE property_id = ? AND url = ?), ?, ?, ?)`,
    [org, prop, day, prop, url, clicks, impressions, position * impressions],
  );
}

describe("search ranges", () => {
  it("defaults to 28 days and clicks", () => {
    expect(searchRangeId(undefined)).toBe("28d");
    expect(searchRangeId("1y")).toBe("28d");
    expect(searchRangeId("7d")).toBe("7d");
    expect(searchSort("drop table")).toBe("clicks");
    expect(searchSort("position")).toBe("position");
  });

  it("compares a period with the same number of days right before it", () => {
    expect(searchWindow("7d", "2026-10-22")).toEqual({
      current: { start: "2026-10-16", end: "2026-10-22", days: 7 },
      previous: { start: "2026-10-09", end: "2026-10-15", days: 7 },
    });
    expect(searchWindow("28d", "2026-10-22").previous).toEqual({ start: "2026-08-28", end: "2026-09-24", days: 28 });
    expect(searchWindow("90d", "2026-10-22").current.days).toBe(90);
  });

  it("gives 16 months with no previous period, and never more than 500 days", () => {
    const window = searchWindow("16m", "2026-10-22");
    expect(window.current).toEqual({ start: "2025-06-23", end: "2026-10-22", days: 487 });
    expect(window.previous).toBeNull();
  });
});

describe("search math", () => {
  it("computes CTR and position from sums, not averages of averages", () => {
    // Day 1: 10 clicks / 100 impressions at position 2. Day 2: 0 clicks / 900 impressions at position 10.
    const totals = totalsFromSums({ clicks: 10, impressions: 1000, pos_sum: 2 * 100 + 10 * 900 });
    expect(totals.ctr).toBeCloseTo(0.01);
    expect(totals.position).toBeCloseTo(9.2);
  });

  it("leaves CTR and position empty when there were no impressions", () => {
    expect(totalsFromSums({ clicks: null, impressions: null, pos_sum: null })).toEqual({
      clicks: 0,
      impressions: 0,
      ctr: null,
      position: null,
    });
  });

  it("treats a lower position as better and compares clicks as a ratio", () => {
    const now = { clicks: 150, impressions: 1000, ctr: 0.15, position: 4 };
    const before = { clicks: 100, impressions: 1000, ctr: 0.1, position: 6 };
    const change = compareTotals(now, before);
    expect(change.clicks).toEqual({ delta: 0.5, better: true });
    expect(change.impressions).toEqual({ delta: 0, better: null });
    expect(change.ctr.delta).toBeCloseTo(0.05);
    expect(change.ctr.better).toBe(true);
    expect(change.position).toEqual({ delta: -2, better: true });
    expect(compareTotals(now, null).clicks).toEqual({ delta: null, better: null });
    expect(compareTotals(now, { ...before, clicks: 0 }).clicks.delta).toBeNull();
  });

  it("fills missing days with zeros", () => {
    expect(
      fillSeries([{ day: "2026-10-02", clicks: 3, impressions: 9 }], { start: "2026-10-01", end: "2026-10-03", days: 3 }),
    ).toEqual([
      { day: "2026-10-01", clicks: 0, impressions: 0 },
      { day: "2026-10-02", clicks: 3, impressions: 9 },
      { day: "2026-10-03", clicks: 0, impressions: 0 },
    ]);
  });
});

describe("loadSearchReport", () => {
  const input = { organizationId: "org-a", propertyId: "prop-a", range: "7d" as const, now: NOW };

  it("is unavailable, not a crash, when SEARCH_DB is not bound", async () => {
    expect(await loadSearchReport(null, input)).toEqual({ state: "unavailable", reason: "no_db" });
  });

  it("is unavailable when s0001 has not been applied yet", async () => {
    const empty = sqliteSql(new DatabaseSync(":memory:"));
    expect(await loadSearchReport(empty, input)).toEqual({ state: "unavailable", reason: "not_ready" });
  });

  it("is empty when the property has no rows yet", async () => {
    const sql = await searchDb();
    const report = await loadSearchReport(sql, input);
    expect(report.state).toBe("empty");
  });

  it("anchors on the newest stored day and compares with the period before", async () => {
    const sql = await searchDb();
    for (let day = 9; day <= 22; day++) {
      const iso = `2026-10-${String(day).padStart(2, "0")}`;
      await site(sql, "org-a", "prop-a", iso, day >= 16 ? 20 : 10, 100, day >= 16 ? 3 : 5);
    }
    const report = await loadSearchReport(sql, input);
    if (report.state !== "ok") throw new Error(report.state);
    expect(report.window.current).toEqual({ start: "2026-10-16", end: "2026-10-22", days: 7 });
    expect(report.totals).toMatchObject({ clicks: 140, impressions: 700 });
    expect(report.totals.ctr).toBeCloseTo(0.2);
    expect(report.totals.position).toBeCloseTo(3);
    expect(report.previous).toMatchObject({ clicks: 70, impressions: 700 });
    expect(report.change.clicks).toEqual({ delta: 1, better: true });
    expect(report.change.position).toEqual({ delta: -2, better: true });
    expect(report.series).toHaveLength(7);
  });

  it("only reads the asked organization's rows", async () => {
    const sql = await searchDb();
    await site(sql, "org-a", "prop-a", "2026-10-20", 5, 50, 2);
    await site(sql, "org-b", "prop-b", "2026-10-20", 999, 9999, 1);
    await query(sql, "org-b", "prop-b", "2026-10-20", "secret competitor term", 999, 9999, 1);
    await query(sql, "org-a", "prop-a", "2026-10-20", "abracadabra", 5, 50, 2);
    const mine = await loadSearchReport(sql, input);
    if (mine.state !== "ok") throw new Error(mine.state);
    expect(mine.totals.clicks).toBe(5);
    expect(mine.queries.map((row) => row.label)).toEqual(["abracadabra"]);
    // Wrong organization for a real property id: nothing.
    const crossed = await loadSearchReport(sql, { ...input, organizationId: "org-a", propertyId: "prop-b" });
    expect(crossed.state).toBe("empty");
  });

  it("returns the top 25 queries and pages, sorted by the chosen measure", async () => {
    const sql = await searchDb();
    await site(sql, "org-a", "prop-a", "2026-10-20", 100, 10000, 5);
    for (let n = 1; n <= 30; n++) {
      await query(sql, "org-a", "prop-a", "2026-10-20", `term ${n}`, n, 100 * (31 - n), n);
      await page(sql, "org-a", "prop-a", "2026-10-20", `https://example.com/${n}`, n, 100, 31 - n);
    }
    const byClicks = await loadSearchReport(sql, input);
    if (byClicks.state !== "ok") throw new Error(byClicks.state);
    expect(byClicks.queries).toHaveLength(TOP_ROWS);
    expect(byClicks.queries[0]).toMatchObject({ label: "term 30", clicks: 30, impressions: 100 });
    expect(byClicks.pages[0].label).toBe("https://example.com/30");

    const byImpressions = await loadSearchReport(sql, { ...input, sort: "impressions" });
    if (byImpressions.state !== "ok") throw new Error(byImpressions.state);
    expect(byImpressions.queries[0].label).toBe("term 1");

    const byPosition = await loadSearchReport(sql, { ...input, sort: "position" });
    if (byPosition.state !== "ok") throw new Error(byPosition.state);
    expect(byPosition.queries[0]).toMatchObject({ label: "term 1", position: 1 });
    expect(byPosition.pages[0]).toMatchObject({ label: "https://example.com/30", position: 1 });

    const byCtr = await loadSearchReport(sql, { ...input, sort: "ctr" });
    if (byCtr.state !== "ok") throw new Error(byCtr.state);
    expect(byCtr.queries[0].label).toBe("term 30");
  });

  it("ignores days after yesterday", async () => {
    const sql = await searchDb();
    await site(sql, "org-a", "prop-a", "2026-10-24", 1, 10, 1);
    await site(sql, "org-a", "prop-a", "2026-10-26", 50, 500, 1);
    const report = await loadSearchReport(sql, input);
    if (report.state !== "ok") throw new Error(report.state);
    expect(report.window.current.end).toBe("2026-10-24");
    expect(report.totals.clicks).toBe(1);
  });
});
