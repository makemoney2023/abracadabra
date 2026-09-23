import { detectJsonLd } from "@/lib/detect/jsonld";
import { extractPageFacts } from "@/lib/facts/extract-page-facts";
import type { PageFacts } from "@/lib/facts/types";
import { emptyPageFacts } from "@/lib/facts/types";
import { fetchHtmlForSchema } from "@/lib/fetch-html";
import { reclassifyPageType } from "@/lib/scan/reclassify-page-type";

export const MAX_FACT_REFRESH_FETCHES = 10;

const FACT_TYPES = [
  "home",
  "contact",
  "about",
  "faq",
  "service",
  "testimonial",
  "appointment",
  "howto",
  "blogPost",
  "event",
  "other",
] as const;

const RANK: Record<string, number> = {
  home: 0,
  contact: 1,
  about: 2,
  faq: 3,
  service: 4,
  testimonial: 5,
  appointment: 5,
  howto: 6,
  blogPost: 6,
  event: 7,
  other: 8,
};

export type RefreshPageInput = {
  url: string;
  pageType: string;
  fetchStatus: string;
  hasJsonLd: boolean;
  schemaTypes: string[];
  evidence?: PageFacts | Record<string, unknown>;
  rawContent?: string;
};

export function selectUrlsForFactRefresh(
  pages: Array<{ url: string; pageType: string; fetchStatus: string }>,
): string[] {
  return pages
    .filter((p) => p.fetchStatus === "ok" && (FACT_TYPES as readonly string[]).includes(p.pageType))
    .sort((a, b) => (RANK[a.pageType] ?? 99) - (RANK[b.pageType] ?? 99))
    .slice(0, MAX_FACT_REFRESH_FETCHES)
    .map((p) => p.url);
}

/**
 * On-demand HTML fact refresh for old scans (no Parallel). Caps at 10 URLs.
 * Reclassifies page_type from content when URL type was weak (`other`).
 */
export async function refreshPageFacts(input: {
  pages: RefreshPageInput[];
  origin?: string;
}): Promise<{
  pages: Array<RefreshPageInput & { evidence: PageFacts }>;
  refreshedUrls: string[];
}> {
  const selected = new Set(selectUrlsForFactRefresh(input.pages));
  // Always try to reclassify `other` pages even if not in fact list — include up to budget
  for (const p of input.pages) {
    if (selected.size >= MAX_FACT_REFRESH_FETCHES) break;
    if (p.fetchStatus === "ok" && p.pageType === "other") selected.add(p.url);
  }

  const refreshedUrls: string[] = [];
  const htmlByUrl = new Map<string, string>();
  const blocksByUrl = new Map<string, unknown[]>();

  await Promise.all(
    [...selected].map(async (url) => {
      const html = await fetchHtmlForSchema(url);
      if (!html) return;
      htmlByUrl.set(url, html);
      refreshedUrls.push(url);
      const detection = detectJsonLd(html);
      if (detection.blocks.length) blocksByUrl.set(url, detection.blocks);
    }),
  );

  const pages = input.pages.map((page) => {
    const origin =
      input.origin ||
      (() => {
        try {
          return new URL(page.url).origin;
        } catch {
          return "";
        }
      })();

    if (!selected.has(page.url) || !htmlByUrl.has(page.url)) {
      const evidence =
        page.evidence && typeof page.evidence === "object"
          ? ({ ...emptyPageFacts(), ...(page.evidence as PageFacts) } as PageFacts)
          : emptyPageFacts();
      return { ...page, evidence };
    }

    const html = htmlByUrl.get(page.url)!;
    const facts = extractPageFacts({
      html,
      markdown: page.rawContent,
      jsonLdBlocks: blocksByUrl.get(page.url) ?? [],
    });
    if (facts.existingTypes.length === 0 && page.schemaTypes.length > 0) {
      facts.existingTypes = [...page.schemaTypes].sort();
    }

    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim();
    const pageType = reclassifyPageType({
      url: page.url,
      origin,
      currentType: page.pageType,
      html,
      markdown: page.rawContent,
      title,
    });

    const hasJsonLd = page.hasJsonLd || facts.existingTypes.length > 0;
    return {
      ...page,
      pageType,
      hasJsonLd,
      schemaTypes: hasJsonLd && facts.existingTypes.length ? facts.existingTypes : page.schemaTypes,
      evidence: facts,
    };
  });

  return { pages, refreshedUrls };
}
