import { describe, expect, it } from "vitest";
import { extractPageFacts } from "@/lib/facts/extract-page-facts";

describe("extractPageFacts", () => {
  it("pulls Organization fields and SearchAction from JSON-LD blocks", () => {
    const facts = extractPageFacts({
      markdown: "",
      jsonLdBlocks: [
        {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "Acme Corp",
              description: "Widgets for everyone",
              email: "hello@acme.example",
              telephone: "+1-555-0100",
              logo: "https://acme.example/logo.png",
              sameAs: ["https://linkedin.com/company/acme"],
              address: {
                "@type": "PostalAddress",
                streetAddress: "1 Main St",
                addressLocality: "Boston",
                addressRegion: "MA",
                postalCode: "02101",
                addressCountry: "US",
              },
            },
            {
              "@type": "WebSite",
              potentialAction: {
                "@type": "SearchAction",
                target: "https://acme.example/search?q={search_term_string}",
              },
            },
          ],
        },
      ],
    });

    expect(facts.businessName).toBe("Acme Corp");
    expect(facts.description).toBe("Widgets for everyone");
    expect(facts.emails).toContain("hello@acme.example");
    expect(facts.phones).toContain("+1-555-0100");
    expect(facts.logoUrl).toBe("https://acme.example/logo.png");
    expect(facts.sameAs).toContain("https://linkedin.com/company/acme");
    expect(facts.address).toMatchObject({
      streetAddress: "1 Main St",
      addressLocality: "Boston",
      addressRegion: "MA",
      postalCode: "02101",
      addressCountry: "US",
    });
    expect(facts.hasSiteSearch).toBe(true);
    expect(facts.existingTypes).toEqual(
      expect.arrayContaining(["Organization", "WebSite"]),
    );
  });

  it("extracts FAQ pairs from FAQPage JSON-LD", () => {
    const facts = extractPageFacts({
      markdown: "",
      jsonLdBlocks: [
        {
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is AEO?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Answer Engine Optimization.",
              },
            },
          ],
        },
      ],
    });

    expect(facts.faqPairs).toEqual([
      { question: "What is AEO?", answer: "Answer Engine Optimization." },
    ]);
  });

  it("extracts BlogPosting article fields", () => {
    const facts = extractPageFacts({
      markdown: "",
      jsonLdBlocks: [
        {
          "@type": "BlogPosting",
          headline: "Hello World",
          datePublished: "2024-01-05",
          dateModified: "2024-02-01",
          image: "https://acme.example/post.jpg",
        },
      ],
    });

    expect(facts.headline).toBe("Hello World");
    expect(facts.datePublished).toBe("2024-01-05");
    expect(facts.dateModified).toBe("2024-02-01");
    expect(facts.image).toBe("https://acme.example/post.jpg");
  });

  it("finds emails/phones and search hint from markdown when JSON-LD is empty", () => {
    const facts = extractPageFacts({
      markdown:
        "Contact us at sales@acme.example or call (555) 222-3333. Try [/search?q=widgets](https://acme.example/search?q=widgets).",
      jsonLdBlocks: [],
    });

    expect(facts.emails).toContain("sales@acme.example");
    expect(facts.phones.some((p) => p.includes("555"))).toBe(true);
    expect(facts.hasSiteSearch).toBe(true);
  });

  it("caps existingBlocks payload size", () => {
    const huge = { "@type": "WebPage", name: "x".repeat(60_000) };
    const facts = extractPageFacts({
      markdown: "",
      jsonLdBlocks: [huge],
    });

    const size = JSON.stringify(facts.existingBlocks).length;
    expect(size).toBeLessThanOrEqual(50_000);
    expect(facts.existingTypes).toContain("WebPage");
  });
});
