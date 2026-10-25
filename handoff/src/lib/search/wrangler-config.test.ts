import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEARCH_SYNC_CRON, SEARCH_SYNC_QUEUE } from "./sync";

type Config = {
  d1_databases: { binding: string; database_name: string; database_id: string; migrations_dir?: string }[];
  queues: {
    producers: { binding: string; queue: string }[];
    consumers?: { queue: string; max_batch_size?: number; max_batch_timeout?: number; max_concurrency?: number; max_retries?: number; dead_letter_queue?: string }[];
  };
  triggers?: { crons: string[] };
  vars: Record<string, string>;
};

const read = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8")) as Config;

describe("Search Console sync bindings", () => {
  const handoff = read("wrangler.jsonc");
  const hq = read("wrangler.hq.jsonc");

  it("adds the daily cron on handoff only, after the existing crons", () => {
    expect(handoff.triggers?.crons).toEqual(["* * * * *", "0 * * * *", SEARCH_SYNC_CRON]);
    expect(hq.triggers).toBeUndefined();
  });

  it("binds the handoff-search database on both Workers with its own migrations folder", () => {
    for (const config of [handoff, hq]) {
      const search = config.d1_databases.find((db) => db.binding === "SEARCH_DB");
      expect(search).toMatchObject({ database_name: "handoff-search", migrations_dir: "migrations-search" });
      expect(config.d1_databases.find((db) => db.binding === "DB")).toMatchObject({ database_name: "handoff", migrations_dir: "migrations" });
    }
    // The real handoff-search database (created 2026-10-24 with Christopher's approval), the same on both Workers.
    const ids = [handoff, hq].map((config) => config.d1_databases.find((db) => db.binding === "SEARCH_DB")?.database_id);
    expect(ids).toEqual(["1cb2d972-e9f2-4472-b017-b56addb49766", "1cb2d972-e9f2-4472-b017-b56addb49766"]);
  });

  it("produces to search-sync from both Workers and consumes only on handoff, with a dead-letter queue", () => {
    for (const config of [handoff, hq]) expect(config.queues.producers).toContainEqual({ binding: "SEARCH_SYNC", queue: SEARCH_SYNC_QUEUE });
    expect(handoff.queues.consumers).toContainEqual({
      queue: SEARCH_SYNC_QUEUE,
      max_batch_size: 5,
      max_batch_timeout: 5,
      max_concurrency: 2,
      max_retries: 5,
      dead_letter_queue: "search-sync-dlq",
    });
    expect(hq.queues.consumers).toBeUndefined();
  });

  it("never puts the Google key in vars, and leaves Search Console off by default", () => {
    for (const config of [handoff, hq]) {
      expect(config.vars).not.toHaveProperty("GOOGLE_SA_KEY_JSON");
      expect(config.vars).not.toHaveProperty("SEARCH_CONSOLE");
    }
  });
});
