import { MAX_PAGES } from "@/lib/scoring/constants";

const PAGE_TYPE_PRIORITY: Record<string, number> = {
  home: 0,
  about: 1,
  contact: 2,
  appointment: 3,
  service: 4,
  pricing: 5,
  faq: 6,
  testimonial: 7,
  blogPost: 8,
  blog: 9,
  product: 10,
  howto: 11,
  event: 12,
  careers: 13,
  menu: 14,
  location: 15,
  other: 16,
};

const TEMPLATE_PATHS: Array<{ path: string; pageType: string }> = [
  { path: "/about", pageType: "about" },
  { path: "/contact", pageType: "contact" },
  { path: "/services", pageType: "service" },
  { path: "/pricing", pageType: "pricing" },
  { path: "/faq", pageType: "faq" },
  { path: "/blog", pageType: "blog" },
  { path: "/products", pageType: "product" },
  { path: "/testimonials", pageType: "testimonial" },
  { path: "/reviews", pageType: "testimonial" },
  { path: "/appointment", pageType: "appointment" },
  { path: "/book", pageType: "appointment" },
  { path: "/articles", pageType: "blog" },
  { path: "/events", pageType: "event" },
  { path: "/careers", pageType: "careers" },
  { path: "/menu", pageType: "menu" },
];

type PrioritizeUrlsInput = {
  origin: string;
  sitemapUrls: string[];
  searchUrls: string[];
  /** Guessed template URLs already checked to exist. Omit to add unchecked guesses for uncovered types. */
  seedUrls?: PrioritizedUrl[];
};

export type PrioritizedUrlSource = "home" | "sitemap" | "search" | "seed";

export type PrioritizedUrl = {
  url: string;
  pageType: string;
  /** Where the URL came from. "seed" is a guessed template path, not a URL the site published. */
  source?: PrioritizedUrlSource;
};

function apexHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isSameSite(url: string, origin: string): boolean {
  try {
    return apexHost(new URL(url).hostname) === apexHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname;
    if (pathname !== "/" && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

function homeUrl(origin: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}/`;
}

function originBase(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

/** Exported for fix-package / tests — classify a URL into a scanner page type. */
export function classifyPageType(url: string, origin: string): string {
  let pathname: string;
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname.toLowerCase();

    if (isSameSite(url, origin) && (pathname === "/" || pathname === "")) {
      return "home";
    }
  } catch {
    return "other";
  }

  if (/(^|\/)about(\/|$|-)/.test(pathname)) return "about";
  if (/(^|\/)contact(\/|$|-)/.test(pathname)) return "contact";
  if (/(^|\/)(appointment|appointments|booking|book-now|schedule|reserve)(\/|$|-)/.test(pathname)) {
    return "appointment";
  }
  if (/(^|\/)book(\/|$)/.test(pathname)) return "appointment";
  if (/(^|\/)(testimonial|testimonials|reviews|success-stories)(\/|$|-)/.test(pathname)) {
    return "testimonial";
  }
  if (/(^|\/)(service|services)(\/|$|-)/.test(pathname)) return "service";
  if (pathname.includes("pricing")) return "pricing";
  if (pathname.includes("faq")) return "faq";
  if (/(^|\/)(how-to|howto)(\/|$|-)/.test(pathname)) return "howto";
  if (/(^|\/)(event|events)(\/|$|-)/.test(pathname)) return "event";
  if (/(^|\/)(career|careers|jobs|job)(\/|$|-)/.test(pathname)) return "careers";
  if (/(^|\/)menu(\/|$|-)/.test(pathname)) return "menu";
  if (/(^|\/)(product|products)(\/|$|-)/.test(pathname) && !pathname.includes("production")) {
    return "product";
  }
  if (
    pathname.includes("blog") ||
    pathname.includes("/news/") ||
    pathname.includes("/news") ||
    /(^|\/)(articles|insights|resources|posts)(\/|$)/.test(pathname)
  ) {
    const segments = pathname.replace(/\/+/g, "/").replace(/^\/|\/$/g, "").split("/").filter(Boolean);
    const listing = new Set(["blog", "news", "articles", "insights", "resources", "posts"]);
    if (segments.length >= 3) return "blogPost";
    if (segments.length === 2 && /\d{4}/.test(segments[1] ?? "")) return "blogPost";
    if (segments.length === 2 && listing.has(segments[0] ?? "") && segments[1] !== "page") {
      return "blogPost";
    }
    return "blog";
  }
  if (pathname.includes("location")) return "location";

  return "other";
}

/**
 * First pass gives any one page type (or, for unclassified pages, any one top-level section such as /portfolio/)
 * at most this many slots, so a long blog or services list cannot crowd out the rest of the site.
 */
export const PER_TYPE_FIRST_PASS = Math.ceil(MAX_PAGES / 5);

function capGroup(entry: PrioritizedUrl): string {
  if (entry.pageType !== "other") return entry.pageType;
  try {
    const first = new URL(entry.url).pathname.split("/").filter(Boolean)[0] ?? "";
    return `other:${first.includes(".") ? "" : first}`;
  } catch {
    return "other:";
  }
}

type SeedInput = Pick<PrioritizeUrlsInput, "origin" | "sitemapUrls" | "searchUrls">;

/**
 * Guessed template paths for page types the site's own sitemap and search URLs do not already cover.
 * They are guesses: the scan checks they exist before extraction and drops the ones that do not.
 */
export function templateSeedUrls(input: SeedInput): PrioritizedUrl[] {
  const { origin, sitemapUrls, searchUrls } = input;
  const base = originBase(origin);
  const realKeys = new Set<string>();
  const coveredTypes = new Set<string>();
  for (const url of [...sitemapUrls, ...searchUrls]) {
    if (!isSameSite(url, origin)) continue;
    realKeys.add(normalizeUrlKey(url));
    coveredTypes.add(classifyPageType(url, origin));
  }
  const seeds: PrioritizedUrl[] = [];
  for (const template of TEMPLATE_PATHS) {
    if (coveredTypes.has(template.pageType)) continue;
    const url = `${base}${template.path}`;
    if (realKeys.has(normalizeUrlKey(url))) continue;
    seeds.push({ url, pageType: template.pageType, source: "seed" });
  }
  return seeds.sort(
    (a, b) => (PAGE_TYPE_PRIORITY[a.pageType] ?? 99) - (PAGE_TYPE_PRIORITY[b.pageType] ?? 99),
  );
}

/**
 * Order: home, then real URLs (sitemap before search). First pass: classified pages in type-priority order, then
 * unclassified sitemap and search pages, each type or section capped at PER_TYPE_FIRST_PASS. Then what the cap held back.
 * Guessed template URLs come last, only for types the real URLs miss. Pass `seedUrls` to use pre-checked guesses.
 */
export function prioritizeUrls(input: PrioritizeUrlsInput): PrioritizedUrl[] {
  const { origin, sitemapUrls, searchUrls } = input;
  const home = homeUrl(origin);
  const homeKey = normalizeUrlKey(home);

  const seenInput = new Set<string>([homeKey]);
  const classified: PrioritizedUrl[] = [];
  const sitemapOther: PrioritizedUrl[] = [];
  const searchOther: PrioritizedUrl[] = [];

  function addUrl(url: string, source: "sitemap" | "search") {
    if (!isSameSite(url, origin)) return;
    const key = normalizeUrlKey(url);
    if (seenInput.has(key)) return;
    seenInput.add(key);
    const pageType = classifyPageType(url, origin);
    if (pageType === "home") return;
    if (pageType !== "other") classified.push({ url: key, pageType, source });
    else if (source === "sitemap") sitemapOther.push({ url: key, pageType: "other", source });
    else searchOther.push({ url: key, pageType: "other", source });
  }

  for (const url of sitemapUrls) addUrl(url, "sitemap");
  for (const url of searchUrls) addUrl(url, "search");

  classified.sort(
    (a, b) => (PAGE_TYPE_PRIORITY[a.pageType] ?? 99) - (PAGE_TYPE_PRIORITY[b.pageType] ?? 99),
  );

  const result: PrioritizedUrl[] = [{ url: home, pageType: "home", source: "home" }];
  const seenResult = new Set<string>([homeKey]);
  function push(entry: PrioritizedUrl): void {
    if (result.length >= MAX_PAGES) return;
    const key = normalizeUrlKey(entry.url);
    if (seenResult.has(key)) return;
    seenResult.add(key);
    result.push(entry);
  }

  const perGroup = new Map<string, number>();
  const overflow: PrioritizedUrl[] = [];
  for (const entry of [...classified, ...sitemapOther, ...searchOther]) {
    const group = capGroup(entry);
    const count = perGroup.get(group) ?? 0;
    if (count >= PER_TYPE_FIRST_PASS) {
      overflow.push(entry);
      continue;
    }
    perGroup.set(group, count + 1);
    push(entry);
  }
  for (const entry of overflow) push(entry);

  const seeds = input.seedUrls ?? templateSeedUrls({ origin, sitemapUrls, searchUrls });
  for (const seed of seeds) push({ ...seed, source: "seed" });

  return result.slice(0, MAX_PAGES);
}
