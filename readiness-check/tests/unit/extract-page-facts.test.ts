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

  it("keeps the office email and one phone from a page title and script noise", () => {
    const html = `<!doctype html><html><head>
      <title>All-on-4 Dental Implants Ottawa | Renew Implants</title>
      <script src="/assets/scripts.js?v=1791570015"></script>
    </head><body>
      <a href="tel:613-841-6111">613-841-6111</a>
      <a href="tel:+16138416111">+16138416111</a>
      <a href="tel:6138416111">6138416111</a>
      <a href="/cdn-cgi/l/email-protection#177e7971785765727972607e7a677b76796364397476" data-cfemail="177e7971785765727972607e7a677b76796364397476">email</a>
      <svg><path d="M134.38984417525506 56.63179261412644"/></svg>
      <p>Call 613-841-6111</p>
    </body></html>`;
    const facts = extractPageFacts({ markdown: html, html, jsonLdBlocks: [] });
    expect(facts.emails).toEqual(["info@renewimplants.ca"]);
    expect(facts.phones).toEqual(["613-841-6111"]);
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
