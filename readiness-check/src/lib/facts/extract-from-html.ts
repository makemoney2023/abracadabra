import type { PageFacts, PostalAddressFacts } from "./types";
import { emptyPageFacts } from "./types";

const SOCIAL_HOSTS = [
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "github.com",
];

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
  return re.exec(tag)?.[1]?.trim();
}

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const match = re.exec(html);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function isSocial(href: string): boolean {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "").toLowerCase();
    return SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractAddress(html: string): PostalAddressFacts | undefined {
  const street = /itemprop=["']streetAddress["'][^>]*>([^<]+)/i.exec(html)?.[1]?.trim();
  const locality = /itemprop=["']addressLocality["'][^>]*>([^<]+)/i.exec(html)?.[1]?.trim();
  const region = /itemprop=["']addressRegion["'][^>]*>([^<]+)/i.exec(html)?.[1]?.trim();
  const postal = /itemprop=["']postalCode["'][^>]*>([^<]+)/i.exec(html)?.[1]?.trim();
  const country = /itemprop=["']addressCountry["'][^>]*>([^<]+)/i.exec(html)?.[1]?.trim();

  let fallbackStreet = street;
  if (!fallbackStreet) {
    const addrBlock =
      /<(?:address)[^>]*>[\s\S]{0,400}?<\/address>/i.exec(html)?.[0] ||
      /<(?:div|p)[^>]*(?:class|itemprop)=["'][^"']*address[^"']*["'][^>]*>[\s\S]{0,400}?<\/(?:div|p)>/i.exec(
        html,
      )?.[0];
    if (addrBlock) {
      fallbackStreet = /\d{1,5}\s+[A-Za-z0-9 .,'-]{3,60}/.exec(stripTags(addrBlock))?.[0]?.trim();
    }
  }

  const out: PostalAddressFacts = {
    streetAddress: fallbackStreet,
    addressLocality: locality,
    addressRegion: region,
    postalCode: postal,
    addressCountry: country,
  };
  if (Object.values(out).every((v) => !v)) return undefined;
  return out;
}

function extractHours(html: string): string[] {
  const hours: string[] = [];
  for (const m of html.matchAll(/itemprop=["']openingHours["'][^>]*content=["']([^"']+)["']/gi)) {
    if (m[1]) hours.push(m[1].trim());
  }
  for (const m of html.matchAll(/itemprop=["']openingHours["'][^>]*>([^<]+)</gi)) {
    if (m[1]?.trim()) hours.push(m[1].trim());
  }
  const hoursSection =
    /(?:hours|open)[:\s]+([A-Za-z]{2,3}[-–][A-Za-z]{2,3}[^\n<]{0,40}\d{1,2}:\d{2}[^\n<]{0,20})/i.exec(
      html,
    );
  if (hoursSection?.[1]) hours.push(stripTags(hoursSection[1]));
  return unique(hours).slice(0, 14);
}

function extractHowtoSteps(html: string): Array<{ name: string; text: string }> {
  const steps: Array<{ name: string; text: string }> = [];
  const ol =
    /<(?:ol|div)[^>]*(?:class|id)=["'][^"']*(?:how-?to|steps?)[^"']*["'][^>]*>([\s\S]{0,4000}?)<\/(?:ol|div)>/i.exec(
      html,
    );
  const listHtml = ol?.[1] ?? "";
  for (const m of listHtml.matchAll(/<li\b[^>]*>([\s\S]{0,400}?)<\/li>/gi)) {
    const text = stripTags(m[1] ?? "");
    if (text.length >= 8) steps.push({ name: text.slice(0, 80), text });
  }
  return steps.slice(0, 20);
}

function extractReviews(html: string): Array<{ author?: string; reviewBody: string }> {
  const reviews: Array<{ author?: string; reviewBody: string }> = [];
  for (const m of html.matchAll(
    /<(?:blockquote|div|p)[^>]*(?:class|itemprop)=["'][^"']*(?:testimonial|review)[^"']*["'][^>]*>([\s\S]{0,600}?)<\/(?:blockquote|div|p)>/gi,
  )) {
    const body = stripTags(m[1] ?? "");
    if (body.length < 20) continue;
    const authorMatch = /[-—]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/.exec(body);
    reviews.push({
      reviewBody: authorMatch ? body.slice(0, authorMatch.index).trim() : body,
      author: authorMatch?.[1],
    });
  }
  return reviews.slice(0, 10);
}

function extractSearchTemplate(html: string): string | undefined {
  const form = /<form[^>]+(?:role=["']search["']|action=["'][^"']*search[^"']*["'])[^>]*>/i.exec(
    html,
  )?.[0];
  if (!form) return undefined;
  const action = attr(form, "action");
  if (!action) return undefined;
  if (action.includes("{search_term_string}")) return action;
  const sep = action.includes("?") ? "&" : "?";
  const name =
    /<input[^>]+(?:type=["']search["']|name=["'](?:q|query|s|search)["'])[^>]*>/i.exec(html);
  const param = name ? attr(name[0]!, "name") || "q" : "q";
  if (/^https?:\/\//i.test(action)) {
    return `${action}${sep}${param}={search_term_string}`;
  }
  return undefined;
}

/**
 * Lightweight HTML fact extract (no DOM). Complements JSON-LD / markdown facts.
 */
export function extractFactsFromHtml(html: string): PageFacts {
  const facts = emptyPageFacts();
  if (!html) return facts;

  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim();
  if (title) facts.businessName = title;

  const description =
    metaContent(html, "description") || metaContent(html, "og:description");
  if (description) facts.description = description;

  const ogType = metaContent(html, "og:type");
  if (ogType === "article") {
    facts.headline = facts.headline ?? metaContent(html, "og:title") ?? title;
    facts.datePublished = facts.datePublished ?? metaContent(html, "article:published_time");
    facts.dateModified = facts.dateModified ?? metaContent(html, "article:modified_time");
  }

  const ogImage = metaContent(html, "og:image");
  if (ogImage) facts.logoUrl = ogImage;

  if (!facts.logoUrl) {
    const icon = /<link[^>]+rel\s*=\s*["'](?:shortcut )?icon["'][^>]*>/i.exec(html)?.[0];
    const href = icon ? attr(icon, "href") : undefined;
    if (href?.startsWith("http")) facts.logoUrl = href;
  }

  if (!facts.logoUrl) {
    const logoImg =
      /<img[^>]+(?:class|id|alt)\s*=\s*["'][^"']*logo[^"']*["'][^>]*>/i.exec(html)?.[0] ||
      /<img[^>]+src\s*=\s*["'][^"']*logo[^"']*["'][^>]*>/i.exec(html)?.[0];
    const src = logoImg ? attr(logoImg, "src") : undefined;
    if (src?.startsWith("http")) facts.logoUrl = src;
  }

  const emails: string[] = [];
  const phones: string[] = [];
  const sameAs: string[] = [];

  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1]?.trim() ?? "";
    if (href.toLowerCase().startsWith("mailto:")) {
      const email = href.slice("mailto:".length).split("?")[0]?.trim();
      if (email) emails.push(email);
    } else if (href.toLowerCase().startsWith("tel:")) {
      const phone = href.slice("tel:".length).split("?")[0]?.trim();
      if (phone) phones.push(phone);
    } else if (/^https?:\/\//i.test(href) && isSocial(href)) {
      sameAs.push(href.split("#")[0]!);
    }
  }

  facts.emails = unique(emails);
  facts.phones = unique(phones);
  facts.sameAs = unique(sameAs);
  facts.address = extractAddress(html);
  facts.openingHours = extractHours(html);
  facts.howtoSteps = extractHowtoSteps(html);
  facts.reviews = extractReviews(html);
  const searchTpl = extractSearchTemplate(html);
  if (searchTpl) {
    facts.hasSiteSearch = true;
    facts.searchUrlTemplate = searchTpl;
  }

  return facts;
}

/** Merge HTML-derived facts under existing facts (existing wins). */
export function mergeHtmlFacts(base: PageFacts, htmlFacts: PageFacts): PageFacts {
  return {
    ...htmlFacts,
    ...base,
    businessName: base.businessName ?? htmlFacts.businessName,
    description: base.description ?? htmlFacts.description,
    logoUrl: base.logoUrl ?? htmlFacts.logoUrl,
    address: base.address ?? htmlFacts.address,
    emails: unique([...base.emails, ...htmlFacts.emails]),
    phones: unique([...base.phones, ...htmlFacts.phones]),
    sameAs: unique([...base.sameAs, ...htmlFacts.sameAs]),
    faqPairs: base.faqPairs.length ? base.faqPairs : htmlFacts.faqPairs,
    reviews: base.reviews.length ? base.reviews : htmlFacts.reviews,
    howtoSteps: base.howtoSteps.length ? base.howtoSteps : htmlFacts.howtoSteps,
    openingHours: base.openingHours?.length ? base.openingHours : htmlFacts.openingHours,
    searchUrlTemplate: base.searchUrlTemplate ?? htmlFacts.searchUrlTemplate,
    headline: base.headline ?? htmlFacts.headline,
    datePublished: base.datePublished ?? htmlFacts.datePublished,
    dateModified: base.dateModified ?? htmlFacts.dateModified,
    image: base.image ?? htmlFacts.image,
    freeOfferPrice: base.freeOfferPrice ?? htmlFacts.freeOfferPrice,
    freeOfferCurrency: base.freeOfferCurrency ?? htmlFacts.freeOfferCurrency,
    hasSiteSearch: base.hasSiteSearch || htmlFacts.hasSiteSearch,
    existingTypes: base.existingTypes.length ? base.existingTypes : htmlFacts.existingTypes,
    existingBlocks: base.existingBlocks.length ? base.existingBlocks : htmlFacts.existingBlocks,
  };
}
