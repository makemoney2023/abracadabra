const LOC_RE = /<loc>\s*([^<]+)\s*<\/loc>/gi;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

function stripTrailingSitemapMeta(url: string): string {
  // Parallel often flattens sitemap rows to: "https://example.com/path 2026-08-11T... weekly 1"
  return url.replace(/[.,);]+$/, "");
}

/**
 * Parse URLs from a sitemap.xml body, or from Parallel's markdown/plain-text
 * flattening when `<loc>` tags are stripped.
 */
export function parseSitemapUrls(xml: string | null): string[] {
  if (!xml) return [];

  const fromLoc = [...xml.matchAll(LOC_RE)].map((m) => m[1].trim());
  if (fromLoc.length > 0) {
    return [...new Set(fromLoc)];
  }

  const fromPlain = [...xml.matchAll(URL_RE)].map((m) => stripTrailingSitemapMeta(m[0]));
  return [...new Set(fromPlain)];
}
