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
 *   finalize, and after SCAN_DEADLINE_MS finalizes with what was read (the run is marked partial).
 */
import type { JobQueue, QueueMessage } from "@/lib/cloudflare/sql";
import type { PrioritizedUrl } from "@/lib/prioritize-urls";
import { MAX_PAGES } from "@/lib/scoring/constants";
import type { ScanPipelineStore } from "./d1-pipeline-store";
import {
  CATASTROPHIC_MESSAGE,
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
/** Queues accept at most 100 messages per sendBatch. */
const SEND_BATCH_MAX = 100;

export type PipelineDeps = Pick<RunScanDeps, "site" | "probe"> & {
  repo: ScanRepository;
  store: ScanPipelineStore;
  queue: JobQueue;
  now?: () => number;
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
    try {
      const discovery = await discoverScanUrls(scan, deps, run.pageLimit);
      await store.savePlan(
        scanId,
        {
          siteFiles: discovery.siteFiles,
          searchCount: discovery.searchCount,
          chunks: splitIntoChunks<PrioritizedUrl>(discovery.prioritized),
        },
        now(),
      );
    } catch (err) {
      await repo.markFailed(scanId, err instanceof Error ? err.message : "Unknown scan failure");
      throw err;
    }
  }

  // First delivery, or a retry after the plan was stored: dispatch whatever is still pending.
  const pending = await store.pendingChunks(scanId);
  if (pending.length === 0) {
    await maybeFinalize(scanId, deps);
    return;
  }
  const [first, ...rest] = pending;
  await sendAll(queue, chunkMessages(scanId, rest));
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

  if (chunk.status === "pending") {
    await store.noteAttempt(scanId, index, now());
    const { records } = await scanPlannedPages(chunk.urls, {
      site,
      origin: scan.origin,
      textLimitAt: (i) => textLimitFor(run.tier, index * CHUNK_SIZE + i),
    });
    await store.completeChunk(scanId, chunk, records, now());
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
  if (pending.length > 0 && now() - run.plannedAt >= SCAN_DEADLINE_MS) {
    await maybeFinalize(scanId, deps, true);
    return;
  }
  await sendAll(queue, chunkMessages(scanId, pending));
  await scheduleWatchdog(queue, scanId);
}
