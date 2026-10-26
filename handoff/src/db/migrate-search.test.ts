import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrateSearch, SEARCH_STEPS } from "./migrate-search";
import { SEARCH_MIGRATION_SQL } from "./search-migration-sql";
import { sqliteSql } from "./sql";

const TABLES = [
  "search_api_minute",
  "search_daily_page",
  "search_daily_query",
  "search_daily_query_page",
  "search_daily_segment",
  "search_daily_site",
  "search_monthly_page",
  "search_monthly_query",
  "search_monthly_site",
  "search_pages",
  "search_queries",
  "search_rollups",
  "search_sitemaps",
  "search_url_events",
  "search_url_state",
];

describe("migrateSearch (handoff-search database)", () => {
  it("ships every file in migrations-search exactly as it is on disk, with a step for each", () => {
    const files = readdirSync(path.join(process.cwd(), "migrations-search")).filter((file) => file.endsWith(".sql")).sort();
    expect(files).toEqual(["s0001_facts.sql"]);
    for (const file of files) {
      expect(SEARCH_MIGRATION_SQL[file]).toBe(readFileSync(path.join(process.cwd(), "migrations-search", file), "utf8"));
    }
    expect(SEARCH_STEPS.map((step) => step.file)).toEqual(files);
  });

  it("creates the fact tables on an empty database and a second run changes nothing", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = sqliteSql(db);
    await migrateSearch(sql);
    const tables = await sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'search_%' ORDER BY name");
    expect(tables.map((row) => row.name)).toEqual(TABLES);
    await sql.run("INSERT INTO search_queries (property_id, text) VALUES ('p1', 'shoes')");
    await migrateSearch(sql);
    expect(await sql.get<{ n: number }>("SELECT count(*) AS n FROM search_queries")).toEqual({ n: 1 });
  });

  it("finishes a step that stopped halfway", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = sqliteSql(db);
    db.exec("CREATE TABLE search_queries (id INTEGER PRIMARY KEY, property_id TEXT NOT NULL, text TEXT NOT NULL, UNIQUE (property_id, text))");
    await migrateSearch(sql);
    const tables = await sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'search_%'");
    expect(tables).toHaveLength(TABLES.length);
  });

  it("never touches handoff tables: the search migrations name only search_ tables", () => {
    for (const sqlText of Object.values(SEARCH_MIGRATION_SQL)) {
      const names = [...sqlText.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+(\w+)/gi)].map((match) => match[1]);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(name).toMatch(/^search_/);
      expect(sqlText).not.toMatch(/\b(DROP|ALTER|DELETE)\b/i);
    }
  });
});
