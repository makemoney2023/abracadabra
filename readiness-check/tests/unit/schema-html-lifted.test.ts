import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichPagesWithSchemaHtml, looksLikeHtml, MAX_SCHEMA_HTML_FETCHES } from "@/lib/scan/schema-html";
import { resolveSitemapUrls, sitemapLimits, type ScanSiteClient } from "@/lib/scan/orchestrator";
import type { DetectedPage } from "@/lib/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function page(i: number, rawContent: string): DetectedPage {
  return { url: `https://a.example/p/${i}`, pageType: "service", fetchStatus: "ok", hasJsonLd: false, schemaTypes: [], rawContent };
}

describe("schema HTML recovery", () => {
  it("recognises an HTML extract result", () => {
    expect(looksLikeHtml("<!DOCTYPE html><html><body>x</body></html>")).toBe(true);
    expect(looksLikeHtml("# Heading\n\nSome markdown")).toBe(false);
    expect(looksLikeHtml(undefined)).toBe(false);
  });

  it("does not refetch pages whose extract result is already HTML, however many there are", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const pages = Array.from({ length: 50 }, (_, i) => page(i, `<html><head></head><body>Service ${i}</body></html>`));
    const result = await enrichPagesWithSchemaHtml(pages);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.htmlByUrl.size).toBe(50);
  });

  it("keeps the cap for markdown backends", async () => {
    const fetchSpy = vi.fn(async () => new Response("<html><body>x</body></html>", { headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const pages = Array.from({ length: 30 }, (_, i) => page(i, `# Service ${i}`));
    await enrichPagesWithSchemaHtml(pages);
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(MAX_SCHEMA_HTML_FETCHES + 10);
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("sitemap discovery limits", () => {
  function indexSite(children: number, perChild: number): ScanSiteClient & { reads: string[] } {
    const reads: string[] = [];
    return {
      reads,
      async extract(urls) {
        reads.push(...urls);
        return urls.map((url) => {
          const n = Number(url.match(/child-(\d+)/)?.[1] ?? 0);
          const locs = Array.from({ length: perChild }, (_, i) => `<url><loc>https://a.example/c${n}/p${i}</loc></url>`).join("");
          return { url, content: `<urlset>${locs}</urlset>` };
        });
      },
      async search() {
        return [];
      },
    };
  }
  const index = (n: number) =>
    `<sitemapindex>${Array.from({ length: n }, (_, i) => `<sitemap><loc>https://a.example/child-${i}.xml</loc></sitemap>`).join("")}</sitemapindex>`;

  it("free scans read at most 5 child sitemaps, as before", async () => {
    const site = indexSite(30, 20);
    const urls = await resolveSitemapUrls(site, index(30), sitemapLimits(40));
    expect(site.reads).toHaveLength(5);
    expect(urls).toHaveLength(100);
  });

  it("deep scans read further, and stop at ten times the page budget", async () => {
    const site = indexSite(60, 100);
    const urls = await resolveSitemapUrls(site, index(60), sitemapLimits(200));
    expect(urls).toHaveLength(2000);
    expect(site.reads).toHaveLength(20);
    const big = indexSite(80, 100);
    const all = await resolveSitemapUrls(big, index(80), sitemapLimits(1000));
    expect(big.reads).toHaveLength(50);
    expect(all).toHaveLength(5000);
  });
});
