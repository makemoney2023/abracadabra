import { describe, expect, it } from "vitest";
import { extractFactsFromHtml } from "@/lib/facts/extract-from-html";

const sampleHtml = `<!doctype html>
<html>
<head>
  <title>Acme Widgets</title>
  <meta name="description" content="Widgets for modern teams" />
  <meta property="og:image" content="https://acme.example/og.png" />
  <link rel="icon" href="https://acme.example/favicon.ico" />
</head>
<body>
  <a href="mailto:hello@acme.example">Email us</a>
  <a href="tel:+15550100">Call</a>
  <a href="https://linkedin.com/company/acme">LinkedIn</a>
  <a href="https://twitter.com/acme">Twitter</a>
  <img src="https://acme.example/logo.png" class="site-logo" alt="Acme" />
</body>
</html>`;

describe("extractFactsFromHtml", () => {
  it("extracts title, description, contacts, logo, and sameAs", () => {
    const facts = extractFactsFromHtml(sampleHtml);
    expect(facts.businessName).toBe("Acme Widgets");
    expect(facts.description).toBe("Widgets for modern teams");
    expect(facts.emails).toContain("hello@acme.example");
    expect(facts.phones.some((p) => p.includes("555"))).toBe(true);
    expect(facts.logoUrl).toBe("https://acme.example/og.png");
    expect(facts.sameAs).toEqual(
      expect.arrayContaining([
        "https://linkedin.com/company/acme",
        "https://twitter.com/acme",
      ]),
    );
  });
});
