import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrateSearch } from "@/db/migrate-search";
import { sqliteSql, type Sql } from "@/db/sql";
import { MONTHLY_TOP_N, runSearchRetention } from "./retention";

const NOW = Date.UTC(2026, 9, 24, 9);

async function searchDb() {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrateSearch(sql);
  return sql;
}

async function dailyPage(sql: Sql, property: string, day: string, pageId: number, clicks: number, impressions = clicks * 10) {
  await sql.run(
    "INSERT INTO search_daily_page (organization_id, property_id, day, page_id, clicks, impressions, pos_sum) VALUES ('org-a', ?, ?, ?, ?, ?, ?)",
    [property, day, pageId, clicks, impressions, impressions * 3],
  );
}

describe("search retention", () => {
  it("rolls whole months older than 16 months into monthly tables, then deletes their daily rows", async () => {
    const sql = await searchDb();
    // 16 months before 2026-10-24 is 2025-06-24: May 2025 is wholly older, June 2025 is not.
    await dailyPage(sql, "prop-a", "2025-05-30", 1, 2);
    await dailyPage(sql, "prop-a", "2025-05-31", 1, 3);
    await dailyPage(sql, "prop-a", "2025-06-01", 1, 4);
    await sql.run("INSERT INTO search_daily_site (organization_id, property_id, day, clicks, impressions, pos_sum, is_final) VALUES ('org-a', 'prop-a', '2025-05-30', 9, 90, 180, 1)");
    await sql.run("INSERT INTO search_daily_query (organization_id, property_id, day, query_id, clicks, impressions, pos_sum) VALUES ('org-a', 'prop-a', '2025-05-30', 7, 1, 10, 20)");
    await sql.run("INSERT INTO search_daily_segment (organization_id, property_id, day, country, device, clicks, impressions, pos_sum) VALUES ('org-a', 'prop-a', '2025-05-30', 'can', 'MOBILE', 1, 1, 1)");
    await sql.run("INSERT INTO search_daily_query_page (organization_id, property_id, day, query_id, page_id, clicks, impressions, pos_sum) VALUES ('org-a', 'prop-a', '2025-05-30', 7, 1, 1, 1, 1)");
    const result = await runSearchRetention({ sql, organizationId: "org-a", propertyId: "prop-a", now: NOW });
    expect(result.rolledMonths).toEqual(["2025-05"]);
    expect(await sql.all("SELECT month, page_id, clicks, impressions, pos_sum FROM search_monthly_page")).toEqual([
      { month: "2025-05", page_id: 1, clicks: 5, impressions: 50, pos_sum: 150 },
    ]);
    expect(await sql.all("SELECT month, clicks FROM search_monthly_site")).toEqual([{ month: "2025-05", clicks: 9 }]);
    expect(await sql.all("SELECT month, query_id, clicks FROM search_monthly_query")).toEqual([{ month: "2025-05", query_id: 7, clicks: 1 }]);
    expect(await sql.all("SELECT day FROM search_daily_page")).toEqual([{ day: "2025-06-01" }]);
    for (const table of ["search_daily_site", "search_daily_query", "search_daily_segment", "search_daily_query_page"]) {
      expect(await sql.get(`SELECT count(*) AS n FROM ${table}`)).toEqual({ n: 0 });
    }
  });

  it("keeps the top 1,000 pages a month by clicks", async () => {
    const sql = await searchDb();
    for (let id = 1; id <= MONTHLY_TOP_N + 5; id += 1) await dailyPage(sql, "prop-a", "2025-04-10", id, id);
    await runSearchRetention({ sql, organizationId: "org-a", propertyId: "prop-a", now: NOW });
    expect(await sql.get("SELECT count(*) AS n, min(clicks) AS low FROM search_monthly_page")).toEqual({ n: MONTHLY_TOP_N, low: 6 });
  });

  it("deletes in chunks, a run that stops halfway does not roll a month up twice, and the next run finishes", async () => {
    const sql = await searchDb();
    for (let id = 1; id <= 25; id += 1) await dailyPage(sql, "prop-a", "2025-03-15", id, 1);
    const first = await runSearchRetention({ sql, organizationId: "org-a", propertyId: "prop-a", now: NOW, chunkRows: 10, maxChunks: 2 });
    expect(first.deletedRows).toBe(20);
    expect(first.done).toBe(false);
    const second = await runSearchRetention({ sql, organizationId: "org-a", propertyId: "prop-a", now: NOW, chunkRows: 10, maxChunks: 2 });
    expect(second.rolledMonths).toEqual([]);
    expect(second.done).toBe(true);
    expect(await sql.get("SELECT sum(clicks) AS clicks, count(*) AS n FROM search_monthly_page")).toEqual({ clicks: 25, n: 25 });
    expect(await sql.get("SELECT count(*) AS n FROM search_daily_page")).toEqual({ n: 0 });
  });

  it("drops monthly roll-ups past 36 months and URL events past 24 months, and never touches another property", async () => {
    const sql = await searchDb();
    await sql.run("INSERT INTO search_monthly_page (organization_id, property_id, month, page_id, clicks, impressions, pos_sum) VALUES ('org-a', 'prop-a', '2023-09', 1, 1, 1, 1), ('org-a', 'prop-a', '2023-11', 1, 1, 1, 1), ('org-b', 'prop-b', '2023-09', 1, 1, 1, 1)");
    await sql.run("INSERT INTO search_url_events (property_id, page_id, organization_id, to_state, at) VALUES ('prop-a', 1, 'org-a', 'x', ?), ('prop-a', 1, 'org-a', 'y', ?)", [Date.UTC(2024, 8, 1), Date.UTC(2025, 0, 1)]);
    await dailyPage(sql, "prop-b", "2025-01-01", 1, 1);
    await runSearchRetention({ sql, organizationId: "org-a", propertyId: "prop-a", now: NOW });
    expect(await sql.all("SELECT property_id, month FROM search_monthly_page ORDER BY property_id, month")).toEqual([
      { property_id: "prop-a", month: "2023-11" },
      { property_id: "prop-b", month: "2023-09" },
    ]);
    expect(await sql.all("SELECT to_state FROM search_url_events")).toEqual([{ to_state: "y" }]);
    expect(await sql.get("SELECT count(*) AS n FROM search_daily_page WHERE property_id = 'prop-b'")).toEqual({ n: 1 });
  });
});
