import { parseSitemapUrls } from "@/lib/detect/sitemap";
import type { SiteFiles } from "@/lib/types";

/** Stored per run so finalize can score without refetching. Sizes keep the run row small in shared D1. */
export const STORED_LIMITS = {
  robotsTxt: 256_000,
  sitemapXml: 16_000,
  llmsTxt: 128_000,
  llmsFullTxt: 128_000,
} as const satisfies Record<keyof SiteFiles, number>;

const MD_LINK_LINE = /^-\s+\[[^\]]+\]\(https?:\/\/[^)]+\).*$/m;

function compactLlms(text: string | null, limit: number): string | null {
  if (text === null || text.length <= limit) return text;
  const head = text.slice(0, limit);
  if (MD_LINK_LINE.test(head)) return head;
  const link = text.match(MD_LINK_LINE)?.[0];
  return link ? `${head}\n${link}` : head;
}

function compactSitemap(xml: string | null, limit: number): string | null {
  if (xml === null || xml.length <= limit) return xml;
  const head = xml.slice(0, limit);
  if (parseSitemapUrls(head).length > 0) return head;
  const first = parseSitemapUrls(xml)[0];
  return first ? `${head}\n<loc>${first}</loc>` : head;
}

/**
 * A copy of the site files that scores the same as the originals: llms files keep their H1, summary and at least
 * one markdown link, the sitemap keeps at least one URL, robots.txt is kept to 256 KB.
 */
export function compactSiteFiles(files: SiteFiles): SiteFiles {
  return {
    robotsTxt: files.robotsTxt === null ? null : files.robotsTxt.slice(0, STORED_LIMITS.robotsTxt),
    sitemapXml: compactSitemap(files.sitemapXml, STORED_LIMITS.sitemapXml),
    llmsTxt: compactLlms(files.llmsTxt, STORED_LIMITS.llmsTxt),
    llmsFullTxt: compactLlms(files.llmsFullTxt, STORED_LIMITS.llmsFullTxt),
  };
}

export function parseStoredSiteFiles(json: string | null): SiteFiles {
  const empty: SiteFiles = { robotsTxt: null, sitemapXml: null, llmsTxt: null, llmsFullTxt: null };
  if (!json) return empty;
  try {
    const row = JSON.parse(json) as Record<string, unknown>;
    const text = (key: keyof SiteFiles) => (typeof row[key] === "string" ? (row[key] as string) : null);
    return { robotsTxt: text("robotsTxt"), sitemapXml: text("sitemapXml"), llmsTxt: text("llmsTxt"), llmsFullTxt: text("llmsFullTxt") };
  } catch {
    return empty;
  }
}
