import type { Sql, SqlStatement } from "@/db/sql";
import type { SearchAnalyticsRow } from "./gsc";
import type { AnalyticsRequest } from "./sync-jobs";

/**
 * Writes one day of one Search Analytics request into the handoff-search database (SEARCH_DB).
 * Rows travel as one JSON parameter per chunk (json_each), so a statement never binds more than a handful of
 * parameters (D1 allows 100) and 25,000 rows take about 50 statements instead of thousands.
 * A re-pull of the same day first deletes that day's rows for the property, then writes the new set, so a re-pull is
 * idempotent and a row Google no longer reports does not linger. Upserts by natural key cover duplicate keys.
 * Ids are looked up with scalar subqueries on the (property_id, text|url) unique index, never a join that could scan.
 */

export const FACT_CHUNK_ROWS = 500;
export const STATEMENTS_PER_BATCH = 10;
/** query x page is the biggest table; keep the top rows per day by impressions in D1 (the full set goes to R2). */
export const QUERY_PAGE_DAILY_CAP = 5_000;

type Measures = { clicks: number; impressions: number; posSum: number };

function measures(row: SearchAnalyticsRow): Measures {
  const clicks = Math.max(0, Math.round(row.clicks));
  const impressions = Math.max(0, Math.round(row.impressions));
  return { clicks, impressions, posSum: impressions > 0 ? row.position * impressions : 0 };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function runBatches(sql: Sql, statements: SqlStatement[]): Promise<void> {
  for (const group of chunks(statements, STATEMENTS_PER_BATCH)) await sql.batch(group);
}

function ensureDimension(table: "search_queries" | "search_pages", column: "text" | "url", propertyId: string, values: string[]): SqlStatement[] {
  return chunks([...new Set(values)], FACT_CHUNK_ROWS).map((chunk) => ({
    statement: `INSERT OR IGNORE INTO ${table} (property_id, ${column}) SELECT ?, value FROM json_each(?)`,
    params: [propertyId, JSON.stringify(chunk)],
  }));
}

const SET_MEASURES = "organization_id = excluded.organization_id, clicks = excluded.clicks, impressions = excluded.impressions, pos_sum = excluded.pos_sum";

export async function writeAnalyticsDay(input: {
  sql: Sql;
  organizationId: string;
  propertyId: string;
  day: string;
  request: Exclude<AnalyticsRequest, "raw">;
  rows: SearchAnalyticsRow[];
  isFinal: boolean;
}): Promise<number> {
  const { sql, organizationId, propertyId, day, rows } = input;
  const scope = [organizationId, propertyId, day];
  switch (input.request) {
    case "site": {
      const total = rows.reduce<Measures>((sum, row) => {
        const next = measures(row);
        return { clicks: sum.clicks + next.clicks, impressions: sum.impressions + next.impressions, posSum: sum.posSum + next.posSum };
      }, { clicks: 0, impressions: 0, posSum: 0 });
      await sql.run(
        `INSERT INTO search_daily_site (organization_id, property_id, day, search_type, clicks, impressions, pos_sum, is_final)
         VALUES (?, ?, ?, 'web', ?, ?, ?, ?)
         ON CONFLICT (property_id, search_type, day) DO UPDATE SET ${SET_MEASURES}, is_final = excluded.is_final`,
        [...scope, total.clicks, total.impressions, total.posSum, input.isFinal ? 1 : 0],
      );
      return 1;
    }
    case "page":
    case "query": {
      const isPage = input.request === "page";
      const table = isPage ? "search_daily_page" : "search_daily_query";
      const dimTable = isPage ? "search_pages" : "search_queries";
      const dimColumn = isPage ? "url" : "text";
      const idColumn = isPage ? "page_id" : "query_id";
      const encoded = rows.filter((row) => row.keys[1]).map((row) => {
        const m = measures(row);
        return [row.keys[1], m.clicks, m.impressions, m.posSum];
      });
      const statements: SqlStatement[] = [
        { statement: `DELETE FROM ${table} WHERE property_id = ? AND day = ?`, params: [propertyId, day] },
        ...ensureDimension(dimTable, dimColumn, propertyId, encoded.map((row) => String(row[0]))),
        ...chunks(encoded, FACT_CHUNK_ROWS).map((chunk) => ({
          statement: `INSERT INTO ${table} (organization_id, property_id, day, ${idColumn}, clicks, impressions, pos_sum)
                      SELECT ?, ?, ?, (SELECT d.id FROM ${dimTable} AS d WHERE d.property_id = ? AND d.${dimColumn} = json_extract(j.value, '$[0]')),
                             json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]'), json_extract(j.value, '$[3]')
                      FROM json_each(?) AS j
                      WHERE true
                      ON CONFLICT (property_id, day, ${idColumn}) DO UPDATE SET ${SET_MEASURES}`,
          params: [...scope, propertyId, JSON.stringify(chunk)],
        })),
      ];
      await runBatches(sql, statements);
      return encoded.length;
    }
    case "query_page": {
      const kept = rows
        .filter((row) => row.keys[1] && row.keys[2])
        .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
        .slice(0, QUERY_PAGE_DAILY_CAP);
      const encoded = kept.map((row) => {
        const m = measures(row);
        return [row.keys[1], row.keys[2], m.clicks, m.impressions, m.posSum];
      });
      const statements: SqlStatement[] = [
        { statement: "DELETE FROM search_daily_query_page WHERE property_id = ? AND day = ?", params: [propertyId, day] },
        ...ensureDimension("search_queries", "text", propertyId, encoded.map((row) => String(row[0]))),
        ...ensureDimension("search_pages", "url", propertyId, encoded.map((row) => String(row[1]))),
        ...chunks(encoded, FACT_CHUNK_ROWS).map((chunk) => ({
          statement: `INSERT INTO search_daily_query_page (organization_id, property_id, day, query_id, page_id, clicks, impressions, pos_sum)
                      SELECT ?, ?, ?,
                             (SELECT q.id FROM search_queries AS q WHERE q.property_id = ? AND q.text = json_extract(j.value, '$[0]')),
                             (SELECT p.id FROM search_pages AS p WHERE p.property_id = ? AND p.url = json_extract(j.value, '$[1]')),
                             json_extract(j.value, '$[2]'), json_extract(j.value, '$[3]'), json_extract(j.value, '$[4]')
                      FROM json_each(?) AS j
                      WHERE true
                      ON CONFLICT (property_id, day, query_id, page_id) DO UPDATE SET ${SET_MEASURES}`,
          params: [...scope, propertyId, propertyId, JSON.stringify(chunk)],
        })),
      ];
      await runBatches(sql, statements);
      return encoded.length;
    }
    case "segment": {
      const encoded = rows.map((row) => {
        const m = measures(row);
        return [row.keys[1] ?? "zzz", row.keys[2] ?? "UNKNOWN", m.clicks, m.impressions, m.posSum];
      });
      const statements: SqlStatement[] = [
        { statement: "DELETE FROM search_daily_segment WHERE property_id = ? AND day = ?", params: [propertyId, day] },
        ...chunks(encoded, FACT_CHUNK_ROWS).map((chunk) => ({
          statement: `INSERT INTO search_daily_segment (organization_id, property_id, day, country, device, clicks, impressions, pos_sum)
                      SELECT ?, ?, ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
                             json_extract(value, '$[3]'), json_extract(value, '$[4]')
                      FROM json_each(?) WHERE true
                      ON CONFLICT (property_id, day, country, device) DO UPDATE SET ${SET_MEASURES}`,
          params: [...scope, JSON.stringify(chunk)],
        })),
      ];
      await runBatches(sql, statements);
      return encoded.length;
    }
  }
}

// ---------- R2 raw exports ----------

export type RawBucket = { put(key: string, body: Uint8Array | string): Promise<unknown> };

export const RAW_PREFIX = "search-raw/";
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/** search-raw/<org>/<property>/<yyyy-mm-dd>.jsonl.gz (full grain) or <day>.query-page.jsonl.gz (uncapped query x page). */
export function rawExportKey(organizationId: string, propertyId: string, day: string, request: "raw" | "query_page"): string {
  if (!SEGMENT.test(organizationId) || !SEGMENT.test(propertyId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error("Unsafe raw export key.");
  }
  return `${RAW_PREFIX}${organizationId}/${propertyId}/${day}${request === "raw" ? "" : ".query-page"}.jsonl.gz`;
}

const RAW_FIELDS: Record<"raw" | "query_page", string[]> = {
  raw: ["date", "query", "page", "country", "device"],
  query_page: ["date", "query", "page"],
};

/** One JSON object per line, gzipped. Rewritten whole on a re-pull, so the latest pull wins. */
export async function exportRaw(input: {
  bucket: RawBucket;
  key: string;
  request: "raw" | "query_page";
  rows: SearchAnalyticsRow[];
}): Promise<number> {
  const fields = RAW_FIELDS[input.request];
  const text = input.rows
    .map((row) => {
      const record: Record<string, unknown> = {};
      fields.forEach((field, index) => {
        record[field] = row.keys[index] ?? null;
      });
      record.clicks = row.clicks;
      record.impressions = row.impressions;
      record.position = row.position;
      return JSON.stringify(record);
    })
    .join("\n");
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  await input.bucket.put(input.key, bytes);
  return input.rows.length;
}
