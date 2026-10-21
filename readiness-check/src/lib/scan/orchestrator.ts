import { detectJsonLd } from "@/lib/detect/jsonld";
import { parseSitemapUrls } from "@/lib/detect/sitemap";
import { computeOpsPriority } from "@/lib/ops/priority";
import type { ParallelExtractResult, ParallelSearchResult } from "@/lib/parallel/types";
import { probeUrl, type ProbeResult } from "@/lib/fetch-html";
import { prioritizeUrls, templateSeedUrls, type PrioritizedUrl } from "@/lib/prioritize-urls";
import { MAX_PAGES } from "@/lib/scoring/constants";
import { scoreScan } from "@/lib/scoring/score";
import type { DetectedPage, SiteFiles } from "@/lib/types";
import { reclassifyPageType } from "@/lib/scan/reclassify-page-type";
import { attachFactsToPages } from "./attach-page-facts";
import { SCRAPE_LIMIT, scanPageRecord } from "./page-record";
import type { ScanFindingRecord, ScanPageRecord, ScanRecord, ScanRepository } from "./repository";
import {
  contentByNormalizedUrl,
  enrichPagesWithSchemaHtml,
  normalizeExtractUrlKey,
} from "./schema-html";

const PAGE_EXTRACT_OBJECTIVE =
  "Extract all application/ld+json script blocks and main page content";

const SITE_FILE_PATHS = ["robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt"] as const;

export type ScanSiteClient = {
  extract(urls: string[], opts?: { objective?: string; fullContent?: boolean }): Promise<ParallelExtractResult[]>;
  search(objective: string, opts: { includeDomains: string[]; maxResults?: number }): Promise<ParallelSearchResult[]>;
};

export type RunScanDeps = {
  site: ScanSiteClient;
  repo: ScanRepository;
  /** Existence check for guessed template URLs. Defaults to a short HEAD/GET with the scanner user agent. */
  probe?: (url: string) => Promise<ProbeResult>;
};

function urlKey(url: string): string {
  return normalizeExtractUrlKey(url);
}

/**
 * Guessed template URLs for page types the site does not publish, kept only when a cheap check says they exist,
 * and only when there is room under MAX_PAGES. A guess that redirects onto a page already in the list is dropped.
 */
async function checkedSeeds(
  input: { origin: string; sitemapUrls: string[]; searchUrls: string[]; maxPages: number },
  probe: (url: string) => Promise<ProbeResult>,
): Promise<PrioritizedUrl[]> {
  const real = prioritizeUrls({ ...input, seedUrls: [] });
  const room = input.maxPages - real.length;
  if (room <= 0) return [];
  const candidates = templateSeedUrls(input);
  if (candidates.length === 0) return [];
  const taken = new Set(real.map((entry) => urlKey(entry.url)));
  const results = await Promise.all(candidates.map((seed) => probe(seed.url)));
  const kept: PrioritizedUrl[] = [];
  candidates.forEach((seed, index) => {
    const result = results[index];
    if (!result?.exists) return;
    const landed = urlKey(result.finalUrl ?? seed.url);
    if (taken.has(landed)) return;
    taken.add(landed);
    kept.push(seed);
  });
  return kept.slice(0, room);
}

function originBase(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

function siteFileUrl(origin: string, file: string): string {
  return `${originBase(origin)}/${file}`;
}

function extractBody(result: ParallelExtractResult | undefined): string | null {
  if (!result || result.error) return null;
  if (!result.content) return null;
  return result.content;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/** Free scans read at most 5 child sitemaps, as before. Deep scans read more, in polite batches. */
const FREE_CHILD_SITEMAPS = 5;
const DEEP_CHILD_SITEMAPS = 50;
const SITEMAP_BATCH = 5;

export type SitemapLimits = {
  /** Child sitemaps to read from a sitemap index (nested indexes count too). */
  maxChildren: number;
  /** Stop once this many page URLs are collected. Enough spare for the type caps to choose from. */
  maxUrls: number;
};

export function sitemapLimits(maxPages: number): SitemapLimits {
  if (maxPages <= MAX_PAGES) return { maxChildren: FREE_CHILD_SITEMAPS, maxUrls: Number.POSITIVE_INFINITY };
  return { maxChildren: DEEP_CHILD_SITEMAPS, maxUrls: maxPages * 10 };
}

export async function resolveSitemapUrls(
  site: ScanSiteClient,
  sitemapXml: string | null,
  limits: SitemapLimits = sitemapLimits(MAX_PAGES),
): Promise<string[]> {
  if (!sitemapXml) return [];

  if (!isSitemapIndex(sitemapXml)) {
    return parseSitemapUrls(sitemapXml).slice(0, limits.maxUrls);
  }

  const urls = new Set<string>();
  const queue = parseSitemapUrls(sitemapXml);
  const seenChildren = new Set<string>(queue);
  let read = 0;
  while (queue.length > 0 && read < limits.maxChildren && urls.size < limits.maxUrls) {
    const batch = queue.splice(0, Math.min(SITEMAP_BATCH, limits.maxChildren - read));
    read += batch.length;
    const childResults = await site.extract(batch, { fullContent: true });
    for (const child of childResults) {
      const body = extractBody(child);
      if (!body) continue;
      const locs = parseSitemapUrls(body);
      if (isSitemapIndex(body)) {
        // A nested index: queue its children (deep scans only reach them; free scans stop at 5 reads anyway).
        for (const loc of locs) {
          if (seenChildren.has(loc)) continue;
          seenChildren.add(loc);
          queue.push(loc);
        }
        continue;
      }
      for (const loc of locs) {
        if (urls.size >= limits.maxUrls) break;
        urls.add(loc);
      }
    }
  }
  return [...urls];
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export function isCatastrophicFailure(input: {
  siteFiles: SiteFiles;
  searchCount: number;
  pages: Array<{ pageType: string; fetchStatus: string }>;
}): boolean {
  const { siteFiles, searchCount, pages } = input;
  const noSiteFiles =
    !siteFiles.robotsTxt && !siteFiles.sitemapXml && !siteFiles.llmsTxt && !siteFiles.llmsFullTxt;
  const homeFailed =
    pages.find((p) => p.pageType === "home")?.fetchStatus === "failed" ||
    pages.every((p) => p.fetchStatus === "failed");
  return noSiteFiles && searchCount === 0 && homeFailed;
}

export const CATASTROPHIC_MESSAGE =
  "Catastrophic scan failure: no site files, search results, or fetchable home page";

export type ScanDiscovery = {
  siteFiles: SiteFiles;
  searchCount: number;
  /** Every URL the scan will read, in priority order, at most `maxPages`. */
  prioritized: PrioritizedUrl[];
};

/** Plan step: site files, search, sitemap (index-aware), checked guesses, then the prioritized page list. */
export async function discoverScanUrls(
  scan: Pick<ScanRecord, "origin" | "domain">,
  deps: Pick<RunScanDeps, "site" | "probe">,
  maxPages: number = MAX_PAGES,
): Promise<ScanDiscovery> {
  const { site } = deps;
  const base = originBase(scan.origin);
  const siteFileUrls = SITE_FILE_PATHS.map((file) => siteFileUrl(scan.origin, file));

  const siteFileResults = await site.extract(siteFileUrls, { fullContent: true });
  const siteFileMap = contentByNormalizedUrl(siteFileResults);
  const fileBody = (file: string) =>
    extractBody(siteFileMap.get(normalizeExtractUrlKey(siteFileUrl(scan.origin, file))));

  const siteFiles: SiteFiles = {
    robotsTxt: fileBody("robots.txt"),
    sitemapXml: fileBody("sitemap.xml"),
    llmsTxt: fileBody("llms.txt"),
    llmsFullTxt: fileBody("llms-full.txt"),
  };

  const searchResults = await site.search(`Find important pages on ${scan.domain}`, {
    includeDomains: [scan.domain],
    maxResults: Math.min(maxPages, 200),
  });
  const searchUrls = searchResults.map((r) => r.url).filter(Boolean);

  const sitemapUrls = await resolveSitemapUrls(site, siteFiles.sitemapXml, sitemapLimits(maxPages));

  const seedUrls = await checkedSeeds(
    { origin: base, sitemapUrls, searchUrls, maxPages },
    deps.probe ?? ((url) => probeUrl(url)),
  );
  const prioritized = prioritizeUrls({ origin: base, sitemapUrls, searchUrls, seedUrls, maxPages });
  return { siteFiles, searchCount: searchUrls.length, prioritized };
}

export type ScannedPages = {
  /** Rows to store. Guessed URLs that could not be read are left out, not counted as failures. */
  records: ScanPageRecord[];
};

/**
 * Chunk step: read a slice of the planned URLs (10 at a time), detect JSON-LD, attach facts, reclassify.
 * Nothing is kept after the rows are built, so memory is bounded by one slice.
 * `textLimitAt(i)` gives the scraped-text cap for the i-th entry of `entries`.
 */
export async function scanPlannedPages(
  entries: PrioritizedUrl[],
  input: { site: ScanSiteClient; origin: string; textLimitAt?: (index: number) => number },
): Promise<ScannedPages> {
  const { site } = input;
  const base = originBase(input.origin);
  const guessed = new Set(entries.filter((entry) => entry.source === "seed").map((entry) => entry.url));

  const pageExtractResults: ParallelExtractResult[] = [];
  for (const batch of chunk(
    entries.map((p) => p.url),
    10,
  )) {
    const batchResults = await site.extract(batch, {
      objective: PAGE_EXTRACT_OBJECTIVE,
      fullContent: false,
    });
    pageExtractResults.push(...batchResults);
  }

  const pageResultMap = contentByNormalizedUrl(pageExtractResults);

  const markdownByUrl = new Map<string, string>();
  const extractBlocksByUrl = new Map<string, unknown[]>();
  const textLimitByUrl = new Map<string, number>();

  // A guessed URL that still cannot be extracted was never the site's page: drop it instead of counting a failure.
  const reachable = entries.filter((entry, index) => {
    textLimitByUrl.set(entry.url, input.textLimitAt?.(index) ?? SCRAPE_LIMIT);
    if (!guessed.has(entry.url)) return true;
    const extracted = pageResultMap.get(normalizeExtractUrlKey(entry.url));
    return Boolean(extracted?.content) && !extracted?.error;
  });

  const draftPages: DetectedPage[] = reachable.map((entry) => {
    const extracted = pageResultMap.get(normalizeExtractUrlKey(entry.url));
    const ok = Boolean(extracted?.content) && !extracted?.error;
    const content = extracted?.content ?? "";
    const detection = detectJsonLd(content);
    if (ok) markdownByUrl.set(entry.url, content);
    if (detection.blocks.length > 0) extractBlocksByUrl.set(entry.url, detection.blocks);
    return {
      url: entry.url,
      pageType: entry.pageType,
      fetchStatus: ok ? "ok" : "failed",
      hasJsonLd: detection.hasJsonLd,
      schemaTypes: detection.schemaTypes,
      rawContent: content || undefined,
    };
  });

  // Pages whose extract result is HTML are read as is; other backends get a capped HTML GET to recover schema.
  const enriched = await enrichPagesWithSchemaHtml(draftPages);
  const jsonLdBlocksByUrl = new Map(extractBlocksByUrl);
  for (const [url, blocks] of enriched.jsonLdBlocksByUrl) {
    jsonLdBlocksByUrl.set(url, blocks);
  }

  const pagesWithFacts = attachFactsToPages(enriched.pages, {
    markdownByUrl,
    htmlByUrl: enriched.htmlByUrl,
    jsonLdBlocksByUrl,
  });

  const pages = pagesWithFacts.map((page) => {
    if (page.fetchStatus !== "ok") return page;
    const html = enriched.htmlByUrl.get(page.url);
    const nextType = reclassifyPageType({
      url: page.url,
      origin: base,
      currentType: page.pageType,
      html,
      markdown: markdownByUrl.get(page.url) ?? page.rawContent,
    });
    return nextType === page.pageType ? page : { ...page, pageType: nextType };
  });

  return {
    records: pages.map((page) =>
      scanPageRecord(
        page,
        markdownByUrl.get(page.url) ?? page.rawContent ?? "",
        textLimitByUrl.get(page.url) ?? SCRAPE_LIMIT,
      ),
    ),
  };
}

/** Finalize step: score from stored rows. Scoring reads only type, fetch status and schema types. */
export function scoreStoredPages(records: ScanPageRecord[], siteFiles: SiteFiles) {
  const pages: DetectedPage[] = records.map((record) => ({
    url: record.url,
    pageType: record.pageType,
    fetchStatus: record.fetchStatus === "ok" ? "ok" : "failed",
    hasJsonLd: record.hasJsonLd,
    schemaTypes: record.schemaTypes,
  }));
  return scoreScan({ pages, siteFiles });
}

export function findingRecords(findings: ReturnType<typeof scoreScan>["findings"]): ScanFindingRecord[] {
  return findings.map((f) => ({
    code: f.code,
    severity: f.severity,
    passed: f.passed,
    message: f.message,
    pageUrl: f.pageUrl,
    evidence: f.evidence,
  }));
}

/** Ops scans feed the follow-up queue once they have a score. */
export async function queueOpsFollowUp(repo: ScanRepository, scan: ScanRecord, scoreTotal: number): Promise<void> {
  if (scan.source !== "ops" || !scan.leadId) return;
  const hasContact = Boolean(scan.hasContact);
  await repo.upsertOpsQueue({
    leadId: scan.leadId,
    scanId: scan.id,
    priorityScore: computeOpsPriority({ scoreTotal, hasContact }),
    missingContact: !hasContact,
  });
}

/**
 * One-shot scan in a single invocation (Inngest and tests). The Cloudflare queue runs the same three steps as
 * separate plan / chunk / finalize jobs; see `./pipeline`.
 */
export async function runScan(scanId: string, deps: RunScanDeps): Promise<void> {
  const { site, repo } = deps;

  const scan = await repo.getScan(scanId);
  if (!scan) {
    throw new Error(`Scan not found: ${scanId}`);
  }
  if (scan.status === "complete" || scan.status === "failed") return;

  await repo.markRunning(scanId);

  try {
    const discovery = await discoverScanUrls(scan, deps);
    const { records } = await scanPlannedPages(discovery.prioritized, { site, origin: scan.origin });

    if (isCatastrophicFailure({ siteFiles: discovery.siteFiles, searchCount: discovery.searchCount, pages: records })) {
      await repo.markFailed(scanId, CATASTROPHIC_MESSAGE);
      return;
    }

    const scored = scoreStoredPages(records, discovery.siteFiles);
    await repo.savePages(scanId, records);
    await repo.saveFindings(scanId, findingRecords(scored.findings));
    await repo.markComplete(scanId, scored.scoreTotal, scored.breakdown);
    await queueOpsFollowUp(repo, scan, scored.scoreTotal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown scan failure";
    await repo.markFailed(scanId, message);
    throw err;
  }
}
