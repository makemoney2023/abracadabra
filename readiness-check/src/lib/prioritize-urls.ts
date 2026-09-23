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
};

export type PrioritizedUrl = {
  url: string;
  pageType: string;
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

function seedTemplateUrls(origin: string): PrioritizedUrl[] {
  const base = originBase(origin);
  return TEMPLATE_PATHS.map((t) => ({
    url: `${base}${t.path}`,
    pageType: t.pageType,
  }));
}

export function prioritizeUrls(input: PrioritizeUrlsInput): PrioritizedUrl[] {
  const { origin, sitemapUrls, searchUrls } = input;
  const home = homeUrl(origin);
  const homeKey = normalizeUrlKey(home);

  const seenInput = new Set<string>();
  const classified: PrioritizedUrl[] = [];
  const sitemapOther: PrioritizedUrl[] = [];
  const searchOther: PrioritizedUrl[] = [];

  function addUrl(url: string, source: "sitemap" | "search" | "seed") {
    if (!isSameSite(url, origin)) return;

    const key = normalizeUrlKey(url);
    if (seenInput.has(key)) return;
    seenInput.add(key);

    const pageType = classifyPageType(url, origin);
    const normalizedUrl = pageType === "home" ? home : key;

    if (pageType !== "other") {
      classified.push({ url: normalizedUrl, pageType });
    } else if (source === "sitemap") {
      sitemapOther.push({ url: key, pageType: "other" });
    } else if (source === "search") {
      searchOther.push({ url: key, pageType: "other" });
    }
    // seed "other" is ignored
  }

  // Template seeds first (so critical types get a slot even if sitemap is sparse)
  for (const seeded of seedTemplateUrls(origin)) {
    addUrl(seeded.url, "seed");
  }

  for (const url of sitemapUrls) addUrl(url, "sitemap");
  for (const url of searchUrls) addUrl(url, "search");

  classified.sort(
    (a, b) => (PAGE_TYPE_PRIORITY[a.pageType] ?? 99) - (PAGE_TYPE_PRIORITY[b.pageType] ?? 99),
  );

  const result: PrioritizedUrl[] = [{ url: home, pageType: "home" }];
  const seenResult = new Set<string>([homeKey]);

  for (const entry of classified) {
    if (entry.pageType === "home") continue;
    if (result.length >= MAX_PAGES) break;
    const key = normalizeUrlKey(entry.url);
    if (!seenResult.has(key)) {
      seenResult.add(key);
      result.push(entry);
    }
  }

  for (const entry of sitemapOther) {
    if (result.length >= MAX_PAGES) break;
    const key = normalizeUrlKey(entry.url);
    if (seenResult.has(key)) continue;
    seenResult.add(key);
    result.push(entry);
  }

  for (const entry of searchOther) {
    if (result.length >= MAX_PAGES) break;
    const key = normalizeUrlKey(entry.url);
    if (seenResult.has(key)) continue;
    seenResult.add(key);
    result.push(entry);
  }

  return result.slice(0, MAX_PAGES);
}
