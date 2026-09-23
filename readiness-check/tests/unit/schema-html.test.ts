import { describe, expect, it } from "vitest";
import {
  MAX_SCHEMA_HTML_FETCHES,
  normalizeExtractUrlKey,
  selectUrlsForSchemaHtmlFetch,
} from "@/lib/scan/schema-html";

describe("normalizeExtractUrlKey", () => {
  it("treats www and trailing slash as the same page", () => {
    expect(normalizeExtractUrlKey("https://www.example.com/about/")).toBe(
      normalizeExtractUrlKey("https://example.com/about"),
    );
  });
});

describe("selectUrlsForSchemaHtmlFetch", () => {
  it("prioritizes home and critical types and caps total fetches", () => {
    const candidates = [
      { url: "https://example.com/", pageType: "home" },
      { url: "https://example.com/contact", pageType: "contact" },
      { url: "https://example.com/services", pageType: "service" },
      { url: "https://example.com/about", pageType: "about" },
      ...Array.from({ length: 20 }, (_, i) => ({
        url: `https://example.com/p/${i}`,
        pageType: "other",
      })),
    ];

    const selected = selectUrlsForSchemaHtmlFetch(candidates);
    expect(selected[0]).toBe("https://example.com/");
    expect(selected).toContain("https://example.com/contact");
    expect(selected).toContain("https://example.com/services");
    expect(selected.length).toBeLessThanOrEqual(MAX_SCHEMA_HTML_FETCHES);
  });
});
