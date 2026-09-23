import { describe, expect, it } from "vitest";
import type { FixPackageInput } from "@/lib/fixes/generate-package";
import { computeRequiredFields } from "@/lib/fixes/required-fields";

const baseInput: FixPackageInput = {
  domain: "example.com",
  origin: "https://example.com",
  businessName: "Example Co",
  findings: [
    { code: "NO_JSON_LD_HOME", passed: false, message: "home" },
    { code: "MISSING_FAQ_SCHEMA", passed: false, message: "faq" },
  ],
  pages: [
    {
      url: "https://example.com/",
      pageType: "home",
      fetchStatus: "ok",
      hasJsonLd: false,
    },
  ],
};

describe("computeRequiredFields", () => {
  it("requires address fields when LocalBusiness home schema is selected without address", () => {
    const fields = computeRequiredFields(baseInput, {
      pageUrls: ["https://example.com/"],
      businessType: "LocalBusiness",
      llmsTxt: false,
      sitemapXml: false,
      robotsTxt: false,
      faqJsonLd: false,
    });
    expect(fields.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        "streetAddress",
        "addressLocality",
        "addressCountry",
      ]),
    );
  });

  it("requires FAQ pairs when FAQ is selected without facts or overrides", () => {
    const fields = computeRequiredFields(baseInput, {
      faqJsonLd: true,
      pageUrls: [],
      llmsTxt: false,
      sitemapXml: false,
      robotsTxt: false,
    });
    expect(fields.some((f) => f.id === "faqPairs")).toBe(true);
  });

  it("returns empty when Organization home has name and FAQ has pairs", () => {
    const fields = computeRequiredFields(
      {
        ...baseInput,
        pages: [
          {
            url: "https://example.com/",
            pageType: "home",
            fetchStatus: "ok",
            hasJsonLd: false,
            evidence: {
              emails: [],
              phones: [],
              sameAs: [],
              faqPairs: [{ question: "What do you do?", answer: "We help." }],
              hasSiteSearch: false,
              existingTypes: [],
              existingBlocks: [],
            },
          },
        ],
      },
      {
        pageUrls: ["https://example.com/"],
        businessType: "Organization",
        faqJsonLd: true,
        llmsTxt: false,
        sitemapXml: false,
        robotsTxt: false,
      },
    );
    expect(fields).toEqual([]);
  });
});
