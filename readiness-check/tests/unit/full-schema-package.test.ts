import { describe, expect, it } from "vitest";
import { fullSchemaPackage } from "@/lib/fixes/full-schema";
import type { FixPackageInput } from "@/lib/fixes/generate-package";

const input: FixPackageInput = {
  domain: "northwind.example",
  origin: "https://northwind.example",
  businessName: "Northwind",
  findings: [
    { code: "NO_JSON_LD_HOME", passed: true, message: "home already marked" },
    { code: "MISSING_LLMS_TXT", passed: true, message: "llms present" },
    { code: "SITEMAP_MISSING", passed: true, message: "sitemap present" },
  ],
  pages: [
    {
      url: "https://northwind.example/",
      pageType: "home",
      fetchStatus: "ok",
      hasJsonLd: true,
      evidence: {
        businessName: "Northwind",
        emails: [],
        phones: [],
        sameAs: [],
        faqPairs: [],
        reviews: [],
        howtoSteps: [],
        existingTypes: ["Organization", "WebSite"],
        existingBlocks: [],
        hasSiteSearch: false,
      },
    },
    {
      url: "https://northwind.example/about",
      pageType: "about",
      fetchStatus: "ok",
      hasJsonLd: false,
      evidence: {
        emails: [],
        phones: [],
        sameAs: [],
        faqPairs: [],
        reviews: [],
        howtoSteps: [],
        existingTypes: [],
        existingBlocks: [],
        hasSiteSearch: false,
      },
    },
    {
      url: "https://northwind.example/missing",
      pageType: "other",
      fetchStatus: "failed",
      hasJsonLd: false,
    },
  ],
};

describe("fullSchemaPackage", () => {
  it("emits schema for every fetched page plus the site files", () => {
    const pkg = fullSchemaPackage(input);
    const paths = pkg.files.map((file) => file.path);
    expect(paths).toContain("json-ld/home.jsonld");
    expect(paths).toContain("json-ld/pages/about-about.jsonld");
    expect(paths).toContain("llms.txt");
    expect(paths).toContain("llms-full.txt");
    expect(paths).toContain("sitemap.xml");
    expect(paths).toContain("robots.txt");
    expect(paths.some((path) => path.includes("missing"))).toBe(false);
  });

  it("leaves out ratings and placeholder copy the scan did not find", () => {
    const pkg = fullSchemaPackage(input);
    const home = pkg.files.find((file) => file.path === "json-ld/home.jsonld")?.content ?? "";
    const doc = JSON.parse(home) as { "@graph": Array<Record<string, unknown>> };
    const org = doc["@graph"].find((node) => node["@type"] === "Organization");
    expect(org?.name).toBe("Northwind");
    expect(org?.aggregateRating).toBeUndefined();
    expect(home).not.toContain("TODO");
    expect(home).not.toMatch(/\$\d/);
  });
});
