import { detectJsonLd } from "@/lib/detect/jsonld";
import { parseSitemapUrls } from "@/lib/detect/sitemap";
import { computeOpsPriority } from "@/lib/ops/priority";
import type { ParallelClient, ParallelExtractResult } from "@/lib/parallel/types";
import { prioritizeUrls } from "@/lib/prioritize-urls";
import { MAX_PAGES } from "@/lib/scoring/constants";
import { scoreScan } from "@/lib/scoring/score";
import type { DetectedPage, SiteFiles } from "@/lib/types";
import { reclassifyPageType } from "@/lib/scan/reclassify-page-type";
import { attachFactsToPages } from "./attach-page-facts";
import type { ScanRepository } from "./repository";
import {
  contentByNormalizedUrl,
  enrichPagesWithSchemaHtml,
  normalizeExtractUrlKey,
} from "./schema-html";

const PAGE_EXTRACT_OBJECTIVE =
  "Extract all application/ld+json script blocks and main page content";

const SITE_FILE_PATHS = ["robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt"] as const;

export type RunScanDeps = {
  parallel: ParallelClient;
  repo: ScanRepository;
};

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

async function resolveSitemapUrls(
  parallel: ParallelClient,
  sitemapXml: string | null,
): Promise<string[]> {
  if (!sitemapXml) return [];

  if (!isSitemapIndex(sitemapXml)) {
    return parseSitemapUrls(sitemapXml);
  }

  const childLocs = parseSitemapUrls(sitemapXml).slice(0, 5);
  if (childLocs.length === 0) return [];

  const childResults = await parallel.extract(childLocs, { fullContent: true });
  const urls: string[] = [];
  for (const child of childResults) {
    const body = extractBody(child);
    if (body) urls.push(...parseSitemapUrls(body));
  }
  return [...new Set(urls)];
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function isCatastrophicFailure(input: {
  siteFiles: SiteFiles;
  searchUrls: string[];
  pages: DetectedPage[];
}): boolean {
  const { siteFiles, searchUrls, pages } = input;
  const noSiteFiles =
    !siteFiles.robotsTxt && !siteFiles.sitemapXml && !siteFiles.llmsTxt && !siteFiles.llmsFullTxt;
  const homeFailed =
    pages.find((p) => p.pageType === "home")?.fetchStatus === "failed" ||
    pages.every((p) => p.fetchStatus === "failed");
  return noSiteFiles && searchUrls.length === 0 && homeFailed;
}

export async function runScan(scanId: string, deps: RunScanDeps): Promise<void> {
  const { parallel, repo } = deps;

  const scan = await repo.getScan(scanId);
  if (!scan) {
    throw new Error(`Scan not found: ${scanId}`);
  }

  await repo.markRunning(scanId);

  try {
    const base = originBase(scan.origin);
    const siteFileUrls = SITE_FILE_PATHS.map((file) => siteFileUrl(scan.origin, file));

    const siteFileResults = await parallel.extract(siteFileUrls, { fullContent: true });
    const siteFileMap = contentByNormalizedUrl(siteFileResults);

    const siteFiles: SiteFiles = {
      robotsTxt: extractBody(
        siteFileMap.get(normalizeExtractUrlKey(siteFileUrl(scan.origin, "robots.txt"))),
      ),
      sitemapXml: extractBody(
        siteFileMap.get(normalizeExtractUrlKey(siteFileUrl(scan.origin, "sitemap.xml"))),
      ),
      llmsTxt: extractBody(
        siteFileMap.get(normalizeExtractUrlKey(siteFileUrl(scan.origin, "llms.txt"))),
      ),
      llmsFullTxt: extractBody(
        siteFileMap.get(normalizeExtractUrlKey(siteFileUrl(scan.origin, "llms-full.txt"))),
      ),
    };

    const searchResults = await parallel.search(`Find important pages on ${scan.domain}`, {
      includeDomains: [scan.domain],
      maxResults: MAX_PAGES,
    });
    const searchUrls = searchResults.map((r) => r.url).filter(Boolean);

    const sitemapUrls = await resolveSitemapUrls(parallel, siteFiles.sitemapXml);

    const prioritized = prioritizeUrls({
      origin: base,
      sitemapUrls,
      searchUrls,
    });

    const pageExtractResults: ParallelExtractResult[] = [];
    for (const batch of chunk(
      prioritized.map((p) => p.url),
      10,
    )) {
      // Excerpts are enough to mark reachability; JSON-LD comes from capped HTML GETs.
      const batchResults = await parallel.extract(batch, {
        objective: PAGE_EXTRACT_OBJECTIVE,
        fullContent: false,
      });
      pageExtractResults.push(...batchResults);
    }

    const pageResultMap = contentByNormalizedUrl(pageExtractResults);

    const markdownByUrl = new Map<string, string>();
    const extractBlocksByUrl = new Map<string, unknown[]>();

    const draftPages: DetectedPage[] = prioritized.map((entry) => {
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

    // Parallel markdown strips JSON-LD; capped parallel HTML GETs recover schema without hanging UI.
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

    if (isCatastrophicFailure({ siteFiles, searchUrls, pages })) {
      await repo.markFailed(scanId, "Catastrophic scan failure: no site files, search results, or fetchable home page");
      return;
    }

    const scored = scoreScan({ pages, siteFiles });

    await repo.savePages(
      scanId,
      pages.map((p) => ({
        url: p.url,
        pageType: p.pageType,
        fetchStatus: p.fetchStatus,
        hasJsonLd: p.hasJsonLd,
        schemaTypes: p.schemaTypes,
        evidence: p.evidence as Record<string, unknown> | undefined,
      })),
    );

    await repo.saveFindings(
      scanId,
      scored.findings.map((f) => ({
        code: f.code,
        severity: f.severity,
        passed: f.passed,
        message: f.message,
        pageUrl: f.pageUrl,
        evidence: f.evidence,
      })),
    );

    await repo.markComplete(scanId, scored.scoreTotal, scored.breakdown);

    if (scan.source === "ops" && scan.leadId) {
      const hasContact = Boolean(scan.hasContact);
      await repo.upsertOpsQueue({
        leadId: scan.leadId,
        scanId,
        priorityScore: computeOpsPriority({
          scoreTotal: scored.scoreTotal,
          hasContact,
        }),
        missingContact: !hasContact,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown scan failure";
    await repo.markFailed(scanId, message);
    throw err;
  }
}
