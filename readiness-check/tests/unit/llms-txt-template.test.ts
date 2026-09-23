import { describe, expect, it } from "vitest";
import { analyzeLlmsTxt } from "@/lib/detect/llms-txt";
import {
  buildLlmsFullTxt,
  buildLlmsTxt,
  type LlmsTemplateBiz,
  type LlmsTemplatePage,
} from "@/lib/fixes/llms-txt-template";

const pages: LlmsTemplatePage[] = [
  { url: "https://example.com/", pageType: "home", fetchStatus: "ok" },
  { url: "https://example.com/about", pageType: "about", fetchStatus: "ok" },
  { url: "https://example.com/contact", pageType: "contact", fetchStatus: "ok" },
  { url: "https://example.com/services", pageType: "service", fetchStatus: "ok" },
  { url: "https://example.com/faq", pageType: "faq", fetchStatus: "ok" },
  { url: "https://example.com/blog", pageType: "blog", fetchStatus: "ok" },
  { url: "https://example.com/careers", pageType: "careers", fetchStatus: "ok" },
  { url: "https://example.com/blog/post-1", pageType: "blogPost", fetchStatus: "ok" },
  { url: "https://example.com/blog/post-2", pageType: "blogPost", fetchStatus: "ok" },
  { url: "https://example.com/blog/post-3", pageType: "blogPost", fetchStatus: "ok" },
  { url: "https://example.com/blog/post-4", pageType: "blogPost", fetchStatus: "ok" },
  { url: "https://example.com/blog/post-5", pageType: "blogPost", fetchStatus: "ok" },
  { url: "https://example.com/blog/post-6", pageType: "blogPost", fetchStatus: "ok" },
  { url: "https://example.com/blog/post-7", pageType: "blogPost", fetchStatus: "ok" },
  { url: "https://example.com/private", pageType: "other", fetchStatus: "failed" },
];

const biz: LlmsTemplateBiz = {
  name: "Acme Widgets",
  description: "Acme builds industrial widgets for manufacturers.",
  email: "hello@example.com",
  phone: "+1-555-0100",
  sameAs: ["https://www.linkedin.com/company/acme"],
  address: {
    streetAddress: "1 Main St",
    addressLocality: "Cambridge",
    addressRegion: "ON",
    postalCode: "N1R 1A1",
    addressCountry: "CA",
  },
};

describe("buildLlmsTxt llmstxt.org v2", () => {
  it("includes H1, blockquote, detail prose, annotated file lists, and Optional", () => {
    const txt = buildLlmsTxt({
      origin: "https://example.com",
      domain: "example.com",
      biz,
      pages,
    });

    expect(txt.startsWith("# Acme Widgets\n")).toBe(true);
    expect(txt).toMatch(/^> .+/m);
    // Non-heading detail between quote and first H2
    const afterQuote = txt.split(/\n> [^\n]+\n/)[1] ?? "";
    const beforeFirstH2 = afterQuote.split(/\n## /)[0] ?? "";
    expect(beforeFirstH2.trim().length).toBeGreaterThan(40);
    expect(beforeFirstH2).not.toMatch(/^## /m);

    expect(txt).toMatch(/## Core/);
    expect(txt).toMatch(/- \[Home\]\(https:\/\/example\.com\/\): /);
    expect(txt).toMatch(/- \[About\]\(https:\/\/example\.com\/about\): /);
    expect(txt).toMatch(/## Optional/);
    expect(txt).toMatch(/- \[Blog\]\(https:\/\/example\.com\/blog\)/);
    expect(txt).not.toContain("https://example.com/private");
    expect(analyzeLlmsTxt(txt).useful).toBe(true);
  });

  it("never emits a bare URL-only index as the primary file", () => {
    const txt = buildLlmsTxt({
      origin: "https://example.com",
      domain: "example.com",
      biz: { name: "Solo", description: undefined, email: undefined, phone: undefined, sameAs: [] },
      pages: [{ url: "https://example.com/", pageType: "home", fetchStatus: "ok" }],
    });
    expect(txt).toMatch(/- \[Home\]\(https:\/\/example\.com\/\): /);
    expect(txt).not.toMatch(/## Full page index/);
  });
});

describe("buildLlmsFullTxt llmstxt.org v2", () => {
  it("keeps v2 structure and expands annotated coverage beyond the short file", () => {
    const short = buildLlmsTxt({
      origin: "https://example.com",
      domain: "example.com",
      biz,
      pages,
    });
    const full = buildLlmsFullTxt({
      origin: "https://example.com",
      domain: "example.com",
      biz,
      pages,
    });

    expect(full.startsWith("# Acme Widgets\n")).toBe(true);
    expect(full).toMatch(/^> .+/m);
    expect(full).toMatch(/## Optional/);
    expect(full).toMatch(/- \[.+\]\(https:\/\/example\.com\/.+\): /);
    expect(full.length).toBeGreaterThan(short.length);
    // No bare-url dump section
    expect(full).not.toMatch(/## Full page index\n- https:\/\//);
    expect(analyzeLlmsTxt(full).useful).toBe(true);
  });
});

describe("analyzeLlmsTxt v2 usefulness", () => {
  it("rejects URL-only or heading-less stubs", () => {
    expect(analyzeLlmsTxt("https://example.com/\nhttps://example.com/about").useful).toBe(false);
    expect(analyzeLlmsTxt("# Title\n- https://example.com/").useful).toBe(false);
  });

  it("accepts a minimal v2-shaped file", () => {
    const v2 = `# Acme
> Makes widgets for factories.

Use this index to find LLM-readable pages about Acme.

## Docs
- [Home](https://example.com/): Company overview
## Optional
- [Blog](https://example.com/blog): News
`;
    expect(analyzeLlmsTxt(v2)).toEqual({ present: true, useful: true });
  });
});
