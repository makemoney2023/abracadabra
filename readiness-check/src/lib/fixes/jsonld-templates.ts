/**
 * Richer Schema.org JSON-LD builders for fix packages.
 * Only emit properties we can fill from scan facts / user overrides — never invent
 * ratings, prices, hours, or FAQ/HowTo copy.
 */

import type { BusinessType, FaqPair, PageFacts, PostalAddressFacts } from "@/lib/facts/types";
import { isLocalBusinessFamily } from "@/lib/schema-org/organization-types";

export type JsonLdBiz = {
  name: string;
  businessType: BusinessType;
  email?: string;
  phone?: string;
  logoUrl?: string;
  sameAs: string[];
  description?: string;
  address?: PostalAddressFacts;
  geo?: { latitude: number; longitude: number };
  hasSiteSearch: boolean;
  includeSearchAction: boolean;
  searchUrlTemplate?: string;
  openingHours?: string[];
  faqPairs: FaqPair[];
  reviews: PageFacts["reviews"];
  howtoSteps: PageFacts["howtoSteps"];
};

export type HomeExtras = {
  freeOfferPrice?: string;
  freeOfferCurrency?: string;
};

export type PageJsonLdInput = {
  origin: string;
  pageUrl: string;
  pageType: string;
  biz: JsonLdBiz;
  facts: PageFacts;
};

const DAY_ALIASES: Record<string, string> = {
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tues: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thur: "Thursday",
  thurs: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
  sun: "Sunday",
  sunday: "Sunday",
};

function originBase(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

export function imageObject(
  url: string,
  dims?: { width?: number; height?: number },
): Record<string, unknown> {
  const img: Record<string, unknown> = {
    "@type": "ImageObject",
    url,
    contentUrl: url,
  };
  if (dims?.width != null) img.width = dims.width;
  if (dims?.height != null) img.height = dims.height;
  return img;
}

export function postalAddressNode(
  address: PostalAddressFacts,
): Record<string, unknown> | undefined {
  const addr: Record<string, unknown> = { "@type": "PostalAddress" };
  if (address.streetAddress) addr.streetAddress = address.streetAddress;
  if (address.addressLocality) addr.addressLocality = address.addressLocality;
  if (address.addressRegion) addr.addressRegion = address.addressRegion;
  if (address.postalCode) addr.postalCode = address.postalCode;
  if (address.addressCountry) addr.addressCountry = address.addressCountry;
  if (Object.keys(addr).length <= 1) return undefined;
  return addr;
}

export function areaServedFromAddress(
  address?: PostalAddressFacts,
): Record<string, unknown> | undefined {
  if (!address) return undefined;
  const parts = [address.addressLocality, address.addressRegion, address.addressCountry].filter(
    Boolean,
  ) as string[];
  if (parts.length === 0) return undefined;
  return {
    "@type": "AdministrativeArea",
    name: parts.join(", "),
  };
}

export function openingHoursSpecifications(
  hours: string[] | undefined,
): Array<Record<string, unknown>> {
  if (!hours?.length) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const raw of hours) {
    const m = raw
      .trim()
      .match(
        /^([A-Za-z]+)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/,
      );
    if (!m) continue;
    const dayKey = (m[1] ?? "").toLowerCase();
    const day = DAY_ALIASES[dayKey];
    if (!day) continue;
    out.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${day}`,
      opens: m[2],
      closes: m[3],
    });
  }
  return out;
}

function placeFromBiz(biz: JsonLdBiz): Record<string, unknown> | undefined {
  const address = biz.address ? postalAddressNode(biz.address) : undefined;
  if (!address && !biz.geo) return undefined;
  const place: Record<string, unknown> = {
    "@type": "Place",
    name: biz.name,
  };
  if (address) place.address = address;
  if (biz.geo) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: biz.geo.latitude,
      longitude: biz.geo.longitude,
    };
  }
  return place;
}

export function buildOrganizationNode(
  origin: string,
  biz: JsonLdBiz,
): Record<string, unknown> {
  const base = originBase(origin);
  const orgType =
    biz.businessType === "SoftwareApplication" || !biz.businessType
      ? "Organization"
      : biz.businessType;

  const org: Record<string, unknown> = {
    "@type": orgType,
    "@id": `${base}/#organization`,
    name: biz.name,
    url: `${base}/`,
  };

  if (biz.description) org.description = biz.description;
  if (biz.email) org.email = biz.email;
  if (biz.phone) org.telephone = biz.phone;
  if (biz.logoUrl) {
    org.logo = imageObject(biz.logoUrl, { width: 112, height: 112 });
    org.image = imageObject(biz.logoUrl);
  }
  if (biz.sameAs.length > 0) org.sameAs = biz.sameAs;

  const specs = openingHoursSpecifications(biz.openingHours);
  if (specs.length > 0) org.openingHoursSpecification = specs;
  else if (biz.openingHours?.length) org.openingHours = biz.openingHours;

  if (biz.email || biz.phone) {
    const contactPoint: Record<string, unknown> = {
      "@type": "ContactPoint",
      contactType: "customer service",
      url: `${base}/`,
    };
    if (biz.email) contactPoint.email = biz.email;
    if (biz.phone) contactPoint.telephone = biz.phone;
    if (biz.address?.addressCountry) contactPoint.areaServed = biz.address.addressCountry;
    org.contactPoint = contactPoint;
  }

  const address = biz.address ? postalAddressNode(biz.address) : undefined;
  if (address) org.address = address;

  const area = areaServedFromAddress(biz.address);
  if (area) org.areaServed = area;

  if (biz.geo && (isLocalBusinessFamily(orgType) || orgType === "LocalBusiness")) {
    org.geo = {
      "@type": "GeoCoordinates",
      latitude: biz.geo.latitude,
      longitude: biz.geo.longitude,
    };
  } else if (biz.geo) {
    // Still useful on Organization when coordinates were extracted
    org.geo = {
      "@type": "GeoCoordinates",
      latitude: biz.geo.latitude,
      longitude: biz.geo.longitude,
    };
  }

  return org;
}

export function buildHomeJsonLd(
  origin: string,
  biz: JsonLdBiz,
  extras: HomeExtras = {},
): Record<string, unknown> {
  const base = originBase(origin);
  const graph: Record<string, unknown>[] = [buildOrganizationNode(base, biz)];

  if (biz.businessType === "SoftwareApplication") {
    const app: Record<string, unknown> = {
      "@type": "SoftwareApplication",
      "@id": `${base}/#app`,
      name: biz.name,
      url: `${base}/`,
      operatingSystem: "Web",
      publisher: { "@id": `${base}/#organization` },
    };
    if (biz.description) app.description = biz.description;
    if (extras.freeOfferPrice) {
      app.offers = {
        "@type": "Offer",
        price: extras.freeOfferPrice,
        priceCurrency: extras.freeOfferCurrency || "USD",
      };
    }
    graph.push(app);
  }

  const website: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: biz.name,
    url: `${base}/`,
    publisher: { "@id": `${base}/#organization` },
    about: { "@id": `${base}/#organization` },
    inLanguage: "en",
  };
  if (biz.description) website.description = biz.description;

  if (biz.searchUrlTemplate && biz.searchUrlTemplate.includes("{search_term_string}")) {
    website.potentialAction = {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: biz.searchUrlTemplate,
      },
      "query-input": "required name=search_term_string",
    };
  } else if (biz.includeSearchAction && biz.hasSiteSearch) {
    website.potentialAction = {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    };
  }

  graph.push(website);
  return { "@context": "https://schema.org", "@graph": graph };
}

function pageLabel(pageType: string): string {
  switch (pageType) {
    case "about":
      return "About";
    case "contact":
      return "Contact";
    case "faq":
      return "FAQ";
    case "blog":
    case "blogPost":
      return "Blog";
    case "service":
      return "Services";
    case "pricing":
      return "Pricing";
    case "howto":
      return "How-to";
    case "product":
      return "Product";
    case "testimonial":
      return "Testimonials";
    case "appointment":
      return "Appointment";
    case "event":
      return "Event";
    case "careers":
      return "Careers";
    case "menu":
      return "Menu";
    default:
      return "Page";
  }
}

function isBlogPostUrl(url: string): boolean {
  try {
    const segments = new URL(url).pathname.replace(/\/+/g, "/").replace(/^\/|\/$/g, "").split("/");
    if (segments.length >= 3) return true;
    if (segments.length === 2 && /\d{4}/.test(segments[1] ?? "")) return true;
    return false;
  } catch {
    return false;
  }
}

function buildBreadcrumbList(
  origin: string,
  pageUrl: string,
  pageName: string,
): Record<string, unknown> {
  const base = originBase(origin);
  return {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        item: { "@id": `${base}/`, name: "Home" },
      },
      {
        "@type": "ListItem",
        position: 2,
        item: { "@id": pageUrl, name: pageName },
      },
    ],
  };
}

function withWebPageExtras(
  node: Record<string, unknown>,
  facts: PageFacts,
): Record<string, unknown> {
  if (facts.description) node.description = facts.description;
  if (facts.image) node.primaryImageOfPage = imageObject(facts.image);
  if (facts.dateModified) node.dateModified = facts.dateModified;
  else if (facts.datePublished) node.dateModified = facts.datePublished;
  node.inLanguage = "en";
  return node;
}

function buildFaqDesired(pageUrl: string, pairs: FaqPair[]): Record<string, unknown> | null {
  const usable = pairs.filter((p) => p.question.trim() && p.answer.trim());
  if (usable.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    url: pageUrl,
    mainEntity: usable.map((p) => ({
      "@type": "Question",
      name: p.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: p.answer,
      },
    })),
  };
}

function hiringOrg(origin: string, biz: JsonLdBiz): Record<string, unknown> {
  const base = originBase(origin);
  const org: Record<string, unknown> = {
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: biz.name,
    url: `${base}/`,
  };
  if (biz.sameAs.length) org.sameAs = biz.sameAs;
  if (biz.logoUrl) org.logo = biz.logoUrl;
  return org;
}

export function buildPageJsonLd(input: PageJsonLdInput): Record<string, unknown> {
  const origin = originBase(input.origin);
  const { pageUrl, pageType, biz, facts } = input;
  const label = pageLabel(pageType);
  const breadcrumb = buildBreadcrumbList(origin, pageUrl, label);

  if (pageType === "faq") {
    const faq = buildFaqDesired(pageUrl, facts.faqPairs.length ? facts.faqPairs : biz.faqPairs);
    if (faq) return faq;
  }

  if (pageType === "about") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        withWebPageExtras(
          {
            "@type": "AboutPage",
            "@id": `${pageUrl}#webpage`,
            name: `About ${biz.name}`,
            url: pageUrl,
            isPartOf: { "@id": `${origin}/#website` },
            about: { "@id": `${origin}/#organization` },
            mainEntity: { "@id": `${origin}/#organization` },
            breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
          },
          facts,
        ),
        breadcrumb,
      ],
    };
  }

  if (pageType === "contact") {
    const mainEntity: Record<string, unknown> = {
      "@type": "ContactPoint",
      contactType: "customer service",
      url: pageUrl,
    };
    if (biz.email) mainEntity.email = biz.email;
    if (biz.phone) mainEntity.telephone = biz.phone;
    if (biz.address?.addressCountry) mainEntity.areaServed = biz.address.addressCountry;

    return {
      "@context": "https://schema.org",
      "@graph": [
        withWebPageExtras(
          {
            "@type": "ContactPage",
            "@id": `${pageUrl}#webpage`,
            name: `Contact ${biz.name}`,
            url: pageUrl,
            isPartOf: { "@id": `${origin}/#website` },
            about: { "@id": `${origin}/#organization` },
            mainEntity,
            breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
          },
          facts,
        ),
        breadcrumb,
      ],
    };
  }

  const asPost = pageType === "blogPost" || (pageType === "blog" && isBlogPostUrl(pageUrl));
  if (asPost && facts.headline) {
    const posting: Record<string, unknown> = {
      "@type": "BlogPosting",
      "@id": `${pageUrl}#article`,
      mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
      headline: facts.headline,
      url: pageUrl,
      isPartOf: { "@id": `${origin}/#website` },
      author: {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: biz.name,
        url: `${origin}/`,
      },
      publisher: { "@id": `${origin}/#organization` },
      breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
      inLanguage: "en",
    };
    if (facts.description) posting.description = facts.description;
    if (facts.image) posting.image = imageObject(facts.image);
    if (facts.datePublished) posting.datePublished = facts.datePublished;
    if (facts.dateModified || facts.datePublished) {
      posting.dateModified = facts.dateModified || facts.datePublished;
    }
    return { "@context": "https://schema.org", "@graph": [posting, breadcrumb] };
  }

  if (pageType === "blog" || (asPost && !facts.headline)) {
    return {
      "@context": "https://schema.org",
      "@graph": [
        withWebPageExtras(
          {
            "@type": asPost ? "WebPage" : "CollectionPage",
            "@id": `${pageUrl}#webpage`,
            name: facts.headline || `${biz.name} Blog`,
            url: pageUrl,
            isPartOf: { "@id": `${origin}/#website` },
            about: { "@id": `${origin}/#organization` },
            breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
          },
          facts,
        ),
        breadcrumb,
      ],
    };
  }

  if (pageType === "service") {
    const service: Record<string, unknown> = {
      "@type": "Service",
      "@id": `${pageUrl}#service`,
      name: facts.businessName || facts.headline || `${biz.name} Services`,
      url: pageUrl,
      provider: { "@id": `${origin}/#organization` },
      breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
    };
    if (facts.description) service.description = facts.description;
    if (facts.image) service.image = imageObject(facts.image);
    const area = areaServedFromAddress(biz.address);
    if (area) service.areaServed = area;
    return { "@context": "https://schema.org", "@graph": [service, breadcrumb] };
  }

  if (pageType === "pricing") {
    const graph: Record<string, unknown>[] = [
      withWebPageExtras(
        {
          "@type": "WebPage",
          "@id": `${pageUrl}#webpage`,
          name: `${biz.name} Pricing`,
          url: pageUrl,
          isPartOf: { "@id": `${origin}/#website` },
          about: { "@id": `${origin}/#organization` },
          breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        },
        facts,
      ),
      breadcrumb,
    ];
    if (facts.freeOfferPrice) {
      graph.push({
        "@type": "OfferCatalog",
        "@id": `${pageUrl}#offers`,
        name: `${biz.name} plans`,
        itemListElement: [
          {
            "@type": "Offer",
            name: "Free or trial offer",
            price: facts.freeOfferPrice,
            priceCurrency: facts.freeOfferCurrency || "USD",
            url: pageUrl,
          },
        ],
      });
    }
    return { "@context": "https://schema.org", "@graph": graph };
  }

  if (pageType === "product") {
    const product: Record<string, unknown> = {
      "@type": "Product",
      "@id": `${pageUrl}#product`,
      name: facts.headline || facts.businessName || `${biz.name} Product`,
      url: pageUrl,
      brand: { "@id": `${origin}/#organization` },
      breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
    };
    if (facts.description) product.description = facts.description;
    if (facts.image) product.image = imageObject(facts.image);
    if (facts.freeOfferPrice) {
      product.offers = {
        "@type": "Offer",
        price: facts.freeOfferPrice,
        priceCurrency: facts.freeOfferCurrency || "USD",
        url: pageUrl,
        availability: "https://schema.org/InStock",
      };
    }
    return { "@context": "https://schema.org", "@graph": [product, breadcrumb] };
  }

  if (pageType === "testimonial") {
    const reviews = (facts.reviews?.length ? facts.reviews : biz.reviews).slice(0, 10);
    const graph: Record<string, unknown>[] = [
      withWebPageExtras(
        {
          "@type": "WebPage",
          "@id": `${pageUrl}#webpage`,
          name: `${biz.name} Testimonials`,
          url: pageUrl,
          isPartOf: { "@id": `${origin}/#website` },
          about: { "@id": `${origin}/#organization` },
          breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        },
        facts,
      ),
      breadcrumb,
    ];
    if (reviews.length > 0) {
      graph.push({
        "@type": "ItemList",
        "@id": `${pageUrl}#reviews`,
        itemListElement: reviews.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Review",
            reviewBody: r.reviewBody,
            ...(r.author ? { author: { "@type": "Person", name: r.author } } : {}),
            itemReviewed: { "@id": `${origin}/#organization` },
          },
        })),
      });
    }
    return { "@context": "https://schema.org", "@graph": graph };
  }

  if (pageType === "appointment") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        withWebPageExtras(
          {
            "@type": "WebPage",
            "@id": `${pageUrl}#webpage`,
            name: `Book with ${biz.name}`,
            url: pageUrl,
            isPartOf: { "@id": `${origin}/#website` },
            about: { "@id": `${origin}/#organization` },
            potentialAction: {
              "@type": "ReserveAction",
              target: pageUrl,
              name: "Book appointment",
            },
            breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
          },
          facts,
        ),
        breadcrumb,
      ],
    };
  }

  if (pageType === "event") {
    const eventNode: Record<string, unknown> = {
      "@type": "Event",
      "@id": `${pageUrl}#event`,
      name: facts.headline || `${biz.name} Event`,
      url: pageUrl,
      organizer: hiringOrg(origin, biz),
      breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
      eventStatus: "https://schema.org/EventScheduled",
    };
    if (facts.description) eventNode.description = facts.description;
    if (facts.image) eventNode.image = imageObject(facts.image);
    if (facts.datePublished) eventNode.startDate = facts.datePublished;
    if (facts.dateModified && facts.dateModified !== facts.datePublished) {
      eventNode.endDate = facts.dateModified;
    }
    const location = placeFromBiz(biz);
    if (location) eventNode.location = location;
    return { "@context": "https://schema.org", "@graph": [eventNode, breadcrumb] };
  }

  if (pageType === "careers") {
    const job: Record<string, unknown> = {
      "@type": "JobPosting",
      "@id": `${pageUrl}#job`,
      title: facts.headline || `Careers at ${biz.name}`,
      description: facts.description || `Open roles at ${biz.name}`,
      url: pageUrl,
      hiringOrganization: hiringOrg(origin, biz),
      breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
    };
    if (facts.datePublished) job.datePosted = facts.datePublished;
    const place = placeFromBiz(biz);
    if (place) job.jobLocation = place;
    return { "@context": "https://schema.org", "@graph": [job, breadcrumb] };
  }

  if (pageType === "menu") {
    const menu: Record<string, unknown> = {
      "@type": "Menu",
      "@id": `${pageUrl}#menu`,
      name: facts.headline || `${biz.name} Menu`,
      url: pageUrl,
      provider: { "@id": `${origin}/#organization` },
      breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
    };
    if (facts.description) menu.description = facts.description;
    if (facts.image) menu.image = imageObject(facts.image);
    return { "@context": "https://schema.org", "@graph": [menu, breadcrumb] };
  }

  if (pageType === "howto") {
    const steps = facts.howtoSteps?.length ? facts.howtoSteps : biz.howtoSteps;
    if (steps && steps.length >= 2) {
      return {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "HowTo",
            "@id": `${pageUrl}#howto`,
            name: facts.headline || `${biz.name} — ${label}`,
            ...(facts.description ? { description: facts.description } : {}),
            ...(facts.image ? { image: imageObject(facts.image) } : {}),
            url: pageUrl,
            step: steps.map((s, i) => ({
              "@type": "HowToStep",
              position: i + 1,
              name: s.name,
              text: s.text,
            })),
            breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
          },
          breadcrumb,
        ],
      };
    }
    return {
      "@context": "https://schema.org",
      "@graph": [
        withWebPageExtras(
          {
            "@type": "WebPage",
            "@id": `${pageUrl}#webpage`,
            name: facts.headline || `${biz.name} — ${label}`,
            url: pageUrl,
            isPartOf: { "@id": `${origin}/#website` },
            about: { "@id": `${origin}/#organization` },
            breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
          },
          facts,
        ),
        breadcrumb,
      ],
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      withWebPageExtras(
        {
          "@type": "WebPage",
          "@id": `${pageUrl}#webpage`,
          name: `${biz.name} — ${label}`,
          url: pageUrl,
          isPartOf: { "@id": `${origin}/#website` },
          about: { "@id": `${origin}/#organization` },
          breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        },
        facts,
      ),
      breadcrumb,
    ],
  };
}
