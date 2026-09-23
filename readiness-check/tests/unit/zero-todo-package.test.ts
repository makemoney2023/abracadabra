import { describe, expect, it } from "vitest";
import { generateFixPackage, type FixPackageInput } from "@/lib/fixes/generate-package";

const richInput: FixPackageInput = {
  domain: "acme.example",
  origin: "https://acme.example",
  businessName: "Acme Corp",
  findings: [
    { code: "NO_JSON_LD_HOME", passed: false, message: "home" },
    { code: "MISSING_FAQ_SCHEMA", passed: false, message: "faq" },
    { code: "SITEMAP_MISSING", passed: false, message: "sitemap" },
    { code: "EMPTY_LLMS_TXT", passed: false, message: "llms" },
  ],
  pages: [
    {
      url: "https://acme.example/",
      pageType: "home",
      fetchStatus: "ok",
      hasJsonLd: false,
      evidence: {
        businessName: "Acme Corp",
        description: "Widgets for teams",
        emails: ["hello@acme.example"],
        phones: ["+1-555-0100"],
        logoUrl: "https://acme.example/logo.png",
        sameAs: ["https://linkedin.com/company/acme"],
        address: {
          streetAddress: "1 Main St",
          addressLocality: "Boston",
          addressRegion: "MA",
          postalCode: "02101",
          addressCountry: "US",
        },
        faqPairs: [{ question: "What is Acme?", answer: "A widget company." }],
        hasSiteSearch: true,
        existingTypes: [],
        existingBlocks: [],
      },
    },
    {
      url: "https://acme.example/about",
      pageType: "about",
      fetchStatus: "ok",
      hasJsonLd: false,
      evidence: {
        emails: [],
        phones: [],
        sameAs: [],
        faqPairs: [],
        hasSiteSearch: false,
        existingTypes: [],
        existingBlocks: [],
      },
    },
    {
      url: "https://acme.example/faq",
      pageType: "faq",
      fetchStatus: "ok",
      hasJsonLd: false,
      evidence: {
        emails: [],
        phones: [],
        sameAs: [],
        faqPairs: [{ question: "What is Acme?", answer: "A widget company." }],
        hasSiteSearch: false,
        existingTypes: [],
        existingBlocks: [],
      },
    },
  ],
};

describe("zero-TODO fix packages", () => {
  it("never emits TODO_ when facts cover selected artifacts", () => {
    const pkg = generateFixPackage(richInput, {
      llmsTxt: true,
      llmsFullTxt: true,
      sitemapXml: true,
      robotsTxt: false,
      faqJsonLd: true,
      pageUrls: ["https://acme.example/", "https://acme.example/about", "https://acme.example/faq"],
      businessType: "Organization",
      includeSearchAction: true,
    });

    for (const file of pkg.files) {
      expect(file.content, file.path).not.toMatch(/TODO_/);
    }
    expect(pkg.validation.todoCount).toBe(0);
    expect(pkg.validation.ok).toBe(true);
  });

  it("omits optional org fields when unknown instead of inventing TODOs", () => {
    const pkg = generateFixPackage(
      {
        domain: "thin.example",
        origin: "https://thin.example",
        businessName: "Thin Co",
        findings: [{ code: "NO_JSON_LD_HOME", passed: false, message: "home" }],
        pages: [
          {
            url: "https://thin.example/",
            pageType: "home",
            fetchStatus: "ok",
            hasJsonLd: false,
          },
        ],
      },
      {
        pageUrls: ["https://thin.example/"],
        businessType: "Organization",
        llmsTxt: false,
        sitemapXml: false,
        robotsTxt: false,
        faqJsonLd: false,
      },
    );

    const home = pkg.files.find((f) => f.path === "json-ld/home.jsonld")!.content;
    expect(home).not.toMatch(/TODO_/);
    expect(home).not.toMatch(/"email"/);
    expect(home).not.toMatch(/"telephone"/);
    expect(home).not.toMatch(/"logo"/);
    expect(home).not.toMatch(/"sameAs"/);
  });

  it("skips FAQ artifact when no pairs exist", () => {
    const pkg = generateFixPackage(
      {
        domain: "nofaq.example",
        origin: "https://nofaq.example",
        findings: [{ code: "MISSING_FAQ_SCHEMA", passed: false, message: "faq" }],
        pages: [],
      },
      {
        faqJsonLd: true,
        llmsTxt: false,
        sitemapXml: false,
        robotsTxt: false,
        pageUrls: [],
      },
    );
    expect(pkg.files.some((f) => f.path.includes("faq"))).toBe(false);
  });
});
