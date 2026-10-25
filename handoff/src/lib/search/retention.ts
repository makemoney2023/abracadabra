import type { Sql } from "@/db/sql";
import { HISTORY_MONTHS, monthsBefore, utcDay } from "./sync-jobs";

/**
 * Daily retention for one property in the handoff-search database.
 * - A month whose every day is older than 16 months is rolled into search_monthly_site/page/query (top 1,000 pages and
 *   queries by clicks), marked in search_rollups, then its daily rows are deleted in chunks. The marker means a run that
 *   stops halfway never re-rolls a month from half-deleted rows.
 * - Monthly roll-ups older than 36 months and URL events older than 24 months are deleted.
 * Raw R2 exports expire by the bucket lifecycle rule on search-raw/ (490 days), not here.
 */

export const MONTHLY_TOP_N = 1_000;
export const MONTHLY_KEEP_MONTHS = 36;
export const URL_EVENTS_KEEP_MONTHS = 24;
const DAILY_TABLES = ["search_daily_site", "search_daily_page", "search_daily_query", "search_daily_query_page", "search_daily_segment"] as const;

function nextMonth(month: string): string {
  const [year, value] = month.split("-").map(Number) as [number, number];
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`;
}

export async function runSearchRetention(input: {
  sql: Sql;
  organizationId: string;
  propertyId: string;
  now: number;
  chunkRows?: number;
  maxChunks?: number;
}): Promise<{ rolledMonths: string[]; deletedRows: number; done: boolean }> {
  const { sql, organizationId, propertyId } = input;
  const chunkRows = input.chunkRows ?? 1_000;
  const maxChunks = input.maxChunks ?? 50;
  const today = utcDay(input.now);
  const keepFromMonth = monthsBefore(today, HISTORY_MONTHS).slice(0, 7);
  const firstKeptDay = `${keepFromMonth}-01`;

  const months = await sql.all<{ month: string }>(
    `SELECT DISTINCT substr(day, 1, 7) AS month FROM (
       SELECT day FROM search_daily_site WHERE property_id = ? AND day < ?
       UNION SELECT day FROM search_daily_page WHERE property_id = ? AND day < ?
       UNION SELECT day FROM search_daily_query WHERE property_id = ? AND day < ?
     ) ORDER BY month`,
    [propertyId, firstKeptDay, propertyId, firstKeptDay, propertyId, firstKeptDay],
  );
  const rolledMonths: string[] = [];
  for (const { month } of months) {
    const marked = await sql.get<{ month: string }>("SELECT month FROM search_rollups WHERE property_id = ? AND month = ?", [propertyId, month]);
    if (marked) continue;
    const range = [propertyId, `${month}-01`, `${nextMonth(month)}-01`];
    const set = "organization_id = excluded.organization_id, clicks = excluded.clicks, impressions = excluded.impressions, pos_sum = excluded.pos_sum";
    await sql.batch([
      {
        statement: `INSERT INTO search_monthly_site (organization_id, property_id, month, search_type, clicks, impressions, pos_sum)
                    SELECT ?, property_id, ?, search_type, sum(clicks), sum(impressions), sum(pos_sum)
                    FROM search_daily_site WHERE property_id = ? AND day >= ? AND day < ? GROUP BY property_id, search_type
                    ON CONFLICT (property_id, search_type, month) DO UPDATE SET ${set}`,
        params: [organizationId, month, ...range],
      },
      ...(["page", "query"] as const).map((kind) => ({
        statement: `INSERT INTO search_monthly_${kind} (organization_id, property_id, month, ${kind}_id, clicks, impressions, pos_sum)
                    SELECT ?, ?, ?, id, clicks, impressions, pos_sum FROM (
                      SELECT ${kind}_id AS id, sum(clicks) AS clicks, sum(impressions) AS impressions, sum(pos_sum) AS pos_sum,
                             row_number() OVER (ORDER BY sum(clicks) DESC, sum(impressions) DESC, ${kind}_id) AS rank
                      FROM search_daily_${kind} WHERE property_id = ? AND day >= ? AND day < ? GROUP BY ${kind}_id
                    ) WHERE rank <= ${MONTHLY_TOP_N}
                    ON CONFLICT (property_id, month, ${kind}_id) DO UPDATE SET ${set}`,
        params: [organizationId, propertyId, month, ...range],
      })),
      { statement: "INSERT INTO search_rollups (property_id, month, rolled_at) VALUES (?, ?, ?)", params: [propertyId, month, input.now] },
    ]);
    rolledMonths.push(month);
  }

  // Delete only months that are rolled up (every month before the first kept month is, after the loop above).
  let deletedRows = 0;
  let chunksUsed = 0;
  let done = true;
  for (const table of DAILY_TABLES) {
    for (;;) {
      if (chunksUsed >= maxChunks) {
        const left = await sql.get<{ n: number }>(`SELECT count(*) AS n FROM ${table} WHERE property_id = ? AND day < ?`, [propertyId, firstKeptDay]);
        if ((left?.n ?? 0) > 0) done = false;
        break;
      }
      const before = await sql.get<{ n: number }>(`SELECT count(*) AS n FROM (SELECT 1 FROM ${table} WHERE property_id = ? AND day < ? LIMIT ?)`, [propertyId, firstKeptDay, chunkRows]);
      const n = before?.n ?? 0;
      if (n === 0) break;
      await sql.run(
        `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE property_id = ? AND day < ? LIMIT ?)`,
        [propertyId, firstKeptDay, chunkRows],
      );
      chunksUsed += 1;
      deletedRows += n;
    }
  }

  const oldestMonth = monthsBefore(today, MONTHLY_KEEP_MONTHS).slice(0, 7);
  await sql.batch([
    ...["search_monthly_site", "search_monthly_page", "search_monthly_query", "search_rollups"].map((table) => ({
      statement: `DELETE FROM ${table} WHERE property_id = ? AND month < ?`,
      params: [propertyId, oldestMonth],
    })),
    {
      statement: "DELETE FROM search_url_events WHERE property_id = ? AND at < ?",
      params: [propertyId, Date.parse(`${monthsBefore(today, URL_EVENTS_KEEP_MONTHS)}T00:00:00Z`)],
    },
  ]);
  return { rolledMonths, deletedRows, done };
}
