/**
 * Reads a property's public sitemaps (the paths Search Console lists) to learn which URLs are in the sitemap and their
 * <lastmod>. Only URLs inside the property are kept, sitemap indexes are followed one level, and sizes are capped.
 */

export const MAX_SITEMAP_FILES = 20;
export const MAX_SITEMAP_BYTES = 10 * 1024 * 1024;
export const MAX_SITEMAP_URLS = 50_000;

export type SitemapUrl = { url: string; lastmod: string | null };

/** True when `url` belongs to the Search Console property (sc-domain:host covers subdomains; URL-prefix must match). */
export function urlInProperty(siteUrl: string, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (siteUrl.startsWith("sc-domain:")) {
    const host = siteUrl.slice("sc-domain:".length);
    const actual = parsed.hostname.toLowerCase();
    return actual === host || actual.endsWith(`.${host}`);
  }
  return url.startsWith(siteUrl);
}

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<(?:[a-z0-9]+:)?${name}>([\\s\\S]*?)</(?:[a-z0-9]+:)?${name}>`, "i"));
  return match ? decode(match[1] ?? "") : null;
}

export function parseSitemapXml(xml: string): { index: boolean; entries: SitemapUrl[] } {
  const index = /<(?:[a-z0-9]+:)?sitemapindex\b/i.test(xml);
  const blockName = index ? "sitemap" : "url";
  const blocks = xml.match(new RegExp(`<(?:[a-z0-9]+:)?${blockName}\\b[^>]*>[\\s\\S]*?</(?:[a-z0-9]+:)?${blockName}>`, "gi")) ?? [];
  const entries: SitemapUrl[] = [];
  for (const block of blocks) {
    const loc = tag(block, "loc");
    if (loc) entries.push({ url: loc, lastmod: tag(block, "lastmod") });
  }
  return { index, entries };
}

async function readText(response: Response, gz: boolean): Promise<string | null> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_SITEMAP_BYTES) return null;
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_SITEMAP_BYTES) return null;
  const gzipped = gz || (buffer[0] === 0x1f && buffer[1] === 0x8b);
  if (!gzipped) return new TextDecoder().decode(buffer);
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return text.length > MAX_SITEMAP_BYTES * 4 ? null : text;
}

/**
 * Fetches the listed sitemaps. `complete` is false when any file failed, was too big, or a cap was hit, so callers do
 * not mark URLs as gone from the sitemap on a partial read.
 */
export async function collectSitemapUrls(input: {
  siteUrl: string;
  sitemapPaths: string[];
  fetchImpl?: typeof fetch;
}): Promise<{ urls: SitemapUrl[]; complete: boolean; files: number }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const queue = input.sitemapPaths.filter((path) => urlInProperty(input.siteUrl, path));
  const seen = new Set<string>();
  const urls = new Map<string, string | null>();
  let complete = queue.length === input.sitemapPaths.length;
  let files = 0;
  let depth = new Map(queue.map((path) => [path, 0]));
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    if (files >= MAX_SITEMAP_FILES) {
      complete = false;
      break;
    }
    files += 1;
    let text: string | null = null;
    try {
      const response = await fetchImpl(path, { headers: { accept: "application/xml,text/xml,*/*" }, redirect: "follow" });
      text = response.ok ? await readText(response, /\.gz$/i.test(new URL(path).pathname)) : null;
    } catch {
      text = null;
    }
    if (text === null) {
      complete = false;
      continue;
    }
    const parsed = parseSitemapXml(text);
    if (parsed.index) {
      for (const entry of parsed.entries) {
        if (!urlInProperty(input.siteUrl, entry.url)) continue;
        if ((depth.get(path) ?? 0) >= 1) {
          complete = false;
          continue;
        }
        depth = depth.set(entry.url, (depth.get(path) ?? 0) + 1);
        queue.push(entry.url);
      }
      continue;
    }
    for (const entry of parsed.entries) {
      if (!urlInProperty(input.siteUrl, entry.url)) continue;
      if (urls.size >= MAX_SITEMAP_URLS) {
        complete = false;
        break;
      }
      urls.set(entry.url, entry.lastmod);
    }
  }
  return { urls: [...urls].map(([url, lastmod]) => ({ url, lastmod })), complete, files };
}
