import { changedRows, type BoundSql, type BoundStatement } from "@/lib/cloudflare/sql";
import type { PrioritizedUrl } from "@/lib/prioritize-urls";
import type { SiteFiles } from "@/lib/types";
import type { ScanPageRecord } from "./repository";
import { compactSiteFiles, parseStoredSiteFiles } from "./site-files-store";
import type { ScanTier } from "./tiers";

export type ScanRun = {
  scanId: string;
  tier: ScanTier;
  pageLimit: number;
  pagesTotal: number | null;
  pagesDone: number;
  chunksTotal: number | null;
  chunksDone: number;
  searchCount: number;
  siteFiles: SiteFiles;
  plannedAt: number | null;
  finalizeClaimedAt: number | null;
  finalizedAt: number | null;
  partial: boolean;
  watchdogRounds: number;
  chunkSize: number;
  robotsStatus: RobotsStatus | null;
  robotsSkipped: number;
  crawlDelayMs: number;
  createdAt: number;
};

export type RobotsStatus = "ok" | "missing" | "unreachable";

export type ScanChunk = {
  index: number;
  urls: PrioritizedUrl[];
  status: "pending" | "done";
  attempts: number;
  updatedAt: number;
};

export type ScanProgress = {
  tier: ScanTier;
  pagesDone: number;
  pagesTotal: number | null;
  partial: boolean;
  /** Deep scans only: how robots.txt was read, how many URLs it ruled out, and the crawl delay followed. */
  robotsStatus: RobotsStatus | null;
  robotsSkipped: number;
  crawlDelayMs: number;
};

type RunRow = {
  scan_id: string;
  tier: string;
  page_limit: number;
  pages_total: number | null;
  pages_done: number;
  chunks_total: number | null;
  chunks_done: number;
  search_count: number;
  site_files_json: string | null;
  planned_at: number | null;
  finalize_claimed_at: number | null;
  finalized_at: number | null;
  partial: number;
  watchdog_rounds: number;
  chunk_size: number;
  robots_status: string | null;
  robots_skipped: number;
  crawl_delay_ms: number;
  created_at: number;
};

function robotsStatus(value: string | null): RobotsStatus | null {
  return value === "ok" || value === "missing" || value === "unreachable" ? value : null;
}

function mapRun(row: RunRow): ScanRun {
  return {
    scanId: row.scan_id,
    tier: row.tier as ScanTier,
    pageLimit: Number(row.page_limit),
    pagesTotal: row.pages_total === null ? null : Number(row.pages_total),
    pagesDone: Number(row.pages_done),
    chunksTotal: row.chunks_total === null ? null : Number(row.chunks_total),
    chunksDone: Number(row.chunks_done),
    searchCount: Number(row.search_count),
    siteFiles: parseStoredSiteFiles(row.site_files_json),
    plannedAt: row.planned_at,
    finalizeClaimedAt: row.finalize_claimed_at,
    finalizedAt: row.finalized_at,
    partial: row.partial === 1,
    watchdogRounds: Number(row.watchdog_rounds),
    chunkSize: Number(row.chunk_size) || 50,
    robotsStatus: robotsStatus(row.robots_status),
    robotsSkipped: Number(row.robots_skipped),
    crawlDelayMs: Number(row.crawl_delay_ms),
    createdAt: Number(row.created_at),
  };
}

function parseUrls(json: string): PrioritizedUrl[] {
  try {
    const rows = JSON.parse(json) as unknown;
    return Array.isArray(rows) ? (rows as PrioritizedUrl[]) : [];
  } catch {
    return [];
  }
}

/** D1 runs a batch as one transaction. The fallback only exists for stand-ins without batch(). */
export async function runBatch(db: BoundSql, statements: BoundStatement[]): Promise<unknown[]> {
  if (db.batch) return db.batch(statements);
  const out: unknown[] = [];
  for (const statement of statements) out.push(await statement.run());
  return out;
}

/** D1 allows 100 bound parameters per statement: 12 rows of 8 columns each. */
export const ROWS_PER_INSERT = 12;

export function insertPageStatements(db: BoundSql, scanId: string, pages: ScanPageRecord[]): BoundStatement[] {
  const out: BoundStatement[] = [];
  for (let i = 0; i < pages.length; i += ROWS_PER_INSERT) {
    const slice = pages.slice(i, i + ROWS_PER_INSERT);
    const values = slice.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const args = slice.flatMap((page) => [
      crypto.randomUUID(),
      scanId,
      page.url,
      page.pageType,
      page.fetchStatus,
      page.hasJsonLd ? 1 : 0,
      JSON.stringify(page.schemaTypes),
      JSON.stringify(page.evidence ?? {}),
    ]);
    out.push(
      db
        .prepare(
          `INSERT INTO readiness_scan_pages
            (id, scan_id, url, page_type, fetch_status, has_json_ld, schema_types_json, evidence_json)
           VALUES ${values}`,
        )
        .bind(...args),
    );
  }
  return out;
}

export type ScanPipelineStore = ReturnType<typeof createD1PipelineStore>;

export function createD1PipelineStore(db: BoundSql) {
  async function getRun(scanId: string): Promise<ScanRun | null> {
    const row = await db
      .prepare(
        `SELECT scan_id, tier, page_limit, pages_total, pages_done, chunks_total, chunks_done, search_count,
                site_files_json, planned_at, finalize_claimed_at, finalized_at, partial, watchdog_rounds, chunk_size,
                robots_status, robots_skipped, crawl_delay_ms, created_at
         FROM readiness_scan_runs WHERE scan_id = ?`,
      )
      .bind(scanId)
      .first<RunRow>();
    return row ? mapRun(row) : null;
  }

  return {
    getRun,

    /** One run row per scan. A second call for the same scan is a no-op. */
    async createRun(scanId: string, tier: ScanTier, pageLimit: number, now: number): Promise<void> {
      await db
        .prepare(
          `INSERT OR IGNORE INTO readiness_scan_runs (scan_id, tier, page_limit, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(scanId, tier, pageLimit, now, now)
        .run();
    },

    /**
     * Store the plan and its chunks in one transaction. Only the first plan counts: a duplicate plan delivery
     * returns false and leaves the stored chunks as they are.
     */
    async savePlan(
      scanId: string,
      plan: {
        siteFiles: SiteFiles;
        searchCount: number;
        chunks: PrioritizedUrl[][];
        chunkSize?: number;
        robots?: { status: RobotsStatus; skipped: number; crawlDelayMs: number } | null;
      },
      now: number,
    ): Promise<boolean> {
      const pagesTotal = plan.chunks.reduce((sum, list) => sum + list.length, 0);
      const robots = plan.robots ?? null;
      const statements: BoundStatement[] = [
        db
          .prepare(
            `UPDATE readiness_scan_runs
             SET planned_at = ?, pages_total = ?, chunks_total = ?, search_count = ?, site_files_json = ?,
                 chunk_size = ?, robots_status = ?, robots_skipped = ?, crawl_delay_ms = ?, updated_at = ?
             WHERE scan_id = ? AND planned_at IS NULL`,
          )
          .bind(
            now,
            pagesTotal,
            plan.chunks.length,
            plan.searchCount,
            JSON.stringify(compactSiteFiles(plan.siteFiles)),
            plan.chunkSize ?? 50,
            robots?.status ?? null,
            robots?.skipped ?? 0,
            robots?.crawlDelayMs ?? 0,
            now,
            scanId,
          ),
        ...plan.chunks.map((urls, index) =>
          db
            .prepare(
              `INSERT OR IGNORE INTO readiness_scan_chunks (scan_id, chunk_index, urls_json, status, updated_at)
               VALUES (?, ?, ?, 'pending', ?)`,
            )
            .bind(scanId, index, JSON.stringify(urls), now),
        ),
      ];
      const results = await runBatch(db, statements);
      return changedRows(results[0]) === 1;
    },

    async getChunk(scanId: string, index: number): Promise<ScanChunk | null> {
      const row = await db
        .prepare(
          `SELECT chunk_index, urls_json, status, attempts, updated_at FROM readiness_scan_chunks
           WHERE scan_id = ? AND chunk_index = ?`,
        )
        .bind(scanId, index)
        .first<{ chunk_index: number; urls_json: string; status: "pending" | "done"; attempts: number; updated_at: number }>();
      if (!row) return null;
      return {
        index: Number(row.chunk_index),
        urls: parseUrls(row.urls_json),
        status: row.status,
        attempts: Number(row.attempts),
        updatedAt: Number(row.updated_at),
      };
    },

    async pendingChunks(scanId: string): Promise<number[]> {
      const rows = await db
        .prepare(
          `SELECT chunk_index FROM readiness_scan_chunks WHERE scan_id = ? AND status = 'pending' ORDER BY chunk_index`,
        )
        .bind(scanId)
        .all<{ chunk_index: number }>();
      return (rows.results ?? []).map((row) => Number(row.chunk_index));
    },

    async noteAttempt(scanId: string, index: number, now: number): Promise<void> {
      await db
        .prepare(
          `UPDATE readiness_scan_chunks SET attempts = attempts + 1, updated_at = ?
           WHERE scan_id = ? AND chunk_index = ? AND status = 'pending'`,
        )
        .bind(now, scanId, index)
        .run();
    },

    /**
     * Write one chunk's pages and count it, in one transaction. The chunk's earlier rows (a partial or duplicate
     * run) are replaced, and the counters only move the first time the chunk goes from pending to done.
     */
    async completeChunk(
      scanId: string,
      chunk: Pick<ScanChunk, "index" | "urls">,
      pages: ScanPageRecord[],
      now: number,
    ): Promise<{ counted: boolean }> {
      const urls = JSON.stringify(chunk.urls.map((entry) => entry.url));
      const results = await runBatch(db, [
        db
          .prepare(
            `DELETE FROM readiness_scan_pages
             WHERE scan_id = ? AND url IN (SELECT value FROM json_each(?))`,
          )
          .bind(scanId, urls),
        ...insertPageStatements(db, scanId, pages),
        db
          .prepare(
            `UPDATE readiness_scan_runs
             SET pages_done = pages_done + ?, chunks_done = chunks_done + 1, updated_at = ?
             WHERE scan_id = ? AND EXISTS (
               SELECT 1 FROM readiness_scan_chunks WHERE scan_id = ? AND chunk_index = ? AND status = 'pending'
             )`,
          )
          .bind(chunk.urls.length, now, scanId, scanId, chunk.index),
        db
          .prepare(
            `UPDATE readiness_scan_chunks SET status = 'done', pages_saved = ?, updated_at = ?
             WHERE scan_id = ? AND chunk_index = ? AND status = 'pending'`,
          )
          .bind(pages.length, now, scanId, chunk.index),
      ]);
      return { counted: changedRows(results[results.length - 1]) === 1 };
    },

    /**
     * Claim the right to finalize. Exactly one caller wins; a claim older than `staleMs` (a finalize that died)
     * can be taken over. `force` lets the watchdog finalize with chunks still pending.
     */
    async claimFinalize(scanId: string, now: number, staleMs: number, force = false): Promise<boolean> {
      const result = await db
        .prepare(
          `UPDATE readiness_scan_runs SET finalize_claimed_at = ?, partial = ?, updated_at = ?
           WHERE scan_id = ? AND finalized_at IS NULL AND chunks_total IS NOT NULL
             AND (? = 1 OR chunks_done >= chunks_total)
             AND (finalize_claimed_at IS NULL OR finalize_claimed_at < ?)`,
        )
        .bind(now, force ? 1 : 0, now, scanId, force ? 1 : 0, now - staleMs)
        .run();
      return changedRows(result) === 1;
    },

    async markFinalized(scanId: string, now: number): Promise<void> {
      await db
        .prepare("UPDATE readiness_scan_runs SET finalized_at = ?, updated_at = ? WHERE scan_id = ?")
        .bind(now, now, scanId)
        .run();
    },

    async bumpWatchdog(scanId: string, now: number): Promise<number> {
      await db
        .prepare("UPDATE readiness_scan_runs SET watchdog_rounds = watchdog_rounds + 1, updated_at = ? WHERE scan_id = ?")
        .bind(now, scanId)
        .run();
      return (await getRun(scanId))?.watchdogRounds ?? 0;
    },

    /** Just what scoring reads, without the bulky evidence column. In planned (insert) order. */
    async loadScoringPages(scanId: string): Promise<ScanPageRecord[]> {
      const rows = await db
        .prepare(
          `SELECT url, page_type, fetch_status, has_json_ld, schema_types_json
           FROM readiness_scan_pages WHERE scan_id = ? ORDER BY rowid`,
        )
        .bind(scanId)
        .all<{ url: string; page_type: string; fetch_status: string; has_json_ld: number; schema_types_json: string }>();
      return (rows.results ?? []).map((row) => {
        let types: unknown = [];
        try {
          types = JSON.parse(row.schema_types_json);
        } catch {
          types = [];
        }
        return {
          url: row.url,
          pageType: row.page_type,
          fetchStatus: row.fetch_status,
          hasJsonLd: row.has_json_ld === 1,
          schemaTypes: Array.isArray(types) ? types.filter((t): t is string => typeof t === "string") : [],
        };
      });
    },
  };
}

/** Progress for the scan page. Null for scans from before chunked runs, or before the migration is applied. */
export async function loadScanProgress(db: BoundSql, scanId: string): Promise<ScanProgress | null> {
  try {
    const row = await db
      .prepare(
        `SELECT tier, pages_done, pages_total, partial, robots_status, robots_skipped, crawl_delay_ms
         FROM readiness_scan_runs WHERE scan_id = ?`,
      )
      .bind(scanId)
      .first<{
        tier: string;
        pages_done: number;
        pages_total: number | null;
        partial: number;
        robots_status: string | null;
        robots_skipped: number;
        crawl_delay_ms: number;
      }>();
    if (!row) return null;
    return {
      tier: row.tier as ScanTier,
      pagesDone: Number(row.pages_done),
      pagesTotal: row.pages_total === null ? null : Number(row.pages_total),
      partial: row.partial === 1,
      robotsStatus: robotsStatus(row.robots_status),
      robotsSkipped: Number(row.robots_skipped ?? 0),
      crawlDelayMs: Number(row.crawl_delay_ms ?? 0),
    };
  } catch {
    return null;
  }
}
