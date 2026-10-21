import { describe, expect, it } from "vitest";
import { createD1PipelineStore } from "@/lib/scan/d1-pipeline-store";
import { createD1ScanRepository, insertScan, loadScanByPublicToken } from "@/lib/scan/d1-store";
import { runScan } from "@/lib/scan/orchestrator";
import { DEEP_SCRAPE_LIMIT, SCRAPE_LIMIT } from "@/lib/scan/page-record";
import {
  FINALIZE_STALE_MS,
  SCAN_DEADLINE_MS,
  finalizeScanJob,
  planScanJob,
  runChunkJob,
  splitIntoChunks,
  watchdogJob,
  type PipelineDeps,
} from "@/lib/scan/pipeline";
import { CHUNK_SIZE } from "@/lib/scan/tiers";
import type { BoundSql } from "@/lib/cloudflare/sql";
import { fakeQueue, fakeSite, type FakeSite } from "../helpers/fake-site";
import { memoryCheckDb } from "../helpers/memory-sql";

const noProbe = async () => ({ exists: false, status: 404 });

function paths(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

function setup(db: BoundSql, site: FakeSite, clock = { t: Date.parse("2026-10-21T15:00:00Z") }) {
  const queue = fakeQueue();
  const finished: string[] = [];
  const deps: PipelineDeps = {
    site,
    probe: noProbe,
    repo: createD1ScanRepository(db),
    store: createD1PipelineStore(db),
    queue,
    now: () => clock.t,
    onFinished: async (id) => {
      finished.push(id);
    },
  };
  return { deps, queue, finished, clock };
}

async function drainChunks(queue: ReturnType<typeof fakeQueue>, deps: PipelineDeps) {
  for (const body of queue.take((b) => b.type === "scan-chunk")) {
    await runChunkJob(String(body.scanId), Number(body.chunk), deps);
  }
}

async function count(db: BoundSql, sql: string, ...args: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...args).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

describe("splitIntoChunks", () => {
  it("cuts a plan into chunks of 50 with a short last chunk", () => {
    const chunks = splitIntoChunks(Array.from({ length: 1000 }, (_, i) => i));
    expect(chunks).toHaveLength(20);
    expect(chunks.every((c) => c.length === CHUNK_SIZE)).toBe(true);
    expect(splitIntoChunks(Array.from({ length: 123 }, (_, i) => i)).map((c) => c.length)).toEqual([50, 50, 23]);
    expect(splitIntoChunks([])).toEqual([]);
  });
});

describe("chunked scan pipeline", () => {
  it("runs a free 40-page scan in one invocation, with the same score and pages as the one-shot scan", async () => {
    const site = fakeSite({ paths: ["/about", "/contact", "/services", ...paths("/blog/post-", 60)], withSchema: ["/"] });

    const db = memoryCheckDb();
    const { deps, queue, finished } = setup(db, site);
    const scan = await insertScan(db, { domain: "acme.example", origin: "https://acme.example", source: "public" });
    await planScanJob(scan.id, deps);

    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("complete");
    expect(loaded?.pages).toHaveLength(40);
    expect(loaded?.progress).toEqual({
      tier: "free",
      pagesDone: 40,
      pagesTotal: 40,
      partial: false,
      robotsStatus: null,
      robotsSkipped: 0,
      crawlDelayMs: 0,
    });
    // One chunk, run inline: no chunk messages, only the delayed watchdog (which then does nothing).
    expect(queue.messages.map((m) => m.body.type)).toEqual(["scan-watchdog"]);
    expect(queue.messages[0]!.delaySeconds).toBeGreaterThan(0);
    expect(finished).toEqual([scan.id]);
    await watchdogJob(scan.id, deps);
    expect(queue.messages).toHaveLength(1);

    // The one-shot path on a fresh database gives the same result.
    const db2 = memoryCheckDb();
    const repo2 = createD1ScanRepository(db2);
    const scan2 = await insertScan(db2, { domain: "acme.example", origin: "https://acme.example", source: "public" });
    await runScan(scan2.id, { site, repo: repo2, probe: noProbe });
    const loaded2 = await loadScanByPublicToken(db2, scan2.token);
    expect(loaded?.scan.score_total).toBe(loaded2?.scan.score_total);
    expect(loaded?.scan.score_breakdown).toEqual(loaded2?.scan.score_breakdown);
    expect(loaded?.pages.map((p) => [p.url, p.pageType, p.fetchStatus, p.hasJsonLd])).toEqual(
      loaded2?.pages.map((p) => [p.url, p.pageType, p.fetchStatus, p.hasJsonLd]),
    );
    expect(loaded?.findings.map((f) => f.code).sort()).toEqual(loaded2?.findings.map((f) => f.code).sort());
  });

  it("fans a 200-page deep scan out over chunk messages and finalizes once from stored rows", async () => {
    const site = fakeSite({
      paths: ["/about", "/contact", ...paths("/blog/post-", 250), ...paths("/portfolio/item-", 80)],
      failing: ["/blog/post-7"],
      childSize: 40,
    });
    const db = memoryCheckDb();
    const { deps, queue, finished } = setup(db, site);
    const scan = await insertScan(db, {
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
      tier: { tier: "deep-200", pageLimit: 200 },
    });

    await planScanJob(scan.id, deps);
    // Chunk 0 ran inline; chunks 1-3 are queued with the watchdog.
    expect(queue.messages.filter((m) => m.body.type === "scan-chunk").map((m) => m.body.chunk)).toEqual([1, 2, 3]);
    const progress = (await loadScanByPublicToken(db, scan.token, { pages: "none" }))?.progress;
    expect(progress).toMatchObject({ tier: "deep-200", pagesDone: 50, pagesTotal: 200 });
    expect((await loadScanByPublicToken(db, scan.token, { pages: "none" }))?.scan.status).toBe("running");

    await drainChunks(queue, deps);
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("complete");
    expect(loaded?.pages).toHaveLength(200);
    expect(new Set(loaded?.pages.map((p) => p.url)).size).toBe(200);
    expect(loaded?.progress).toMatchObject({ pagesDone: 200, pagesTotal: 200, partial: false });
    expect(finished).toEqual([scan.id]);
    // Sitemap index: more than the free scan's 5 child sitemaps were read.
    expect(site.extracted.filter((u) => /sitemap-\d+\.xml$/.test(u)).length).toBeGreaterThan(5);
    // The type cap still applies: blog posts do not take every slot.
    expect(loaded?.pages.filter((p) => p.url.includes("/portfolio/")).length).toBeGreaterThan(0);
    expect(loaded?.findings.some((f) => f.code === "PAGES_FETCH_FAILED" && !f.passed)).toBe(true);
    // A late finalize message is a no-op.
    await finalizeScanJob(scan.id, deps);
    expect(finished).toEqual([scan.id]);
  });

  it("keeps full scraped text for the first 40 pages and an excerpt after that", async () => {
    const site = fakeSite({ paths: paths("/blog/post-", 120) });
    const db = memoryCheckDb();
    const { deps, queue } = setup(db, site);
    const scan = await insertScan(db, {
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
      tier: { tier: "deep-200", pageLimit: 100 },
    });
    await planScanJob(scan.id, deps);
    await drainChunks(queue, deps);
    const loaded = await loadScanByPublicToken(db, scan.token);
    const lengths = (loaded?.pages ?? []).map((p) => String(p.evidence?.scrapedText ?? "").length);
    expect(lengths).toHaveLength(100);
    expect(Math.max(...lengths.slice(0, 40))).toBeGreaterThan(DEEP_SCRAPE_LIMIT);
    expect(Math.max(...lengths.slice(0, 40))).toBeLessThanOrEqual(SCRAPE_LIMIT);
    expect(Math.max(...lengths.slice(50))).toBeLessThanOrEqual(DEEP_SCRAPE_LIMIT);
  });

  it("ignores a duplicate chunk delivery: no duplicate rows, pages_done counted once", async () => {
    const site = fakeSite({ paths: paths("/blog/post-", 150) });
    const db = memoryCheckDb();
    const { deps, queue } = setup(db, site);
    const scan = await insertScan(db, {
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
      tier: { tier: "deep-200", pageLimit: 120 },
    });
    await planScanJob(scan.id, deps);
    await runChunkJob(scan.id, 1, deps);
    await runChunkJob(scan.id, 1, deps);
    const store = createD1PipelineStore(db);
    expect((await store.getRun(scan.id))?.pagesDone).toBe(100);
    expect(await count(db, "SELECT COUNT(*) AS n FROM readiness_scan_pages WHERE scan_id = ?", scan.id)).toBe(100);

    // A chunk that ran again after a crash between writing and counting replaces its rows instead of adding to them.
    const chunk = (await store.getChunk(scan.id, 2))!;
    const first = await store.completeChunk(scan.id, chunk, [], deps.now!());
    expect(first.counted).toBe(true);
    const again = await store.completeChunk(scan.id, chunk, [], deps.now!());
    expect(again.counted).toBe(false);
    expect((await store.getRun(scan.id))?.pagesDone).toBe(120);
    queue.take(() => true);
  });

  it("retries a chunk that failed part-way, then completes", async () => {
    const site = fakeSite({ paths: paths("/blog/post-", 150) });
    const db = memoryCheckDb();
    const { deps, queue } = setup(db, site);
    const scan = await insertScan(db, {
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
      tier: { tier: "deep-200", pageLimit: 100 },
    });
    await planScanJob(scan.id, deps);
    const chunkMsg = queue.take((b) => b.type === "scan-chunk")[0]!;
    const store = createD1PipelineStore(db);
    const chunk = (await store.getChunk(scan.id, Number(chunkMsg.chunk)))!;
    site.throwOnce.add(chunk.urls[3]!.url);

    await expect(runChunkJob(scan.id, chunk.index, deps)).rejects.toThrow("network down");
    expect((await store.getChunk(scan.id, chunk.index))?.status).toBe("pending");
    expect((await store.getRun(scan.id))?.finalizedAt).toBeNull();
    expect((await loadScanByPublicToken(db, scan.token, { pages: "none" }))?.scan.status).toBe("running");

    await runChunkJob(scan.id, chunk.index, deps); // queue retry
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("complete");
    expect(loaded?.pages).toHaveLength(100);
    expect((await store.getChunk(scan.id, chunk.index))?.attempts).toBe(2);
  });

  it("re-dispatches pending chunks on a duplicate plan delivery without re-planning", async () => {
    const site = fakeSite({ paths: paths("/blog/post-", 150) });
    const db = memoryCheckDb();
    const { deps, queue } = setup(db, site);
    const scan = await insertScan(db, {
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
      tier: { tier: "deep-200", pageLimit: 150 },
    });
    await planScanJob(scan.id, deps);
    queue.take(() => true);
    const store = createD1PipelineStore(db);
    const plannedAt = (await store.getRun(scan.id))?.plannedAt;

    await planScanJob(scan.id, deps);
    const run = await store.getRun(scan.id);
    expect(run?.plannedAt).toBe(plannedAt);
    expect(run?.pagesTotal).toBe(150);
    expect(await count(db, "SELECT COUNT(*) AS n FROM readiness_scan_chunks WHERE scan_id = ?", scan.id)).toBe(3);
    // Chunk 1 ran inline this time, chunk 2 was sent again.
    expect(queue.messages.filter((m) => m.body.type === "scan-chunk").map((m) => m.body.chunk)).toEqual([2]);
  });

  it("lets exactly one caller claim finalize, and lets a stale claim be taken over", async () => {
    const site = fakeSite({ paths: paths("/blog/post-", 10) });
    const db = memoryCheckDb();
    const store = createD1PipelineStore(db);
    const scan = await insertScan(db, { domain: "acme.example", origin: "https://acme.example", source: "public" });
    const t = Date.parse("2026-10-21T15:00:00Z");
    await store.createRun(scan.id, "free", 40, t);
    await store.savePlan(scan.id, { siteFiles: { robotsTxt: null, sitemapXml: null, llmsTxt: null, llmsFullTxt: null }, searchCount: 0, chunks: [[{ url: "https://acme.example/", pageType: "home", source: "home" }]] }, t);
    expect(await store.claimFinalize(scan.id, t, FINALIZE_STALE_MS)).toBe(false); // chunk still pending
    await store.completeChunk(scan.id, (await store.getChunk(scan.id, 0))!, [], t);
    expect(await store.claimFinalize(scan.id, t, FINALIZE_STALE_MS)).toBe(true);
    expect(await store.claimFinalize(scan.id, t + 1000, FINALIZE_STALE_MS)).toBe(false);
    expect(await store.claimFinalize(scan.id, t + FINALIZE_STALE_MS + 1, FINALIZE_STALE_MS)).toBe(true);
    await store.markFinalized(scan.id, t);
    expect(await store.claimFinalize(scan.id, t + 10 * FINALIZE_STALE_MS, FINALIZE_STALE_MS)).toBe(false);
    void site;
  });

  it("watchdog re-sends a lost chunk, then finalizes a stuck scan as partial after the deadline", async () => {
    const site = fakeSite({ paths: paths("/blog/post-", 200) });
    const db = memoryCheckDb();
    const { deps, queue, clock, finished } = setup(db, site);
    const scan = await insertScan(db, {
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
      tier: { tier: "deep-200", pageLimit: 200 },
    });
    await planScanJob(scan.id, deps);
    // Chunks 1 and 2 arrive; chunk 3's message is lost.
    const sent = queue.take((b) => b.type === "scan-chunk");
    for (const body of sent.filter((b) => b.chunk !== 3)) await runChunkJob(scan.id, Number(body.chunk), deps);
    queue.take(() => true);

    clock.t += 10 * 60 * 1000;
    await watchdogJob(scan.id, deps);
    expect(queue.messages.map((m) => [m.body.type, m.body.chunk])).toEqual([
      ["scan-chunk", 3],
      ["scan-watchdog", undefined],
    ]);
    queue.take(() => true); // lost again

    clock.t += SCAN_DEADLINE_MS;
    await watchdogJob(scan.id, deps);
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("complete");
    expect(loaded?.pages).toHaveLength(150);
    expect(loaded?.progress).toMatchObject({ pagesDone: 150, pagesTotal: 200, partial: true });
    expect(finished).toEqual([scan.id]);

    // The late chunk is ignored once the scan is finalized.
    await runChunkJob(scan.id, 3, deps);
    expect((await loadScanByPublicToken(db, scan.token))?.pages).toHaveLength(150);
  });

  it("treats a scan queued without a run row (HQ, older code) as a free scan", async () => {
    const site = fakeSite({ paths: ["/about"] });
    const db = memoryCheckDb();
    const { deps } = setup(db, site);
    const scan = await insertScan(db, { domain: "acme.example", origin: "https://acme.example", source: "ops" });
    await planScanJob(scan.id, deps);
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("complete");
    expect(loaded?.progress).toMatchObject({ tier: "free", pagesDone: 2, pagesTotal: 2 });
  });

  it("marks a scan failed when nothing on the site can be read", async () => {
    const site = fakeSite({ paths: [], failing: ["/"], llmsTxt: null });
    const brokenSite: FakeSite = {
      ...site,
      async extract(list) {
        return list.map((url) => ({ url, content: "", error: "500" }));
      },
    };
    const db = memoryCheckDb();
    const { deps, finished } = setup(db, brokenSite);
    const scan = await insertScan(db, { domain: "acme.example", origin: "https://acme.example", source: "public" });
    await planScanJob(scan.id, deps);
    expect((await loadScanByPublicToken(db, scan.token))?.scan.status).toBe("failed");
    expect(finished).toEqual([scan.id]);
  });
});
