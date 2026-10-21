import { describe, expect, it } from "vitest";
import { classifyPageType, PER_TYPE_FIRST_PASS, prioritizeUrls, templateSeedUrls } from "@/lib/prioritize-urls";

describe("classifyPageType", () => {
  it("splits blog listings from blog posts", () => {
    expect(classifyPageType("https://example.com/blog", "https://example.com")).toBe("blog");
    expect(classifyPageType("https://example.com/blog/hello-world", "https://example.com")).toBe(
      "blogPost",
    );
  });

  it("classifies howto and product paths", () => {
    expect(classifyPageType("https://example.com/how-to/install", "https://example.com")).toBe(
      "howto",
    );
    expect(classifyPageType("https://example.com/products/widget", "https://example.com")).toBe(
      "product",
    );
  });
});

describe("prioritizeUrls", () => {
  it("always includes home and caps at 40", () => {
    const origin = "https://example.com";
    const many = Array.from({ length: 80 }, (_, i) => `${origin}/p/${i}`);
    const result = prioritizeUrls({
      origin,
      sitemapUrls: [`${origin}/`, `${origin}/about`, `${origin}/contact`, ...many],
      searchUrls: [`${origin}/pricing`, `${origin}/faq`],
    });
    expect(result[0].url).toBe(`${origin}/`);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.some((p) => p.pageType === "about")).toBe(true);
    expect(result.some((p) => p.pageType === "contact")).toBe(true);
  });

  it("seeds critical template URLs when sitemap/search omit them", () => {
    const result = prioritizeUrls({
      origin: "https://example.com",
      sitemapUrls: ["https://example.com/p/1"],
      searchUrls: [],
    });
    expect(result.some((p) => p.pageType === "about")).toBe(true);
    expect(result.some((p) => p.pageType === "contact")).toBe(true);
    expect(result.some((p) => p.pageType === "faq")).toBe(true);
    expect(result.some((p) => p.pageType === "service")).toBe(true);
  });

  it("keeps www variants of the origin domain and drops off-site search noise", () => {
    const result = prioritizeUrls({
      origin: "https://pirx.ca",
      sitemapUrls: ["https://www.pirx.ca/faq", "https://www.pirx.ca/pricing"],
      searchUrls: [
        "https://www.prlog.org/press-release.html",
        "https://lockedownseo.com/important-pages",
        "https://www.pirx.ca/guides",
      ],
    });

    expect(result.every((p) => /(^|\.)pirx\.ca$/i.test(new URL(p.url).hostname))).toBe(true);
    expect(result.some((p) => p.pageType === "faq")).toBe(true);
    expect(result.some((p) => p.url.includes("guides"))).toBe(true);
    expect(result.some((p) => p.url.includes("prlog.org"))).toBe(false);
  });
});

describe("classifyPageType expanded", () => {
  it("classifies testimonial, appointment, and article paths", () => {
    const origin = "https://www.drbhasin.com";
    expect(classifyPageType("https://www.drbhasin.com/testimonials", origin)).toBe("testimonial");
    expect(classifyPageType("https://www.drbhasin.com/appointment", origin)).toBe("appointment");
    expect(classifyPageType("https://www.drbhasin.com/articles/hello", origin)).toBe("blogPost");
    expect(classifyPageType("https://www.drbhasin.com/book", origin)).toBe("appointment");
  });
});

describe("sitemap URLs outrank guessed template paths", () => {
  const origin = "https://abra-ca-dabra.app";
  // Shape of the live sitemap: services, portfolio, products, start, a blog index and 24 posts.
  const sitemap = [
    `${origin}/`,
    `${origin}/walkthrough.html`,
    `${origin}/films.html`,
    `${origin}/services/`,
    ...Array.from({ length: 12 }, (_, i) => `${origin}/services/s-${i}/`),
    `${origin}/portfolio/`,
    ...Array.from({ length: 9 }, (_, i) => `${origin}/portfolio/case-${i}/`),
    `${origin}/products/`,
    `${origin}/products/schema/`,
    `${origin}/products/super-funnel/`,
    `${origin}/course/llm-leverage/`,
    `${origin}/start/`,
    `${origin}/start/thanks/`,
    `${origin}/blog`,
    `${origin}/about/`,
    ...Array.from({ length: 24 }, (_, i) => `${origin}/blog/post-${i}`),
  ];

  it("only guesses page types the real URLs do not cover", () => {
    const seeds = templateSeedUrls({ origin, sitemapUrls: sitemap, searchUrls: [] });
    const types = new Set(seeds.map((s) => s.pageType));
    for (const covered of ["about", "service", "blog", "product"]) expect(types.has(covered)).toBe(false);
    expect(seeds.map((s) => new URL(s.url).pathname)).toEqual(
      expect.arrayContaining(["/contact", "/appointment", "/book", "/pricing", "/faq", "/testimonials", "/reviews"]),
    );
    expect(seeds.every((s) => s.source === "seed")).toBe(true);
  });

  it("spends the 40-page cap on real pages before guesses", () => {
    const result = prioritizeUrls({ origin, sitemapUrls: sitemap, searchUrls: [] });
    expect(result).toHaveLength(40);
    expect(result.some((p) => p.source === "seed")).toBe(false);
    const paths = result.map((p) => new URL(p.url).pathname);
    expect(paths).toEqual(expect.arrayContaining(["/portfolio", "/products", "/start", "/course/llm-leverage", "/about", "/blog"]));
    expect(paths.some((p) => p.startsWith("/portfolio/case-"))).toBe(true);
    expect(result.filter((p) => p.pageType === "blogPost").length).toBe(PER_TYPE_FIRST_PASS);
  });

  it("puts guesses after every real URL and uses pre-checked seeds when given", () => {
    const small = [`${origin}/`, `${origin}/about/`, `${origin}/blog/one`];
    const unchecked = prioritizeUrls({ origin, sitemapUrls: small, searchUrls: [] });
    const firstSeed = unchecked.findIndex((p) => p.source === "seed");
    expect(firstSeed).toBeGreaterThan(unchecked.findIndex((p) => p.url.endsWith("/blog/one")));

    const checked = prioritizeUrls({
      origin,
      sitemapUrls: small,
      searchUrls: [],
      seedUrls: [{ url: `${origin}/contact`, pageType: "contact", source: "seed" }],
    });
    expect(checked.filter((p) => p.source === "seed").map((p) => p.url)).toEqual([`${origin}/contact`]);
  });

  it("caps one page type in the first pass so other sitemap pages get slots", () => {
    const blogHeavy = [...Array.from({ length: 60 }, (_, i) => `${origin}/blog/p-${i}`), `${origin}/portfolio/x/`];
    const result = prioritizeUrls({ origin, sitemapUrls: blogHeavy, searchUrls: [], seedUrls: [] });
    expect(result.some((p) => p.url.endsWith("/portfolio/x"))).toBe(true);
    expect(result).toHaveLength(40);
  });
});
