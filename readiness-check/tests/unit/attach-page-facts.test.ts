import { describe, expect, it } from "vitest";
import { attachFactsToPages } from "@/lib/scan/attach-page-facts";
import type { DetectedPage } from "@/lib/types";

describe("attachFactsToPages", () => {
  it("stores PageFacts in evidence from markdown and JSON-LD blocks", () => {
    const pages: DetectedPage[] = [
      {
        url: "https://acme.example/",
        pageType: "home",
        fetchStatus: "ok",
        hasJsonLd: true,
        schemaTypes: ["Organization"],
      },
    ];

    const result = attachFactsToPages(pages, {
      markdownByUrl: new Map([
        ["https://acme.example/", "Email support@acme.example"],
      ]),
      jsonLdBlocksByUrl: new Map([
        [
          "https://acme.example/",
          [
            {
              "@type": "Organization",
              name: "Acme",
              logo: "https://acme.example/logo.png",
            },
          ],
        ],
      ]),
    });

    expect(result[0]?.evidence?.businessName).toBe("Acme");
    expect(result[0]?.evidence?.emails).toContain("support@acme.example");
    expect(result[0]?.evidence?.logoUrl).toBe("https://acme.example/logo.png");
    expect(result[0]?.evidence?.existingTypes).toContain("Organization");
  });
});
