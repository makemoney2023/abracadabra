import { describe, expect, it } from "vitest";
import {
  buildHomeJsonLd,
  buildOrganizationNode,
  buildPageJsonLd,
  imageObject,
  openingHoursSpecifications,
  postalAddressNode,
} from "@/lib/fixes/jsonld-templates";
import type { PageFacts } from "@/lib/facts/types";
import { emptyPageFacts } from "@/lib/facts/types";

const origin = "https://acme.example";

function biz(overrides: Partial<Parameters<typeof buildOrganizationNode>[1]> = {}) {
  return {
    name: "Acme Dental",
    businessType: "Dentist",
    email: "hello@acme.example",
    phone: "+1-555-0100",
    logoUrl: "https://acme.example/logo.png",
    sameAs: ["https://linkedin.com/company/acme"],
    description: "Family dentistry in Austin.",
    address: {
      streetAddress: "100 Main St",
      addressLocality: "Austin",
      addressRegion: "TX",
      postalCode: "78701",
      addressCountry: "US",
    },
    geo: { latitude: 30.2672, longitude: -97.7431 },
    openingHours: ["Monday 09:00-17:00", "Tuesday 09:00-17:00"],
    hasSiteSearch: true,
    includeSearchAction: true,
    searchUrlTemplate: "https://acme.example/search?q={search_term_string}",
    faqPairs: [],
    reviews: [],
    howtoSteps: [],
    ...overrides,
  };
}

function facts(overrides: Partial<PageFacts> = {}): PageFacts {
  return { ...emptyPageFacts(), ...overrides };
}

describe("jsonld-templates helpers", () => {
  it("builds ImageObject with url + contentUrl", () => {
    expect(imageObject("https://acme.example/a.jpg")).toEqual({
      "@type": "ImageObject",
      url: "https://acme.example/a.jpg",
      contentUrl: "https://acme.example/a.jpg",
    });
  });

  it("builds PostalAddress omitting empty fields", () => {
    expect(
      postalAddressNode({
        addressLocality: "Austin",
        addressRegion: "TX",
        addressCountry: "US",
      }),
    ).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Austin",
      addressRegion: "TX",
      addressCountry: "US",
    });
  });

  it("parses day + time opening hours into OpeningHoursSpecification", () => {
    const specs = openingHoursSpecifications(["Monday 09:00-17:00", "garbage"]);
    expect(specs).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Monday",
        opens: "09:00",
        closes: "17:00",
      },
    ]);
  });
});

describe("buildOrganizationNode", () => {
  it("emits Google-oriented Organization fields when known", () => {
    const org = buildOrganizationNode(origin, biz());
    expect(org["@type"]).toBe("Dentist");
    expect(org["@id"]).toBe(`${origin}/#organization`);
    expect(org.image).toEqual(imageObject("https://acme.example/logo.png"));
    expect(org.logo).toMatchObject({
      "@type": "ImageObject",
      url: "https://acme.example/logo.png",
      width: 112,
      height: 112,
    });
    expect(org.areaServed).toEqual({
      "@type": "AdministrativeArea",
      name: "Austin, TX, US",
    });
    expect(org.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 30.2672,
      longitude: -97.7431,
    });
    expect(org.openingHoursSpecification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "https://schema.org/Monday",
        }),
      ]),
    );
    expect(org.contactPoint).toMatchObject({
      "@type": "ContactPoint",
      contactType: "customer service",
      email: "hello@acme.example",
      telephone: "+1-555-0100",
      areaServed: "US",
      url: `${origin}/`,
    });
    expect(org).not.toHaveProperty("AggregateRating");
  });

  it("omits optional fields when unknown (zero-TODO)", () => {
    const org = buildOrganizationNode(origin, {
      name: "Sparse Co",
      businessType: "Organization",
      sameAs: [],
      faqPairs: [],
      reviews: [],
      howtoSteps: [],
      hasSiteSearch: false,
      includeSearchAction: false,
    });
    expect(org.logo).toBeUndefined();
    expect(org.image).toBeUndefined();
    expect(org.geo).toBeUndefined();
    expect(org.areaServed).toBeUndefined();
    expect(org.contactPoint).toBeUndefined();
    expect(JSON.stringify(org)).not.toMatch(/TODO_/);
  });
});

describe("buildHomeJsonLd", () => {
  it("includes WebSite description + SearchAction and SoftwareApplication offers when known", () => {
    const home = buildHomeJsonLd(origin, biz({ businessType: "SoftwareApplication" }), {
      freeOfferPrice: "0",
      freeOfferCurrency: "USD",
    });
    const graph = home["@graph"] as Array<Record<string, unknown>>;
    expect(graph.some((n) => n["@type"] === "Organization")).toBe(true);
    const site = graph.find((n) => n["@type"] === "WebSite")!;
    expect(site.description).toBe("Family dentistry in Austin.");
    expect(site.about).toEqual({ "@id": `${origin}/#organization` });
    expect(site.potentialAction).toMatchObject({ "@type": "SearchAction" });
    const app = graph.find((n) => n["@type"] === "SoftwareApplication")!;
    expect(app.offers).toEqual({
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    });
    expect(app.description).toBe("Family dentistry in Austin.");
  });
});

describe("buildPageJsonLd", () => {
  it("enriches AboutPage with description and primaryImageOfPage", () => {
    const doc = buildPageJsonLd({
      origin,
      pageUrl: `${origin}/about`,
      pageType: "about",
      biz: biz(),
      facts: facts({
        description: "Our story since 1998.",
        image: "https://acme.example/team.jpg",
      }),
    });
    const about = (doc["@graph"] as Array<Record<string, unknown>>).find(
      (n) => n["@type"] === "AboutPage",
    )!;
    expect(about.description).toBe("Our story since 1998.");
    expect(about.primaryImageOfPage).toEqual(imageObject("https://acme.example/team.jpg"));
    expect(about.inLanguage).toBe("en");
  });

  it("emits Product with image and Offer only when price is known", () => {
    const thin = buildPageJsonLd({
      origin,
      pageUrl: `${origin}/products/widget`,
      pageType: "product",
      biz: biz({ businessType: "Organization" }),
      facts: facts({ headline: "Widget", description: "A widget", image: `${origin}/w.jpg` }),
    });
    const product = (thin["@graph"] as Array<Record<string, unknown>>).find(
      (n) => n["@type"] === "Product",
    )!;
    expect(product.image).toEqual(imageObject(`${origin}/w.jpg`));
    expect(product.offers).toBeUndefined();

    const priced = buildPageJsonLd({
      origin,
      pageUrl: `${origin}/products/widget`,
      pageType: "product",
      biz: biz({ businessType: "Organization" }),
      facts: facts({
        headline: "Widget",
        freeOfferPrice: "29.00",
        freeOfferCurrency: "USD",
        image: `${origin}/w.jpg`,
      }),
    });
    const product2 = (priced["@graph"] as Array<Record<string, unknown>>).find(
      (n) => n["@type"] === "Product",
    )!;
    expect(product2.offers).toEqual({
      "@type": "Offer",
      price: "29.00",
      priceCurrency: "USD",
      url: `${origin}/products/widget`,
      availability: "https://schema.org/InStock",
    });
  });

  it("emits Event with location from org address and startDate from facts", () => {
    const doc = buildPageJsonLd({
      origin,
      pageUrl: `${origin}/events/gala`,
      pageType: "event",
      biz: biz(),
      facts: facts({
        headline: "Summer Gala",
        description: "Annual fundraiser",
        datePublished: "2026-08-20T18:00:00",
        dateModified: "2026-08-20T22:00:00",
        image: `${origin}/gala.jpg`,
      }),
    });
    const event = (doc["@graph"] as Array<Record<string, unknown>>).find(
      (n) => n["@type"] === "Event",
    )!;
    expect(event.startDate).toBe("2026-08-20T18:00:00");
    expect(event.endDate).toBe("2026-08-20T22:00:00");
    expect(event.location).toMatchObject({
      "@type": "Place",
      name: "Acme Dental",
      address: expect.objectContaining({ addressLocality: "Austin" }),
    });
    expect(event.image).toEqual(imageObject(`${origin}/gala.jpg`));
  });

  it("emits JobPosting with datePosted and jobLocation when known", () => {
    const doc = buildPageJsonLd({
      origin,
      pageUrl: `${origin}/careers/hygienist`,
      pageType: "careers",
      biz: biz(),
      facts: facts({
        headline: "Dental Hygienist",
        description: "Full-time chairside role.",
        datePublished: "2026-08-01",
      }),
    });
    const job = (doc["@graph"] as Array<Record<string, unknown>>).find(
      (n) => n["@type"] === "JobPosting",
    )!;
    expect(job.datePosted).toBe("2026-08-01");
    expect(job.jobLocation).toMatchObject({
      "@type": "Place",
      address: expect.objectContaining({ addressLocality: "Austin" }),
    });
    expect(job.hiringOrganization).toMatchObject({
      "@type": "Organization",
      "@id": `${origin}/#organization`,
      name: "Acme Dental",
      sameAs: ["https://linkedin.com/company/acme"],
    });
  });

  it("emits BlogPosting with ImageObject and dateModified", () => {
    const doc = buildPageJsonLd({
      origin,
      pageUrl: `${origin}/blog/2024/welcome`,
      pageType: "blogPost",
      biz: biz({ businessType: "Organization" }),
      facts: facts({
        headline: "Welcome",
        description: "Hello world",
        datePublished: "2024-01-15",
        image: `${origin}/hero.jpg`,
      }),
    });
    const posting = (doc["@graph"] as Array<Record<string, unknown>>).find(
      (n) => n["@type"] === "BlogPosting",
    )!;
    expect(posting.image).toEqual(imageObject(`${origin}/hero.jpg`));
    expect(posting.description).toBe("Hello world");
    expect(posting.dateModified).toBe("2024-01-15");
    expect(posting.author).toMatchObject({
      "@type": "Organization",
      "@id": `${origin}/#organization`,
      name: "Acme Dental",
    });
  });

  it("enriches Service with areaServed and description", () => {
    const doc = buildPageJsonLd({
      origin,
      pageUrl: `${origin}/services/cleaning`,
      pageType: "service",
      biz: biz(),
      facts: facts({
        headline: "Teeth Cleaning",
        description: "Professional cleaning",
      }),
    });
    const service = (doc["@graph"] as Array<Record<string, unknown>>).find(
      (n) => n["@type"] === "Service",
    )!;
    expect(service.description).toBe("Professional cleaning");
    expect(service.areaServed).toEqual({
      "@type": "AdministrativeArea",
      name: "Austin, TX, US",
    });
    expect(service.provider).toEqual({ "@id": `${origin}/#organization` });
  });
});
