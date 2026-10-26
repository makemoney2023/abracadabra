import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrateSearch } from "@/db/migrate-search";
import { sqliteSql } from "@/db/sql";
import { createGlobalThrottle, GLOBAL_CALLS_PER_MINUTE } from "./throttle";

async function searchDb() {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrateSearch(sql);
  return sql;
}

describe("global Google API throttle", () => {
  it("is 300 calls a minute across every property", () => {
    expect(GLOBAL_CALLS_PER_MINUTE).toBe(300);
  });

  it("counts calls per UTC minute in the search database, shared by every throttle on that database", async () => {
    const sql = await searchDb();
    let now = 60_000 * 1000 + 5_000;
    const sleeps: number[] = [];
    const options = { sql, limit: 3, now: () => now, sleep: async (ms: number) => { sleeps.push(ms); now += ms; } };
    const one = createGlobalThrottle(options);
    const two = createGlobalThrottle(options);
    await one.acquire();
    await two.acquire();
    await one.acquire();
    expect(sleeps).toEqual([]);
    // The fourth call this minute waits for the next minute instead of calling Google.
    await two.acquire();
    expect(sleeps).toEqual([55_000]);
    expect(await sql.get<{ calls: number }>("SELECT calls FROM search_api_minute WHERE minute = 1001")).toEqual({ calls: 1 });
  });

  it("gives up with rate_limited (so the queue retries later) instead of waiting longer than maxWaitMs", async () => {
    const sql = await searchDb();
    const now = 60_000 * 2000 + 1_000;
    const throttle = createGlobalThrottle({ sql, limit: 1, now: () => now, sleep: async () => {}, maxWaitMs: 10_000 });
    await throttle.acquire();
    await expect(throttle.acquire()).rejects.toMatchObject({ kind: "rate_limited", code: "hq_throttle", retryAfterMs: 59_000 });
  });

  it("drops counters older than an hour when a new minute starts", async () => {
    const sql = await searchDb();
    await sql.run("INSERT INTO search_api_minute (minute, calls) VALUES (1, 5), (2950, 5)");
    const throttle = createGlobalThrottle({ sql, now: () => 60_000 * 3000, sleep: async () => {} });
    await throttle.acquire();
    const minutes = await sql.all<{ minute: number }>("SELECT minute FROM search_api_minute ORDER BY minute");
    expect(minutes.map((row) => row.minute)).toEqual([2950, 3000]);
  });
});
