import { describe, expect, it, vi } from "vitest";
import { selectUrlsForFactRefresh } from "@/lib/scan/refresh-page-facts";

describe("selectUrlsForFactRefresh", () => {
  it("picks up to 10 critical ok pages", () => {
    const urls = selectUrlsForFactRefresh([
      { url: "https://a.com/", pageType: "home", fetchStatus: "ok" },
      { url: "https://a.com/contact", pageType: "contact", fetchStatus: "ok" },
      { url: "https://a.com/about", pageType: "about", fetchStatus: "ok" },
      { url: "https://a.com/faq", pageType: "faq", fetchStatus: "ok" },
      { url: "https://a.com/services", pageType: "service", fetchStatus: "ok" },
      { url: "https://a.com/blog", pageType: "blog", fetchStatus: "ok" },
      { url: "https://a.com/x", pageType: "other", fetchStatus: "failed" },
    ]);
    expect(urls).toHaveLength(5); // home..service still 5; budget is 10
    expect(urls[0]).toBe("https://a.com/");
    expect(urls).not.toContain("https://a.com/blog");
  });
});

describe("refreshPageFacts", () => {
  it("recomputes evidence from HTML fetches", async () => {
    vi.resetModules();
    vi.doMock("@/lib/fetch-html", () => ({
      fetchHtmlForSchema: vi.fn(async (url: string) => {
        if (url.includes("contact")) {
          return `<html><head><title>Contact</title></head><body><a href="mailto:hi@acme.example">e</a></body></html>`;
        }
        return `<html><head><title>Acme</title><meta name="description" content="Widgets" /></head><body></body></html>`;
      }),
    }));

    const { refreshPageFacts } = await import("@/lib/scan/refresh-page-facts");
    const result = await refreshPageFacts({
      pages: [
        {
          url: "https://acme.example/",
          pageType: "home",
          fetchStatus: "ok",
          hasJsonLd: false,
          schemaTypes: [],
        },
        {
          url: "https://acme.example/contact",
          pageType: "contact",
          fetchStatus: "ok",
          hasJsonLd: false,
          schemaTypes: [],
        },
      ],
    });

    expect(result.pages[0]?.evidence).toMatchObject({
      businessName: "Acme",
      description: "Widgets",
    });
    expect(result.pages[1]?.evidence?.emails).toContain("hi@acme.example");
    expect(result.refreshedUrls).toContain("https://acme.example/");
  });
});
