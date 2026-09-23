import { describe, expect, it } from "vitest";
import { mergeDesiredSchema } from "@/lib/fixes/merge-schema";

describe("mergeDesiredSchema", () => {
  it("emits only missing types from a desired @graph", () => {
    const result = mergeDesiredSchema({
      existingTypes: ["Organization"],
      desired: {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Acme" },
          { "@type": "WebSite", name: "Acme" },
          { "@type": "BreadcrumbList", itemListElement: [] },
        ],
      },
    });

    expect(result.allPresent).toBe(false);
    expect(result.skippedTypes).toContain("Organization");
    expect(result.emittedTypes).toEqual(expect.arrayContaining(["WebSite", "BreadcrumbList"]));
    const graph = result.document?.["@graph"] as Array<{ "@type": string }>;
    expect(graph.map((n) => n["@type"])).not.toContain("Organization");
  });

  it("returns null when all core target types already exist", () => {
    const result = mergeDesiredSchema({
      existingTypes: ["AboutPage", "BreadcrumbList"],
      desired: {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "AboutPage", name: "About" },
          { "@type": "BreadcrumbList", itemListElement: [] },
        ],
      },
    });

    expect(result.document).toBeNull();
    expect(result.allPresent).toBe(true);
  });
});
