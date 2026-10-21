import { describe, expect, it } from "vitest";
import type { BoundSql } from "@/lib/cloudflare/sql";
import { createD1PipelineStore } from "@/lib/scan/d1-pipeline-store";
import { createD1ScanRepository, insertScan, loadScanByPublicToken } from "@/lib/scan/d1-store";
import {
  PACED_CHUNK_STALE_MS,
  ROBOTS_DISALLOWED_MESSAGE,
  ROBOTS_UNREACHABLE_MESSAGE,
  SCAN_DEADLINE_MS,
  chunkSizeFor,
  deadlineFor,
  planScanJob,
  runChunkJob,
  watchdogJob,
  type PipelineDeps,
} from "@/lib/scan/pipeline";
import { robotsNote } from "@/lib/scan/robots-note";
import type { ScanTier } from "@/lib/scan/tiers";
import { fakeQueue, fakeSite, type FakeSite } from "../helpers/fake-site";
import { memoryCheckDb } from "../helpers/memory-sql";

function paths(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

async function start(site: FakeSite, tier: ScanTier, pageLimit: number) {
  const db: BoundSql = memoryCheckDb();
  const queue = fakeQueue();
  const finished: string[] = [];
  const sleeps: number[] = [];
  const probed: string[] = [];
  const clock = { t: Date.parse("2026-10-21T15:00:00Z") };
  const deps: PipelineDeps = {
    site,
    probe: async (url) => {
      probed.push(url);
      return { exists: false, status: 404 };
    },
    repo: createD1ScanRepository(db),
    store: createD1PipelineStore(db),
    queue,
    now: () => clock.t,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onFinished: async (id) => {
      finished.push(id);
    },
  };
  const scan = await insertScan(db, {
    domain: "acme.example",
    origin: "https://acme.example",
    source: "public",
    ...(tier === "free" ? {} : { tier: { tier, pageLimit } }),
  });
  return { db, queue, finished, sleeps, probed, clock, deps, scan };
}

const SITE_PATHS = ["/about", "/contact", ...paths("/blog/post-", 120), ...paths("/private/doc-", 30)];

describe("deep scans follow robots.txt", () => {
  it("skips disallowed URLs (Allow wins by longest match) and records the count", async () => {
    const site = fakeSite({
      paths: SITE_PATHS,
      robots:
        "User-agent: *\nDisallow: /\n\nUser-agent: SchemaAEOScanner\nDisallow: /private/\nAllow: /private/doc-1$\nDisallow: /blog/post-1\n",
    });
    const { db, queue, deps, scan, probed } = await start(site, "deep-200", 200);
    await planScanJob(scan.id, deps);
    for (const body of queue.take((b) => b.type === "scan-chunk")) {
      await runChunkJob(String(body.scanId), Number(body.chunk), deps);
    }
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("complete");
    const urls = loaded!.pages.map((p) => p.url);
    expect(urls).toContain("https://acme.example/private/doc-1");
    expect(urls.some((u) => /\/private\/doc-(?!1$)/.test(u))).toBe(false);
    // Disallow: /blog/post-1 is a prefix: post-1, post-10..19, post-100..120.
    expect(urls.some((u) => /\/blog\/post-1\d*$/.test(u))).toBe(false);
    expect(urls).toContain("https://acme.example/blog/post-2");
    // Nothing disallowed was fetched at all, nor probed.
    expect(site.extracted.some((u) => u.includes("/private/doc-2"))).toBe(false);
    expect(probed.every((u) => !u.includes("/private/"))).toBe(true);
    // 29 private docs + 32 blog posts.
    expect(loaded?.progress).toMatchObject({ robotsStatus: "ok", robotsSkipped: 61, crawlDelayMs: 0 });
    expect(robotsNote(loaded?.progress)).toContain("61 URLs it disallows were skipped");
  });

  it("allows everything when robots.txt is missing (404)", async () => {
    const site = fakeSite({ paths: SITE_PATHS, robots: { status: "404" } });
    const { db, queue, deps, scan } = await start(site, "deep-200", 200);
    await planScanJob(scan.id, deps);
    for (const body of queue.take((b) => b.type === "scan-chunk")) {
      await runChunkJob(String(body.scanId), Number(body.chunk), deps);
    }
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("complete");
    expect(loaded?.pages.length).toBe(153);
    expect(loaded?.progress).toMatchObject({ robotsStatus: "missing", robotsSkipped: 0 });
  });

  it("reads no pages and fails clearly when robots.txt answers 5xx", async () => {
    const site = fakeSite({ paths: SITE_PATHS, robots: { status: "503" } });
    const { db, queue, deps, scan, finished } = await start(site, "deep-1000", 1000);
    await planScanJob(scan.id, deps);
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("failed");
    expect(loaded?.pages).toHaveLength(0);
    expect(site.extracted.some((u) => u.includes("/blog/"))).toBe(false);
    expect(queue.messages.filter((m) => m.body.type === "scan-chunk")).toHaveLength(0);
    expect(finished).toEqual([scan.id]);
    const row = await db.prepare("SELECT error_message FROM readiness_scans WHERE id = ?").bind(scan.id).first<{ error_message: string }>();
    expect(row?.error_message).toBe(ROBOTS_UNREACHABLE_MESSAGE);
    expect(robotsNote(loaded?.progress)).toContain("could not be read");
  });

  it("fails clearly when robots.txt disallows every page we found", async () => {
    const site = fakeSite({ paths: SITE_PATHS, robots: "User-agent: *\nDisallow: /\n" });
    const { db, deps, scan } = await start(site, "deep-200", 200);
    await planScanJob(scan.id, deps);
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("failed");
    const row = await db.prepare("SELECT error_message FROM readiness_scans WHERE id = ?").bind(scan.id).first<{ error_message: string }>();
    expect(row?.error_message).toBe(ROBOTS_DISALLOWED_MESSAGE);
    expect(loaded?.progress).toMatchObject({ robotsStatus: "ok", pagesTotal: 0 });
  });

  it("leaves the free scan exactly as before, robots.txt or not", async () => {
    const site = fakeSite({ paths: SITE_PATHS, robots: "User-agent: *\nDisallow: /\nCrawl-delay: 10\n" });
    const { db, deps, scan, sleeps } = await start(site, "free", 40);
    await planScanJob(scan.id, deps);
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("complete");
    expect(loaded?.pages).toHaveLength(40);
    expect(sleeps).toEqual([]);
    expect(loaded?.progress).toMatchObject({ robotsStatus: null, robotsSkipped: 0, crawlDelayMs: 0 });
    expect(robotsNote(loaded?.progress)).toBeNull();
  });

  it("honours Crawl-delay: one request per delay, small chunks run one after another, a longer deadline", async () => {
    const site = fakeSite({ paths: SITE_PATHS, robots: "User-agent: *\nCrawl-delay: 30\n" });
    const { db, queue, deps, scan, sleeps, clock } = await start(site, "deep-200", 200);
    expect(chunkSizeFor(10_000)).toBe(24);
    expect(chunkSizeFor(1_000)).toBe(50);

    await planScanJob(scan.id, deps);
    const run = await deps.store.getRun(scan.id);
    expect(run).toMatchObject({ crawlDelayMs: 10_000, chunkSize: 24, pagesTotal: 153, chunksTotal: 7 });
    // Paced pages are fetched one at a time.
    expect(site.extracted.filter((u) => u.includes("/blog/")).length).toBeGreaterThan(0);
    expect(sleeps.length).toBeGreaterThanOrEqual(24);
    expect(sleeps.every((ms) => ms > 0 && ms <= 10_000)).toBe(true);
    // No fan-out: chunk 0 ran inline and queued only chunk 1, after the delay.
    const chunkMessages = queue.messages.filter((m) => m.body.type === "scan-chunk");
    expect(chunkMessages.map((m) => [m.body.chunk, m.delaySeconds])).toEqual([[1, 10]]);

    // The watchdog leaves a chunk that was just attempted to its invocation.
    await deps.store.noteAttempt(scan.id, 1, clock.t);
    queue.take((b) => b.type === "scan-chunk");
    await watchdogJob(scan.id, deps);
    expect(queue.messages.filter((m) => m.body.type === "scan-chunk")).toHaveLength(0);
    // ...and restarts it once it has gone quiet.
    clock.t += PACED_CHUNK_STALE_MS;
    await watchdogJob(scan.id, deps);
    expect(queue.messages.filter((m) => m.body.type === "scan-chunk").map((m) => m.body.chunk)).toEqual([1]);

    // Follow the chain to the end.
    for (let guard = 0; guard < 20; guard += 1) {
      const [next] = queue.take((b) => b.type === "scan-chunk");
      if (!next) break;
      await runChunkJob(String(next.scanId), Number(next.chunk), deps);
    }
    const loaded = await loadScanByPublicToken(db, scan.token);
    expect(loaded?.scan.status).toBe("complete");
    expect(loaded?.pages).toHaveLength(153);
    expect(loaded?.progress).toMatchObject({ crawlDelayMs: 10_000, partial: false });
    expect(robotsNote(loaded?.progress)).toContain("We waited 10 s between requests");

    // 153 pages at 10 s: the deadline grows past 30 minutes.
    expect(deadlineFor({ crawlDelayMs: 10_000, pagesTotal: 153, chunksTotal: 7 })).toBe(
      SCAN_DEADLINE_MS + (153 + 14) * 10_000,
    );
    expect(deadlineFor({ crawlDelayMs: 0, pagesTotal: 1000, chunksTotal: 20 })).toBe(SCAN_DEADLINE_MS);
  });
});
