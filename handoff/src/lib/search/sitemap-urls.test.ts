import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { collectSitemapUrls, parseSitemapXml, urlInProperty } from "./sitemap-urls";

const urlset = (items: [string, string?][]) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items
    .map(([loc, lastmod]) => `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`)
    .join("")}</urlset>`;

function fetcher(files: Record<string, string | Uint8Array | number>) {
  const asked: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    const key = String(url);
    asked.push(key);
    const body = files[key];
    if (body === undefined) return new Response("nope", { status: 404 });
    if (typeof body === "number") throw new Error("offline");
    return new Response(body as BodyInit, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, asked };
}

describe("urlInProperty", () => {
  it("covers subdomains for a domain property and the prefix for a URL-prefix property", () => {
    expect(urlInProperty("sc-domain:a.com", "https://www.a.com/x")).toBe(true);
    expect(urlInProperty("sc-domain:a.com", "https://a.com/")).toBe(true);
    expect(urlInProperty("sc-domain:a.com", "https://evila.com/")).toBe(false);
    expect(urlInProperty("sc-domain:a.com", "https://a.com.evil.net/")).toBe(false);
    expect(urlInProperty("https://www.a.com/blog/", "https://www.a.com/blog/post")).toBe(true);
    expect(urlInProperty("https://www.a.com/blog/", "https://www.a.com/shop")).toBe(false);
    expect(urlInProperty("sc-domain:a.com", "ftp://a.com/x")).toBe(false);
  });
});

describe("parseSitemapXml", () => {
  it("reads loc and lastmod, entities and CDATA, and spots an index", () => {
    expect(parseSitemapXml(urlset([["https://a.com/?a=1&amp;b=2", "2026-10-01"], ["https://a.com/b"]]))).toEqual({
      index: false,
      entries: [{ url: "https://a.com/?a=1&b=2", lastmod: "2026-10-01" }, { url: "https://a.com/b", lastmod: null }],
    });
    const index = `<sitemapindex><sitemap><loc><![CDATA[https://a.com/s1.xml]]></loc></sitemap></sitemapindex>`;
    expect(parseSitemapXml(index)).toEqual({ index: true, entries: [{ url: "https://a.com/s1.xml", lastmod: null }] });
  });
});

describe("collectSitemapUrls", () => {
  it("follows an index one level, reads gzip, and keeps only URLs inside the property", async () => {
    const { fetchImpl, asked } = fetcher({
      "https://a.com/sitemap.xml": `<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap><sitemap><loc>https://a.com/s2.xml.gz</loc></sitemap><sitemap><loc>https://evil.net/s.xml</loc></sitemap></sitemapindex>`,
      "https://a.com/s1.xml": urlset([["https://a.com/one", "2026-10-01"], ["https://other.net/x"]]),
      "https://a.com/s2.xml.gz": gzipSync(urlset([["https://www.a.com/two"]])),
    });
    const result = await collectSitemapUrls({ siteUrl: "sc-domain:a.com", sitemapPaths: ["https://a.com/sitemap.xml"], fetchImpl });
    expect(result.urls).toEqual([{ url: "https://a.com/one", lastmod: "2026-10-01" }, { url: "https://www.a.com/two", lastmod: null }]);
    expect(result.complete).toBe(true);
    expect(asked).not.toContain("https://evil.net/s.xml");
  });

  it("is incomplete when a file fails, so nothing is marked as gone", async () => {
    const { fetchImpl } = fetcher({ "https://a.com/s1.xml": urlset([["https://a.com/one"]]), "https://a.com/s2.xml": 0 });
    const result = await collectSitemapUrls({ siteUrl: "sc-domain:a.com", sitemapPaths: ["https://a.com/s1.xml", "https://a.com/s2.xml", "https://a.com/s3.xml"], fetchImpl });
    expect(result.urls).toHaveLength(1);
    expect(result.complete).toBe(false);
  });

  it("never fetches a sitemap path outside the property", async () => {
    const { fetchImpl, asked } = fetcher({});
    const result = await collectSitemapUrls({ siteUrl: "sc-domain:a.com", sitemapPaths: ["http://169.254.169.254/latest"], fetchImpl });
    expect(asked).toEqual([]);
    expect(result.complete).toBe(false);
  });
});
