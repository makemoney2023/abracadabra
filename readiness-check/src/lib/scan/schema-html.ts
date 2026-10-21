import { detectJsonLd } from "@/lib/detect/jsonld";
import { fetchHtmlForSchema } from "@/lib/fetch-html";
import type { ParallelExtractResult } from "@/lib/parallel/types";
import { CRITICAL_PAGE_TYPES } from "@/lib/scoring/constants";
import type { DetectedPage } from "@/lib/types";

/**
 * Cap on extra HTML GETs, only for backends that return markdown or excerpts instead of HTML (the legacy Parallel
 * path). The Cloudflare scan client already returns each page's HTML, so those pages are never fetched twice and
 * this cap does not apply to them.
 */
export const MAX_SCHEMA_HTML_FETCHES = 12;

/** True when an extract result is the page's own HTML, so JSON-LD and facts can be read from it directly. */
export function looksLikeHtml(content: string | undefined): boolean {
  if (!content) return false;
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(content.slice(0, 4096));
}

const CRITICAL = new Set<string>(CRITICAL_PAGE_TYPES);
const PAGE_TYPE_RANK: Record<string, number> = {
  home: 0,
  contact: 1,
  service: 2,
  about: 3,
  faq: 4,
  appointment: 5,
  testimonial: 5,
  pricing: 6,
  blog: 7,
  blogPost: 7,
  event: 8,
  careers: 8,
  menu: 8,
  howto: 8,
  product: 8,
  location: 9,
  other: 10,
};

export function normalizeExtractUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let pathname = parsed.pathname;
    if (pathname !== "/" && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;
    return parsed.href;
  } catch {
    return url;
  }
}

export function contentByNormalizedUrl(
  results: ParallelExtractResult[],
): Map<string, ParallelExtractResult> {
  const map = new Map<string, ParallelExtractResult>();
  for (const result of results) {
    map.set(normalizeExtractUrlKey(result.url), result);
  }
  return map;
}

export function selectUrlsForSchemaHtmlFetch(
  candidates: Array<{ url: string; pageType: string }>,
): string[] {
  const ranked = [...candidates].sort((a, b) => {
    const aRank = PAGE_TYPE_RANK[a.pageType] ?? 99;
    const bRank = PAGE_TYPE_RANK[b.pageType] ?? 99;
    if (aRank !== bRank) return aRank - bRank;
    const aCrit = CRITICAL.has(a.pageType) ? 0 : 1;
    const bCrit = CRITICAL.has(b.pageType) ? 0 : 1;
    return aCrit - bCrit;
  });

  return ranked.slice(0, MAX_SCHEMA_HTML_FETCHES).map((c) => c.url);
}

export type SchemaHtmlEnrichResult = {
  pages: DetectedPage[];
  jsonLdBlocksByUrl: Map<string, unknown[]>;
  htmlByUrl: Map<string, string>;
};

const FACT_HTML_TYPES = new Set(["home", "contact", "about", "faq", "service", "testimonial", "appointment", "howto", "blogPost", "event"]);
export const MAX_FACT_HTML_FETCHES = 10;

/**
 * Recover JSON-LD from raw HTML. A page whose extract result is already HTML is read as is, with no cap and no
 * second request. Other pages get a capped, prioritized HTML GET, plus up to 10 critical ok pages for facts.
 */
export async function enrichPagesWithSchemaHtml(
  pages: DetectedPage[],
): Promise<SchemaHtmlEnrichResult> {
  const jsonLdBlocksByUrl = new Map<string, unknown[]>();
  const htmlByUrl = new Map<string, string>();

  for (const page of pages) {
    if (page.fetchStatus === "ok" && looksLikeHtml(page.rawContent)) htmlByUrl.set(page.url, page.rawContent!);
  }

  const needsSchemaHtml = pages.filter((p) => p.fetchStatus === "ok" && !p.hasJsonLd && !htmlByUrl.has(p.url));
  const schemaSelected = new Set(selectUrlsForSchemaHtmlFetch(needsSchemaHtml));

  const factCandidates = pages
    .filter((p) => p.fetchStatus === "ok" && FACT_HTML_TYPES.has(p.pageType) && !htmlByUrl.has(p.url))
    .sort((a, b) => (PAGE_TYPE_RANK[a.pageType] ?? 99) - (PAGE_TYPE_RANK[b.pageType] ?? 99))
    .slice(0, MAX_FACT_HTML_FETCHES);

  const urlsToFetch = new Set<string>([
    ...needsSchemaHtml.filter((p) => schemaSelected.has(p.url)).map((p) => p.url),
    ...factCandidates.map((p) => p.url),
  ]);

  if (urlsToFetch.size === 0) {
    return { pages, jsonLdBlocksByUrl, htmlByUrl };
  }

  const detections = await Promise.all(
    [...urlsToFetch].map(async (url) => {
      const html = await fetchHtmlForSchema(url);
      if (!html) return { url, html: null, detection: null };
      return { url, html, detection: detectJsonLd(html) };
    }),
  );

  const byUrl = new Map(detections.map((d) => [d.url, d]));

  const nextPages = pages.map((page) => {
    const result = byUrl.get(page.url);
    if (!result?.html) return page;
    htmlByUrl.set(page.url, result.html);
    if (!result.detection?.hasJsonLd) return page;
    jsonLdBlocksByUrl.set(page.url, result.detection.blocks);
    return {
      ...page,
      hasJsonLd: true,
      schemaTypes: result.detection.schemaTypes,
    };
  });

  return { pages: nextPages, jsonLdBlocksByUrl, htmlByUrl };
}
