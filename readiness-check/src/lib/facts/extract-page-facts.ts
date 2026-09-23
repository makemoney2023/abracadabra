import { extractFaqPairsFromCopy } from "./extract-faq-copy";
import { extractFactsFromHtml, mergeHtmlFacts } from "./extract-from-html";
import { emptyPageFacts, type FaqPair, type PageFacts, type PostalAddressFacts } from "./types";

const MAX_BLOCKS_BYTES = 50_000;

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const SEARCH_HINT_RE = /\/search\?q=/i;

export type ExtractPageFactsInput = {
  markdown?: string;
  html?: string;
  jsonLdBlocks?: unknown[];
};

function asRecord(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  return node as Record<string, unknown>;
}

function typeNames(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj);
  if (Array.isArray(obj["@graph"])) walk(obj["@graph"], visit);
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") walk(value, visit);
  }
}

function pickString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

function logoUrlFrom(node: Record<string, unknown>): string | undefined {
  const logo = node.logo;
  if (typeof logo === "string") return logo;
  const rec = asRecord(logo);
  if (!rec) return undefined;
  return pickString(rec.url, rec.contentUrl);
}

function addressFrom(node: Record<string, unknown>): PostalAddressFacts | undefined {
  const addr = asRecord(node.address);
  if (!addr) return undefined;
  const out: PostalAddressFacts = {
    streetAddress: pickString(addr.streetAddress),
    addressLocality: pickString(addr.addressLocality),
    addressRegion: pickString(addr.addressRegion),
    postalCode: pickString(addr.postalCode),
    addressCountry: pickString(addr.addressCountry),
  };
  if (Object.values(out).every((v) => !v)) return undefined;
  return out;
}

function sameAsFrom(node: Record<string, unknown>): string[] {
  const raw = node.sameAs;
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  return [];
}

function faqFrom(node: Record<string, unknown>): FaqPair[] {
  const types = typeNames(node);
  if (!types.includes("FAQPage") && !types.includes("QAPage")) return [];
  const main = node.mainEntity;
  const items = Array.isArray(main) ? main : main ? [main] : [];
  const pairs: FaqPair[] = [];
  for (const item of items) {
    const q = asRecord(item);
    if (!q) continue;
    const question = pickString(q.name, q.text);
    const answerNode = asRecord(q.acceptedAnswer) ?? asRecord(q.suggestedAnswer);
    const answer = answerNode ? pickString(answerNode.text) : undefined;
    if (question && answer) pairs.push({ question, answer });
  }
  return pairs;
}


function searchUrlTemplateFrom(node: Record<string, unknown>): string | undefined {
  const action = node.potentialAction;
  const actions = Array.isArray(action) ? action : action ? [action] : [];
  for (const a of actions) {
    const rec = asRecord(a);
    if (!rec || !typeNames(rec).includes("SearchAction")) continue;
    const target = rec.target;
    if (typeof target === "string" && target.includes("{search_term_string}")) return target;
    const t = asRecord(target);
    const tpl = t ? pickString(t.urlTemplate) : undefined;
    if (tpl?.includes("{search_term_string}")) return tpl;
  }
  return undefined;
}

function openingHoursFrom(node: Record<string, unknown>): string[] {
  const raw = node.openingHours ?? node.openingHoursSpecification;
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === "string") out.push(item);
      else {
        const rec = asRecord(item);
        if (!rec) continue;
        const day = pickString(rec.dayOfWeek);
        const opens = pickString(rec.opens);
        const closes = pickString(rec.closes);
        if (day && opens && closes) out.push(`${day} ${opens}-${closes}`);
        else if (typeof rec.openingHours === "string") out.push(rec.openingHours);
      }
    }
    return out;
  }
  return [];
}

function reviewsFrom(node: Record<string, unknown>): Array<{ author?: string; reviewBody: string }> {
  if (!typeNames(node).includes("Review")) return [];
  const body = pickString(node.reviewBody, node.description);
  if (!body) return [];
  const authorNode = asRecord(node.author);
  const author = authorNode ? pickString(authorNode.name) : pickString(node.author);
  return [{ reviewBody: body, author }];
}

function howtoStepsFrom(node: Record<string, unknown>): Array<{ name: string; text: string }> {
  if (!typeNames(node).includes("HowTo")) return [];
  const step = node.step;
  const items = Array.isArray(step) ? step : step ? [step] : [];
  const out: Array<{ name: string; text: string }> = [];
  for (const item of items) {
    const rec = asRecord(item);
    if (!rec) continue;
    const name = pickString(rec.name, rec.text);
    const text = pickString(rec.text, rec.name);
    if (name && text) out.push({ name, text });
  }
  return out;
}

function hasSearchAction(node: Record<string, unknown>): boolean {

  const types = typeNames(node);
  if (types.includes("SearchAction")) return true;
  const action = node.potentialAction;
  const actions = Array.isArray(action) ? action : action ? [action] : [];
  for (const a of actions) {
    const rec = asRecord(a);
    if (!rec) continue;
    if (typeNames(rec).includes("SearchAction")) return true;
  }
  return false;
}

function imageFrom(node: Record<string, unknown>): string | undefined {
  const image = node.image;
  if (typeof image === "string") return image;
  if (Array.isArray(image) && typeof image[0] === "string") return image[0];
  const rec = asRecord(Array.isArray(image) ? image[0] : image);
  return rec ? pickString(rec.url, rec.contentUrl) : undefined;
}

function geoFrom(node: Record<string, unknown>): { latitude: number; longitude: number } | undefined {
  const geo = asRecord(node.geo);
  if (!geo) return undefined;
  const lat = typeof geo.latitude === "number" ? geo.latitude : Number(geo.latitude);
  const lng = typeof geo.longitude === "number" ? geo.longitude : Number(geo.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { latitude: lat, longitude: lng };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function capBlocks(blocks: unknown[]): unknown[] {
  const kept: unknown[] = [];
  let size = 2; // []
  for (const block of blocks) {
    const piece = JSON.stringify(block);
    const next = size + piece.length + (kept.length ? 1 : 0);
    if (next > MAX_BLOCKS_BYTES) break;
    kept.push(block);
    size = next;
  }
  return kept;
}

function fromMarkdown(markdown: string, facts: PageFacts) {
  const emails = markdown.match(EMAIL_RE) ?? [];
  facts.emails = unique([...facts.emails, ...emails]);
  const phones = markdown.match(PHONE_RE) ?? [];
  facts.phones = unique([...facts.phones, ...phones]);
  if (SEARCH_HINT_RE.test(markdown)) facts.hasSiteSearch = true;
}

/**
 * Derive PageFacts from Parallel markdown/excerpts and parsed JSON-LD blocks.
 * Pure / offline — no network.
 */
export function extractPageFacts(input: ExtractPageFactsInput): PageFacts {
  const facts = emptyPageFacts();
  const blocks = input.jsonLdBlocks ?? [];
  const types = new Set<string>();

  for (const block of blocks) {
    walk(block, (obj) => {
      for (const t of typeNames(obj)) types.add(t);

      if (hasSearchAction(obj)) facts.hasSiteSearch = true;
      const searchTpl = searchUrlTemplateFrom(obj);
      if (searchTpl) facts.searchUrlTemplate = facts.searchUrlTemplate ?? searchTpl;

      const hours = openingHoursFrom(obj);
      if (hours.length) {
        facts.openingHours = [...(facts.openingHours ?? []), ...hours];
      }

      const revs = reviewsFrom(obj);
      if (revs.length) facts.reviews = [...facts.reviews, ...revs];

      const howto = howtoStepsFrom(obj);
      if (howto.length) facts.howtoSteps = facts.howtoSteps.length ? facts.howtoSteps : howto;

      const isOrg =
        typeNames(obj).includes("Organization") ||
        typeNames(obj).includes("LocalBusiness") ||
        typeNames(obj).includes("OnlineStore") ||
        typeNames(obj).includes("OnlineBusiness");

      if (isOrg) {
        facts.businessName = facts.businessName ?? pickString(obj.name);
        facts.description = facts.description ?? pickString(obj.description);
        const email = pickString(obj.email);
        if (email) facts.emails = unique([...facts.emails, email]);
        const phone = pickString(obj.telephone);
        if (phone) facts.phones = unique([...facts.phones, phone]);
        facts.logoUrl = facts.logoUrl ?? logoUrlFrom(obj);
        facts.sameAs = unique([...facts.sameAs, ...sameAsFrom(obj)]);
        facts.address = facts.address ?? addressFrom(obj);
        facts.geo = facts.geo ?? geoFrom(obj);
      }

      if (typeNames(obj).includes("WebSite")) {
        facts.businessName = facts.businessName ?? pickString(obj.name);
      }

      const faq = faqFrom(obj);
      if (faq.length) facts.faqPairs = [...facts.faqPairs, ...faq];

      if (
        typeNames(obj).includes("BlogPosting") ||
        typeNames(obj).includes("Article") ||
        typeNames(obj).includes("NewsArticle")
      ) {
        facts.headline = facts.headline ?? pickString(obj.headline, obj.name);
        facts.datePublished = facts.datePublished ?? pickString(obj.datePublished);
        facts.dateModified = facts.dateModified ?? pickString(obj.dateModified);
        facts.image = facts.image ?? imageFrom(obj);
        facts.description = facts.description ?? pickString(obj.description);
      }
    });
  }

  facts.existingTypes = [...types].sort();
  facts.existingBlocks = capBlocks(blocks);

  if (input.markdown) fromMarkdown(input.markdown, facts);

  const copyFaq = extractFaqPairsFromCopy({
    markdown: input.markdown,
    html: input.html,
  });
  if (copyFaq.length) facts.faqPairs = [...facts.faqPairs, ...copyFaq];

  // Dedupe FAQ by question
  const seenQ = new Set<string>();
  facts.faqPairs = facts.faqPairs.filter((p) => {
    const key = p.question.toLowerCase();
    if (seenQ.has(key)) return false;
    seenQ.add(key);
    return true;
  });

  if (facts.openingHours?.length) facts.openingHours = unique(facts.openingHours);

  if (input.html) {
    return mergeHtmlFacts(facts, extractFactsFromHtml(input.html));
  }

  return facts;
}

/** Merge home + page facts for package-level defaults (home wins for brand fields). */
export function mergeBusinessFacts(pages: PageFacts[]): PageFacts {
  const out = emptyPageFacts();
  for (const page of pages) {
    out.businessName = out.businessName ?? page.businessName;
    out.description = out.description ?? page.description;
    out.logoUrl = out.logoUrl ?? page.logoUrl;
    out.address = out.address ?? page.address;
    out.geo = out.geo ?? page.geo;
    out.emails = unique([...out.emails, ...page.emails]);
    out.phones = unique([...out.phones, ...page.phones]);
    out.sameAs = unique([...out.sameAs, ...page.sameAs]);
    out.faqPairs = [...out.faqPairs, ...page.faqPairs];
    out.reviews = [...out.reviews, ...(page.reviews ?? [])];
    out.howtoSteps = out.howtoSteps.length ? out.howtoSteps : (page.howtoSteps ?? []);
    if (page.hasSiteSearch) out.hasSiteSearch = true;
    out.searchUrlTemplate = out.searchUrlTemplate ?? page.searchUrlTemplate;
    out.openingHours = out.openingHours?.length ? out.openingHours : page.openingHours;
    out.freeOfferPrice = out.freeOfferPrice ?? page.freeOfferPrice;
    out.freeOfferCurrency = out.freeOfferCurrency ?? page.freeOfferCurrency;
  }
  const seenQ = new Set<string>();
  out.faqPairs = out.faqPairs.filter((p) => {
    const key = p.question.toLowerCase();
    if (seenQ.has(key)) return false;
    seenQ.add(key);
    return true;
  });
  return out;
}
