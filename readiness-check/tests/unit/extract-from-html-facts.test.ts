import { describe, expect, it } from "vitest";
import { extractFactsFromHtml } from "@/lib/facts/extract-from-html";

describe("extractFactsFromHtml", () => {
  it("extracts NAP, hours, reviews, and howto steps", () => {
    const html = `
      <html><head><title>Cafe</title>
      <meta property="og:type" content="article" />
      <meta property="og:title" content="How we brew" />
      </head><body>
        <a href="mailto:hi@cafe.example">email</a>
        <a href="tel:+15551212">call</a>
        <a href="https://www.instagram.com/cafe">ig</a>
        <div itemtype="https://schema.org/PostalAddress">
          <span itemprop="streetAddress">1 Main St</span>
          <span itemprop="addressLocality">Boston</span>
          <span itemprop="addressCountry">US</span>
        </div>
        <meta itemprop="openingHours" content="Mo-Fr 09:00-17:00" />
        <div class="testimonial">Great coffee and friendly staff every morning. — Alice Smith</div>
        <ol class="howto-steps">
          <li>Grind the beans finely for espresso shots</li>
          <li>Pull a double shot and steam the milk</li>
        </ol>
        <form role="search" action="https://cafe.example/search">
          <input type="search" name="q" />
        </form>
      </body></html>
    `;
    const facts = extractFactsFromHtml(html);
    expect(facts.emails).toContain("hi@cafe.example");
    expect(facts.phones.length).toBeGreaterThan(0);
    expect(facts.sameAs.some((u) => u.includes("instagram.com"))).toBe(true);
    expect(facts.address?.streetAddress).toContain("1 Main St");
    expect(facts.address?.addressLocality).toBe("Boston");
    expect(facts.openingHours?.some((h) => h.includes("Mo-Fr"))).toBe(true);
    expect(facts.reviews.length).toBeGreaterThan(0);
    expect(facts.howtoSteps.length).toBeGreaterThanOrEqual(2);
    expect(facts.hasSiteSearch).toBe(true);
    expect(facts.searchUrlTemplate).toContain("{search_term_string}");
    expect(facts.headline).toBe("How we brew");
  });
});
