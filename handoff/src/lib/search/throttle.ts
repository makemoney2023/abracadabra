import type { Sql } from "@/db/sql";
import { SearchApiError } from "./errors";

/**
 * One service account is one Google "user" for every client, and Google's per-user limit is shared, so HQ throttles
 * itself to 300 calls a minute across every property and every queue consumer run. The count lives in the
 * handoff-search database (search_api_minute), so concurrent consumers share it.
 */
export const GLOBAL_CALLS_PER_MINUTE = 300;
const MINUTE = 60_000;

export type Throttle = { acquire(): Promise<void> };

export function createGlobalThrottle(input: {
  sql: Sql;
  limit?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Longest wait inside one consumer run. Past it the caller gets rate_limited and the queue retries later. */
  maxWaitMs?: number;
}): Throttle {
  const limit = input.limit ?? GLOBAL_CALLS_PER_MINUTE;
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxWaitMs = input.maxWaitMs ?? 65_000;
  return {
    async acquire() {
      let waited = 0;
      for (;;) {
        const at = now();
        const minute = Math.floor(at / MINUTE);
        const row = await input.sql.get<{ calls: number }>(
          `INSERT INTO search_api_minute (minute, calls) VALUES (?, 1)
           ON CONFLICT (minute) DO UPDATE SET calls = calls + 1 RETURNING calls`,
          [minute],
        );
        const calls = Number(row?.calls ?? 1);
        if (calls === 1) await input.sql.run("DELETE FROM search_api_minute WHERE minute < ?", [minute - 60]);
        if (calls <= limit) return;
        const wait = (minute + 1) * MINUTE - at;
        if (waited + wait > maxWaitMs) throw new SearchApiError("rate_limited", 429, "hq_throttle", wait);
        await sleep(wait);
        waited += wait;
      }
    },
  };
}
