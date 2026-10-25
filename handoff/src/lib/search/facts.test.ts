import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { migrateSearch } from "@/db/migrate-search";
import { sqliteSql, type Sql, type SqlStatement } from "@/db/sql";
import { exportRaw, FACT_CHUNK_ROWS, QUERY_PAGE_DAILY_CAP, rawExportKey, writeAnalyticsDay } from "./facts";
import type { SearchAnalyticsRow } from "./gsc";

async function searchDb() {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrateSearch(sql);
  return sql;
}

/** Records every statement so tests can check D1's limits (100 bound params per statement). */
function recording(sql: Sql) {
  const statements: SqlStatement[] = [];
  const batches: number[] = [];
  const wrapped: Sql = {
    ...sql,
    async run(statement, params) {
      statements.push({ statement, params });
      return sql.run(statement, params);
    },
    async batch(list) {
      batches.push(list.length);
      statements.push(...list);
      return sql.batch(list);
    },
  };
  return { sql: wrapped, statements, batches };
}

const row = (keys: string[], clicks: number, impressions: number, position: number): SearchAnalyticsRow => ({ keys, clicks, impressions, ctr: 0, position });
const base = { organizationId: "org-a", propertyId: "prop-a", day: "2026-10-20" };

describe("writeAnalyticsDay", () => {
  it("stores pages with an impression-weighted position sum", async () => {
    const sql = await searchDb();
    const written = await writeAnalyticsDay({
      sql, ...base, request: "page", isFinal: true,
      rows: [row(["2026-10-20", "https://a.com/"], 5, 100, 2.5), row(["2026-10-20", "https://a.com/b"], 0, 10, 8)],
    });
    expect(written).toBe(2);
    const facts = await sql.all("SELECT p.url, f.organization_id, f.clicks, f.impressions, f.pos_sum FROM search_daily_page f JOIN search_pages p ON p.id = f.page_id ORDER BY p.url");
    expect(facts).toEqual([
      { url: "https://a.com/", organization_id: "org-a", clicks: 5, impressions: 100, pos_sum: 250 },
      { url: "https://a.com/b", organization_id: "org-a", clicks: 0, impressions: 10, pos_sum: 80 },
    ]);
  });

  it("re-pulling a day is idempotent, replaces changed numbers and drops rows Google no longer reports", async () => {
    const sql = await searchDb();
    const first = [row(["2026-10-20", "shoes"], 1, 10, 3), row(["2026-10-20", "boots"], 2, 20, 4)];
    await writeAnalyticsDay({ sql, ...base, request: "query", isFinal: false, rows: first });
    await writeAnalyticsDay({ sql, ...base, request: "query", isFinal: false, rows: first });
    expect(await sql.get("SELECT count(*) AS n, sum(clicks) AS clicks FROM search_daily_query")).toEqual({ n: 2, clicks: 3 });
    await writeAnalyticsDay({ sql, ...base, request: "query", isFinal: true, rows: [row(["2026-10-20", "shoes"], 4, 40, 2)] });
    expect(await sql.all("SELECT q.text, f.clicks FROM search_daily_query f JOIN search_queries q ON q.id = f.query_id")).toEqual([{ text: "shoes", clicks: 4 }]);
    // The query id is stable across re-pulls.
    expect(await sql.get("SELECT count(*) AS n FROM search_queries")).toEqual({ n: 2 });
  });

  it("leaves other days and other properties alone", async () => {
    const sql = await searchDb();
    await writeAnalyticsDay({ sql, ...base, request: "page", isFinal: true, rows: [row(["2026-10-20", "https://a.com/"], 1, 1, 1)] });
    await writeAnalyticsDay({ sql, ...base, day: "2026-10-21", request: "page", isFinal: true, rows: [row(["2026-10-21", "https://a.com/"], 2, 2, 1)] });
    await writeAnalyticsDay({ sql, organizationId: "org-b", propertyId: "prop-b", day: "2026-10-20", request: "page", isFinal: true, rows: [row(["2026-10-20", "https://a.com/"], 3, 3, 1)] });
    await writeAnalyticsDay({ sql, ...base, request: "page", isFinal: true, rows: [] });
    const left = await sql.all("SELECT organization_id, property_id, day, clicks FROM search_daily_page ORDER BY property_id, day");
    expect(left).toEqual([
      { organization_id: "org-a", property_id: "prop-a", day: "2026-10-21", clicks: 2 },
      { organization_id: "org-b", property_id: "prop-b", day: "2026-10-20", clicks: 3 },
    ]);
    // The same URL under two properties gets two page ids.
    expect(await sql.get("SELECT count(*) AS n FROM search_pages WHERE url = 'https://a.com/'")).toEqual({ n: 2 });
  });

  it("stores site totals with is_final, and a zero row for a day with no data", async () => {
    const sql = await searchDb();
    await writeAnalyticsDay({ sql, ...base, request: "site", isFinal: false, rows: [row(["2026-10-20"], 7, 70, 3)] });
    await writeAnalyticsDay({ sql, ...base, request: "site", isFinal: true, rows: [row(["2026-10-20"], 8, 80, 3)] });
    await writeAnalyticsDay({ sql, ...base, day: "2026-10-21", request: "site", isFinal: false, rows: [] });
    expect(await sql.all("SELECT day, clicks, impressions, pos_sum, is_final FROM search_daily_site ORDER BY day")).toEqual([
      { day: "2026-10-20", clicks: 8, impressions: 80, pos_sum: 240, is_final: 1 },
      { day: "2026-10-21", clicks: 0, impressions: 0, pos_sum: 0, is_final: 0 },
    ]);
  });

  it("stores country x device segments", async () => {
    const sql = await searchDb();
    await writeAnalyticsDay({ sql, ...base, request: "segment", isFinal: true, rows: [row(["2026-10-20", "can", "MOBILE"], 3, 30, 2), row(["2026-10-20", "usa", "DESKTOP"], 1, 5, 1)] });
    expect(await sql.all("SELECT country, device, clicks FROM search_daily_segment ORDER BY country")).toEqual([
      { country: "can", device: "MOBILE", clicks: 3 },
      { country: "usa", device: "DESKTOP", clicks: 1 },
    ]);
  });

  it("keeps only the top 5,000 query x page rows per day by impressions", async () => {
    const sql = await searchDb();
    const rows = Array.from({ length: QUERY_PAGE_DAILY_CAP + 300 }, (_, index) => row(["2026-10-20", `q${index}`, `https://a.com/${index % 40}`], 0, index + 1, 5));
    const written = await writeAnalyticsDay({ sql, ...base, request: "query_page", isFinal: true, rows });
    expect(written).toBe(QUERY_PAGE_DAILY_CAP);
    expect(await sql.get("SELECT count(*) AS n, min(impressions) AS low FROM search_daily_query_page")).toEqual({ n: QUERY_PAGE_DAILY_CAP, low: 301 });
  });

  it("stays inside D1 limits: few bound params per statement, chunks of 500 rows, small batches", async () => {
    const { sql, statements, batches } = recording(await searchDb());
    const rows = Array.from({ length: 1_234 }, (_, index) => row(["2026-10-20", `https://a.com/p${index}`], 1, 2, 3));
    expect(await writeAnalyticsDay({ sql, ...base, request: "page", isFinal: true, rows })).toBe(1_234);
    for (const entry of statements) {
      expect(entry.params?.length ?? 0).toBeLessThan(100);
      for (const param of entry.params ?? []) {
        if (typeof param === "string" && param.startsWith("[")) expect((JSON.parse(param) as unknown[]).length).toBeLessThanOrEqual(FACT_CHUNK_ROWS);
      }
    }
    // 1 delete + 3 dimension chunks + 3 fact chunks.
    expect(statements).toHaveLength(7);
    for (const size of batches) expect(size).toBeLessThanOrEqual(10);
  });
});

describe("raw exports to R2", () => {
  it("writes gzipped JSON lines under search-raw/<org>/<property>/<day>", async () => {
    const puts: { key: string; body: Uint8Array | string }[] = [];
    const bucket = { put: async (key: string, body: Uint8Array | string) => { puts.push({ key, body }); } };
    const key = rawExportKey("org-a", "prop-a", "2026-10-20", "raw");
    expect(key).toBe("search-raw/org-a/prop-a/2026-10-20.jsonl.gz");
    expect(rawExportKey("org-a", "prop-a", "2026-10-20", "query_page")).toBe("search-raw/org-a/prop-a/2026-10-20.query-page.jsonl.gz");
    await exportRaw({ bucket, key, request: "raw", rows: [row(["2026-10-20", "shoes", "https://a.com/", "can", "MOBILE"], 1, 10, 2.5)] });
    const lines = gunzipSync(puts[0]!.body as Uint8Array).toString("utf8").split("\n");
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { date: "2026-10-20", query: "shoes", page: "https://a.com/", country: "can", device: "MOBILE", clicks: 1, impressions: 10, position: 2.5 },
    ]);
  });

  it("refuses ids that could escape the prefix", () => {
    expect(() => rawExportKey("../x", "p", "2026-10-20", "raw")).toThrow();
    expect(() => rawExportKey("o", "p/q", "2026-10-20", "raw")).toThrow();
    expect(() => rawExportKey("o", "p", "20261020", "raw")).toThrow();
  });
});
