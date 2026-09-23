import { describe, expect, it } from "vitest";
import { classifyPageType, prioritizeUrls } from "@/lib/prioritize-urls";

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
