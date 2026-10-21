/**
 * Chunked scans over the scan-jobs queue: plan -> chunks of 50 URLs -> finalize.
 *
 * - plan (`{ type: "scan" }`): site files, search, sitemap and checked guesses, up to the tier's page limit.
 *   Stores the plan and its chunks in one transaction, sends chunks 1..n with sendBatch, runs chunk 0 inline.
 *   A free 40-page scan is a single chunk, so it still finishes in one invocation, as before.
 * - chunk (`{ type: "scan-chunk" }`): reads its URLs, writes the rows and bumps pages_done in one transaction.
 *   A duplicate delivery replaces the chunk's rows and does not count twice.
 * - finalize: whichever invocation completes the last chunk claims finalize (one winner), scores from stored rows
 *   and writes the findings and score. `{ type: "scan-finalize" }` re-runs a claim that went stale.
 * - watchdog (`{ type: "scan-watchdog" }`, delayed): re-sends chunks that are still pending, retries a lost
 *   finalize, and after the deadline finalizes with what was read (the run is marked partial).
 *
 * Deep tiers follow robots.txt (RFC 9309): disallowed URLs are never planned, and when robots.txt is unreachable
 * (5xx or network error) nothing is read and the scan fails with ROBOTS_UNREACHABLE_MESSAGE. A Crawl-delay
 * (capped at 10 s) makes the run paced: one request per delay, chunks of at most PACED_CHUNK_BUDGET_MS worth of
 * pages, run one after another (each chunk queues the next with the delay), and a deadline stretched by the delay
 * (see deadlineFor). A 1,000-page scan at a 10 s delay takes about three hours. The free scan never changes.
 */
import type { JobQueue, QueueMessage } from "@/lib/cloudflare/sql";
import type { PrioritizedUrl } from "@/lib/prioritize-urls";
import { MAX_PAGES } from "@/lib/scoring/constants";
import type { ScanPipelineStore, ScanRun } from "./d1-pipeline-store";
import {
  CATASTROPHIC_MESSAGE,
  createPacer,
  discoverScanUrls,
  findingRecords,
  isCatastrophicFailure,
  queueOpsFollowUp,
  scanPlannedPages,
  scoreStoredPages,
  type RunScanDeps,
} from "./orchestrator";
import { DEEP_SCRAPE_LIMIT, SCRAPE_LIMIT } from "./page-record";
import type { ScanRepository } from "./repository";
import { CHUNK_SIZE, type ScanTier } from "./tiers";

export const WATCHDOG_DELAY_SECONDS = 10 * 60;
/** A scan still unfinished this long after planning is finalized with the pages that were read. */
export const SCAN_DEADLINE_MS = 30 * 60 * 1000;
/** A finalize claim older than this is treated as dead and can be taken over. */
export const FINALIZE_STALE_MS = 10 * 60 * 1000;
/** With a crawl delay, a chunk holds at most this much paced fetching (10 s delay: 24 pages, about 4 minutes). */
export const PACED_CHUNK_BUDGET_MS = 4 * 60 * 1000;
/** A paced chunk attempted more recently than this is taken to be in progress elsewhere. */
export const PACED_CHUNK_STALE_MS = 9 * 60 * 1000;

export const ROBOTS_UNREACHABLE_MESSAGE =
  "robots.txt could not be read (server error or no response). Deep scans follow robots.txt, so no pages were read. Try again later.";
export const ROBOTS_DISALLOWED_MESSAGE =
  "robots.txt does not allow our scanner (SchemaAEOScanner) to read any of the pages found, so no pages were read.";

/** URLs per chunk: 50, or fewer so one paced chunk stays within PACED_CHUNK_BUDGET_MS. */
export function chunkSizeFor(crawlDelayMs: number): number {
  if (crawlDelayMs <= 0) return CHUNK_SIZE;
  return Math.max(1, Math.min(CHUNK_SIZE, Math.floor(PACED_CHUNK_BUDGET_MS / crawlDelayMs)));
}

/**
 * When an unfinished scan is finalized with what it has. 30 minutes, plus for a paced run one delay per page and
 * two per chunk (the chunk's own first wait and its queued delay).
 */
export function deadlineFor(run: Pick<ScanRun, "crawlDelayMs" | "pagesTotal" | "chunksTotal">): number {
  if (run.crawlDelayMs <= 0) return SCAN_DEADLINE_MS;
  return SCAN_DEADLINE_MS + ((run.pagesTotal ?? 0) + 2 * (run.chunksTotal ?? 0)) * run.crawlDelayMs;
}

/** Queues accept at most 100 messages per sendBatch. */
const SEND_BATCH_MAX = 100;

export type PipelineDeps = Pick<RunScanDeps, "site" | "probe"> & {
  repo: ScanRepository;
  store: ScanPipelineStore;
  queue: JobQueue;
  now?: () => number;
  /** Waits between paced requests (tests pass a fake). */
  sleep?: (ms: number) => Promise<void>;
  /** Runs after a scan is scored (or fails for good), e.g. the lead notification. */
  onFinished?: (scanId: string) => Promise<void>;
};

export function splitIntoChunks<T>(items: T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The first MAX_PAGES pages keep the full scraped text HQ reads; a deep scan's long tail keeps an excerpt. */
export function textLimitFor(tier: ScanTier, position: number): number {
  return tier === "free" || position < MAX_PAGES ? SCRAPE_LIMIT : DEEP_SCRAPE_LIMIT;
}

function done(status: string): boolean {
  return status === "complete" || status === "failed";
}

async function sendAll(queue: JobQueue, messages: QueueMessage[]): Promise<void> {
  if (messages.length === 0) return;
  if (queue.sendBatch) {
    for (let i = 0; i < messages.length; i += SEND_BATCH_MAX) {
      await queue.sendBatch(messages.slice(i, i + SEND_BATCH_MAX));
    }
    return;
  }
  for (const message of messages) {
    await queue.send(message.body, message.delaySeconds ? { delaySeconds: message.delaySeconds } : undefined);
  }
}

function chunkMessages(scanId: string, indices: number[]): QueueMessage[] {
  return indices.map((chunk) => ({ body: { type: "scan-chunk", scanId, chunk } }));
}

async function scheduleWatchdog(queue: JobQueue, scanId: string): Promise<void> {
  await queue.send({ type: "scan-watchdog", scanId }, { delaySeconds: WATCHDOG_DELAY_SECONDS });
}

export async function planScanJob(scanId: string, deps: PipelineDeps): Promise<void> {
  const { repo, store, queue } = deps;
  const now = deps.now ?? Date.now;
  const scan = await repo.getScan(scanId);
  if (!scan) throw new Error(`Scan not found: ${scanId}`);
  if (done(scan.status)) return;

  let run = await store.getRun(scanId);
  if (!run) {
    // Queued before chunked runs existed, or created without a tier: it is a free scan.
    await store.createRun(scanId, "free", MAX_PAGES, now());
    run = await store.getRun(scanId);
  }
  if (!run) throw new Error(`Scan run missing: ${scanId}`);

  if (run.plannedAt === null) {
    await repo.markRunning(scanId);
    let robotsFailure: string | null = null;
    try {
      const discovery = await discoverScanUrls(scan, deps, run.pageLimit, { respectRobots: run.tier !== "free" });
      const robots = discovery.robots.status === "not_applied" ? null : { ...discovery.robots, status: discovery.robots.status };
      const chunkSize = chunkSizeFor(robots?.crawlDelayMs ?? 0);
      if (robots && discovery.prioritized.length === 0) {
        robotsFailure = robots.status === "unreachable" ? ROBOTS_UNREACHABLE_MESSAGE : ROBOTS_DISALLOWED_MESSAGE;
      }
      await store.savePlan(
        scanId,
        {
          siteFiles: discovery.siteFiles,
          searchCount: discovery.searchCount,
          chunks: splitIntoChunks<PrioritizedUrl>(discovery.prioritized, chunkSize),
          chunkSize,
          robots,
        },
        now(),
      );
    } catch (err) {
      await repo.markFailed(scanId, err instanceof Error ? err.message : "Unknown scan failure");
      throw err;
    }
    if (robotsFailure) {
      await repo.markFailed(scanId, robotsFailure);
      await store.markFinalized(scanId, now());
      await deps.onFinished?.(scanId);
      return;
    }
    run = (await store.getRun(scanId)) ?? run;
  }

  // First delivery, or a retry after the plan was stored: dispatch whatever is still pending.
  const pending = await store.pendingChunks(scanId);
  if (pending.length === 0) {
    await maybeFinalize(scanId, deps);
    return;
  }
  const [first, ...rest] = pending;
  // A paced run goes one chunk at a time: each chunk queues the next one (runChunkJob).
  if (run.crawlDelayMs <= 0) await sendAll(queue, chunkMessages(scanId, rest));
  await scheduleWatchdog(queue, scanId);
  await runChunkJob(scanId, first!, deps);
}

export async function runChunkJob(scanId: string, index: number, deps: PipelineDeps): Promise<void> {
  const { repo, store, site } = deps;
  const now = deps.now ?? Date.now;
  const scan = await repo.getScan(scanId);
  if (!scan || done(scan.status)) return;
  const run = await store.getRun(scanId);
  if (!run || run.finalizedAt !== null) return;
  const chunk = await store.getChunk(scanId, index);
  if (!chunk) return;

  const paced = run.crawlDelayMs > 0;
  if (chunk.status === "pending") {
    // Paced runs keep to one request per delay, so a chunk another invocation is still reading is left to it.
    if (paced && chunk.attempts > 0 && now() - chunk.updatedAt < PACED_CHUNK_STALE_MS) return;
    await store.noteAttempt(scanId, index, now());
    const { records } = await scanPlannedPages(chunk.urls, {
      site,
      origin: scan.origin,
      textLimitAt: (i) => textLimitFor(run.tier, index * run.chunkSize + i),
      pacer: paced ? createPacer(run.crawlDelayMs, deps.sleep, true) : null,
    });
    await store.completeChunk(scanId, chunk, records, now());
    if (paced) {
      const [next] = await store.pendingChunks(scanId);
      if (next !== undefined) {
        await deps.queue.send(
          { type: "scan-chunk", scanId, chunk: next },
          { delaySeconds: Math.ceil(run.crawlDelayMs / 1000) },
        );
      }
    }
  }
  await maybeFinalize(scanId, deps);
}

/** Finalize if every chunk is done and nobody else holds the claim. Returns whether this call finalized. */
async function maybeFinalize(scanId: string, deps: PipelineDeps, force = false): Promise<boolean> {
  const now = deps.now ?? Date.now;
  if (!(await deps.store.claimFinalize(scanId, now(), FINALIZE_STALE_MS, force))) return false;
  await finalizeClaimed(scanId, deps);
  return true;
}

export async function finalizeScanJob(scanId: string, deps: PipelineDeps): Promise<void> {
  await maybeFinalize(scanId, deps);
}

async function finalizeClaimed(scanId: string, deps: PipelineDeps): Promise<void> {
  const { repo, store } = deps;
  const now = deps.now ?? Date.now;
  const scan = await repo.getScan(scanId);
  const run = await store.getRun(scanId);
  if (!scan || !run) return;
  if (done(scan.status)) {
    await store.markFinalized(scanId, now());
    return;
  }

  const pages = await store.loadScoringPages(scanId);
  if (isCatastrophicFailure({ siteFiles: run.siteFiles, searchCount: run.searchCount, pages })) {
    await repo.markFailed(scanId, CATASTROPHIC_MESSAGE);
    await store.markFinalized(scanId, now());
    await deps.onFinished?.(scanId);
    return;
  }

  const scored = scoreStoredPages(pages, run.siteFiles);
  await repo.saveFindings(scanId, findingRecords(scored.findings));
  await repo.markComplete(scanId, scored.scoreTotal, scored.breakdown);
  await store.markFinalized(scanId, now());
  await queueOpsFollowUp(repo, scan, scored.scoreTotal);
  await deps.onFinished?.(scanId);
}

export async function watchdogJob(scanId: string, deps: PipelineDeps): Promise<void> {
  const { repo, store, queue } = deps;
  const now = deps.now ?? Date.now;
  const scan = await repo.getScan(scanId);
  if (!scan || done(scan.status)) return;
  const run = await store.getRun(scanId);
  if (!run || run.plannedAt === null || run.finalizedAt !== null) return;
  await store.bumpWatchdog(scanId, now());

  // Every chunk finished but the finalize was lost (or its claim went stale).
  if (await maybeFinalize(scanId, deps)) return;

  const pending = await store.pendingChunks(scanId);
  if (pending.length > 0 && now() - run.plannedAt >= deadlineFor(run)) {
    await maybeFinalize(scanId, deps, true);
    return;
  }
  if (run.crawlDelayMs > 0) {
    // Paced: restart the chain only if its current chunk has gone quiet.
    const first = pending[0] === undefined ? null : await store.getChunk(scanId, pending[0]);
    if (first && (first.attempts === 0 || now() - first.updatedAt >= PACED_CHUNK_STALE_MS)) {
      await sendAll(queue, chunkMessages(scanId, [first.index]));
    }
  } else {
    await sendAll(queue, chunkMessages(scanId, pending));
  }
  await scheduleWatchdog(queue, scanId);
}
