import {
  detectBusinessType,
  isBoardOfTradeOrChamber,
} from "@/lib/facts/detect-business-type";
import {
  isOrganizationType,
} from "@/lib/schema-org/organization-types";
import { mergeBusinessFacts } from "@/lib/facts/extract-page-facts";
import type {
  BusinessType,
  FaqPair,
  FixOverrides,
  PageFacts,
  PostalAddressFacts,
} from "@/lib/facts/types";
import { emptyPageFacts } from "@/lib/facts/types";
import { pageEvidenceOrEmpty } from "@/lib/scan/attach-page-facts";
import type { FindingCode } from "@/lib/types";
import {
  buildHomeJsonLd,
  buildPageJsonLd,
  type JsonLdBiz,
} from "./jsonld-templates";
import { buildLlmsFullTxt, buildLlmsTxt } from "./llms-txt-template";
import { mergeDesiredSchema } from "./merge-schema";
import { pagePathLabel } from "./page-path-label";
import { computeRequiredFields, type RequiredField } from "./required-fields";
import { formatValidationMarkdown, validateFixFiles, type ValidationReport } from "./validate-package";

export type FixPackageFinding = {
  code: string;
  passed: boolean;
  message: string;
};

export type FixPackagePage = {
  url: string;
  pageType: string;
  fetchStatus: string;
  hasJsonLd: boolean;
  evidence?: PageFacts | Record<string, unknown>;
};

export type FixPackageInput = {
  domain: string;
  origin: string;
  businessName?: string;
  findings: FixPackageFinding[];
  pages: FixPackagePage[];
  generatedAt?: Date;
  overrides?: FixOverrides;
};

/** User-controlled fix selection. */
export type FixSelection = {
  llmsTxt?: boolean;
  llmsFullTxt?: boolean;
  sitemapXml?: boolean;
  robotsTxt?: boolean;
  faqJsonLd?: boolean;
  pageUrls?: string[];
  businessName?: string;
  businessType?: BusinessType;
  email?: string;
  phone?: string;
  logoUrl?: string;
  sameAs?: string[];
  includeSearchAction?: boolean;
  address?: PostalAddressFacts;
  faqPairs?: FaqPair[];
  searchUrlTemplate?: string;
  openingHours?: string[];
};

export type FixOption = {
  id: string;
  kind: "siteFile" | "schema" | "pageSchema";
  label: string;
  description: string;
  defaultSelected: boolean;
  url?: string;
  pageType?: string;
  alreadyPresent?: boolean;
  /** Types this option will add (for additive UX badges). */
  willAdd?: string[];
  group?: "missing" | "additive" | "site";
};

export type FixFile = {
  path: string;
  contentType: string;
  content: string;
};

export type FixPackage = {
  domain: string;
  findingsAddressed: FindingCode[];
  files: FixFile[];
  selection: Required<
    Pick<
      FixSelection,
      "llmsTxt" | "llmsFullTxt" | "sitemapXml" | "robotsTxt" | "faqJsonLd" | "pageUrls"
    >
  > & {
    businessName?: string;
    businessType?: BusinessType;
    email?: string;
    phone?: string;
    logoUrl?: string;
    sameAs?: string[];
    includeSearchAction?: boolean;
    address?: PostalAddressFacts;
    faqPairs?: FaqPair[];
    searchUrlTemplate?: string;
    openingHours?: string[];
  };
  validation: ValidationReport;
  mergeNotes: string[];
  requiredFields: RequiredField[];
};

type ResolvedBiz = JsonLdBiz & {
  freeOfferPrice?: string;
  freeOfferCurrency?: string;
};

function originBase(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

function failedCodes(findings: FixPackageFinding[]): Set<FindingCode> {
  const codes = new Set<FindingCode>();
  for (const f of findings) {
    if (!f.passed) codes.add(f.code as FindingCode);
  }
  return codes;
}

function factsFor(page: FixPackagePage): PageFacts {
  return pageEvidenceOrEmpty(page);
}

export function pagesMissingJsonLd(pages: FixPackagePage[]): FixPackagePage[] {
  return pages.filter((p) => p.fetchStatus === "ok" && !p.hasJsonLd);
}

/** Pages that may still need additive schema (missing JSON-LD OR partial types). */
export function pagesNeedingSchema(pages: FixPackagePage[]): FixPackagePage[] {
  return pages.filter((p) => {
    if (p.fetchStatus !== "ok") return false;
    if (!p.hasJsonLd) return true;
    const types = new Set(factsFor(p).existingTypes);
    if (p.pageType === "home") {
      const hasOrg = [...types].some((t) => isOrganizationType(t));
      return !hasOrg || !types.has("WebSite");
    }
    return false;
  });
}

export type FixPrefills = {
  businessName: string;
  businessType: BusinessType;
  businessTypeLabel?: string;
  businessTypeAuto?: boolean;
  email?: string;
  phone?: string;
  logoUrl?: string;
  hasSiteSearch: boolean;
  sameAs?: string[];
  openingHours?: string[];
  searchUrlTemplate?: string;
  address?: PageFacts["address"];
};

export function listFixOptions(input: FixPackageInput): {
  options: FixOption[];
  defaultSelection: Required<
    Pick<FixSelection, "llmsTxt" | "llmsFullTxt" | "sitemapXml" | "robotsTxt" | "faqJsonLd" | "pageUrls">
  >;
  prefills: FixPrefills;
} {
  const codes = failedCodes(input.findings);
  const candidates = pagesNeedingSchema(input.pages);
  const options: FixOption[] = [];

  if (codes.has("MISSING_LLMS_TXT") || codes.has("EMPTY_LLMS_TXT")) {
    options.push({
      id: "llmsTxt",
      kind: "siteFile",
      label: "llms.txt",
      description: "AI discovery file for the site root",
      defaultSelected: true,
    });
  }
  if (codes.has("MISSING_LLMS_FULL") || codes.has("EMPTY_LLMS_TXT") || codes.has("MISSING_LLMS_TXT")) {
    options.push({
      id: "llmsFullTxt",
      kind: "siteFile",
      label: "llms-full.txt",
      description: "Expanded AI discovery file",
      defaultSelected: codes.has("MISSING_LLMS_FULL"),
    });
  }
  if (codes.has("SITEMAP_MISSING") || codes.has("SITEMAP_UNPARSEABLE")) {
    options.push({
      id: "sitemapXml",
      kind: "siteFile",
      label: "sitemap.xml",
      description: "URL sitemap built from scanned pages",
      defaultSelected: true,
    });
  }
  if (codes.has("ROBOTS_BLOCKS_GPTBOT") || codes.has("ROBOTS_BLOCKS_AI_BOTS")) {
    options.push({
      id: "robotsTxt",
      kind: "siteFile",
      label: "robots.txt",
      description: "AI-crawler friendly robots rules",
      defaultSelected: true,
    });
  }
  const mergedForFaq = mergeBusinessFacts(input.pages.map(factsFor));
  if (codes.has("MISSING_FAQ_SCHEMA")) {
    options.push({
      id: "faqJsonLd",
      kind: "schema",
      label: "FAQPage JSON-LD",
      description:
        mergedForFaq.faqPairs.length > 0
          ? `FAQ schema from ${mergedForFaq.faqPairs.length} scanned Q&A pair(s)`
          : "FAQ schema — enter at least one Q&A pair before download",
      defaultSelected: mergedForFaq.faqPairs.length > 0,
    });
  }

  for (const page of candidates) {
    const isHome = page.pageType === "home";
    const types = factsFor(page).existingTypes;
    const alreadyPresent = page.hasJsonLd && types.length > 0;
    const willAdd = isHome
      ? ["Organization", "WebSite"].filter(
          (t) =>
            !types.includes(t) &&
            !(t === "Organization" && types.some((x) => isOrganizationType(x))),
        )
      : page.pageType === "about"
        ? ["AboutPage", "BreadcrumbList"]
        : page.pageType === "contact"
          ? ["ContactPage", "BreadcrumbList"]
          : page.pageType === "faq"
            ? ["FAQPage"]
            : page.pageType === "blog"
              ? ["CollectionPage", "BreadcrumbList"]
              : page.pageType === "service"
                ? ["Service", "BreadcrumbList"]
                : page.pageType === "testimonial"
                  ? ["ItemList", "Review", "BreadcrumbList"]
                  : page.pageType === "appointment"
                    ? ["WebPage", "ReserveAction", "BreadcrumbList"]
                    : page.pageType === "event"
                      ? ["Event", "BreadcrumbList"]
                      : page.pageType === "careers"
                        ? ["JobPosting", "BreadcrumbList"]
                        : page.pageType === "menu"
                          ? ["Menu", "BreadcrumbList"]
                          : ["WebPage", "BreadcrumbList"];
    options.push({
      id: `page:${page.url}`,
      kind: "pageSchema",
      label: isHome
        ? "Home JSON-LD (Organization + WebSite)"
        : `${page.pageType} · ${pagePathLabel(page.url)}`,
      description: alreadyPresent
        ? `Partial — will add: ${willAdd.join(", ")}`
        : isHome
          ? "Organization + WebSite graph for the home page"
          : `Structured data for ${page.pageType} page`,
      defaultSelected: !alreadyPresent || isHome,
      url: page.url,
      pageType: page.pageType,
      alreadyPresent,
      willAdd,
      group: alreadyPresent ? "additive" : "missing",
    });
  }

  // Also list fully-missing pages (ok + !hasJsonLd) that might not be in candidates if logic drifts
  for (const page of pagesMissingJsonLd(input.pages)) {
    if (options.some((o) => o.url === page.url)) continue;
    options.push({
      id: `page:${page.url}`,
      kind: "pageSchema",
      label: `${page.pageType} · ${pagePathLabel(page.url)}`,
      description: `Structured data for ${page.pageType} page`,
      defaultSelected: true,
      url: page.url,
      pageType: page.pageType,
      group: "missing",
    });
  }

  const merged = mergeBusinessFacts(input.pages.map(factsFor));
  const detectExtras = {
    urls: input.pages.map((p) => p.url),
    domain: input.domain,
    markdown: [merged.businessName, merged.description, input.businessName]
      .filter(Boolean)
      .join(" "),
  };
  const boardOrChamber = isBoardOfTradeOrChamber(merged, detectExtras);
  const prefills = {
    // Prefer extracted brand name over domain placeholder from the API
    businessName: merged.businessName?.trim() || input.businessName?.trim() || input.domain,
    businessType: detectBusinessType(merged, detectExtras),
    businessTypeLabel: boardOrChamber
      ? "Board of Trade / Chamber of Commerce"
      : undefined,
    businessTypeAuto: boardOrChamber,
    email: merged.emails[0],
    phone: merged.phones[0],
    logoUrl: merged.logoUrl,
    hasSiteSearch: merged.hasSiteSearch,
    sameAs: merged.sameAs.length ? merged.sameAs : undefined,
    openingHours: merged.openingHours?.length ? merged.openingHours : undefined,
    searchUrlTemplate: merged.searchUrlTemplate,
    address: merged.address,
  };

  const defaultSelection = {
    llmsTxt: options.some((o) => o.id === "llmsTxt" && o.defaultSelected),
    llmsFullTxt: options.some((o) => o.id === "llmsFullTxt" && o.defaultSelected),
    sitemapXml: options.some((o) => o.id === "sitemapXml"),
    robotsTxt: options.some((o) => o.id === "robotsTxt"),
    faqJsonLd: options.some((o) => o.id === "faqJsonLd"),
    pageUrls: options.filter((o) => o.kind === "pageSchema" && o.defaultSelected && o.url).map((o) => o.url!),
  };

  return { options, defaultSelection, prefills };
}

export function resolveSelection(
  input: FixPackageInput,
  selection?: FixSelection,
): FixPackage["selection"] {
  const { defaultSelection } = listFixOptions(input);
  const allowedPages = new Set(
    [...pagesNeedingSchema(input.pages), ...pagesMissingJsonLd(input.pages)].map((p) => p.url),
  );

  const source = selection
    ? {
        llmsTxt: selection.llmsTxt === true,
        llmsFullTxt: selection.llmsFullTxt === true,
        sitemapXml: selection.sitemapXml === true,
        robotsTxt: selection.robotsTxt === true,
        faqJsonLd: selection.faqJsonLd === true,
        pageUrls: selection.pageUrls ?? [],
        businessName: selection.businessName,
        businessType: selection.businessType,
        email: selection.email,
        phone: selection.phone,
        logoUrl: selection.logoUrl,
        sameAs: selection.sameAs,
        includeSearchAction: selection.includeSearchAction,
        address: selection.address,
        faqPairs: selection.faqPairs,
        searchUrlTemplate: selection.searchUrlTemplate,
        openingHours: selection.openingHours,
      }
    : {
        ...defaultSelection,
        businessName: input.businessName,
        businessType: input.overrides?.businessType,
        email: input.overrides?.email,
        phone: input.overrides?.phone,
        logoUrl: input.overrides?.logoUrl,
        sameAs: input.overrides?.sameAs,
        includeSearchAction: input.overrides?.includeSearchAction,
        address: input.overrides?.address,
        faqPairs: input.overrides?.faqPairs,
        searchUrlTemplate: input.overrides?.searchUrlTemplate,
        openingHours: input.overrides?.openingHours,
      };

  return {
    ...source,
    pageUrls: source.pageUrls.filter((url) => allowedPages.has(url)),
    businessName: source.businessName?.trim() || input.businessName,
  };
}

function resolveBiz(input: FixPackageInput, selection: FixPackage["selection"]): ResolvedBiz {
  const merged = mergeBusinessFacts(input.pages.map(factsFor));
  const ov = input.overrides ?? {};
  const name =
    selection.businessName?.trim() ||
    ov.businessName?.trim() ||
    input.businessName?.trim() ||
    merged.businessName ||
    input.domain;

  const email = selection.email?.trim() || ov.email?.trim() || merged.emails[0];
  const phone = selection.phone?.trim() || ov.phone?.trim() || merged.phones[0];
  const logoUrl = selection.logoUrl?.trim() || ov.logoUrl?.trim() || merged.logoUrl;
  const sameAs = selection.sameAs?.length
    ? selection.sameAs
    : ov.sameAs?.length
      ? ov.sameAs
      : merged.sameAs;

  const includeSearchAction =
    selection.includeSearchAction === true ||
    ov.includeSearchAction === true ||
    merged.hasSiteSearch;

  const address = selection.address ?? ov.address ?? merged.address;
  const faqPairs =
    selection.faqPairs?.filter((p) => p.question.trim() && p.answer.trim()) ??
    ov.faqPairs ??
    merged.faqPairs;

  const searchUrlTemplate =
    selection.searchUrlTemplate?.trim() ||
    ov.searchUrlTemplate?.trim() ||
    merged.searchUrlTemplate;
  const openingHours = selection.openingHours?.length
    ? selection.openingHours
    : ov.openingHours?.length
      ? ov.openingHours
      : merged.openingHours;
  const allFacts = mergeBusinessFacts(input.pages.map(factsFor));

  return {
    name,
    businessType: selection.businessType || ov.businessType || "Organization",
    email,
    phone,
    logoUrl,
    sameAs,
    description: merged.description,
    address,
    geo: merged.geo,
    hasSiteSearch: merged.hasSiteSearch,
    includeSearchAction,
    searchUrlTemplate,
    openingHours,
    faqPairs,
    reviews: allFacts.reviews ?? [],
    howtoSteps: allFacts.howtoSteps ?? [],
    freeOfferPrice: allFacts.freeOfferPrice,
    freeOfferCurrency: allFacts.freeOfferCurrency,
  };
}

function buildHomeDesired(origin: string, biz: ResolvedBiz): Record<string, unknown> {
  return buildHomeJsonLd(origin, biz, {
    freeOfferPrice: biz.freeOfferPrice,
    freeOfferCurrency: biz.freeOfferCurrency,
  });
}

function buildFaqDesired(pageUrl: string, pairs: PageFacts["faqPairs"]): Record<string, unknown> | null {
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
      acceptedAnswer: { "@type": "Answer", text: p.answer },
    })),
  };
}

function buildSitemapXml(input: FixPackageInput): string {
  const origin = originBase(input.origin);
  const urls = new Set<string>([`${origin}/`]);
  for (const page of input.pages) {
    if (page.fetchStatus === "failed") continue;
    try {
      urls.add(new URL(page.url).href);
    } catch {
      // skip
    }
  }

  const body = [...urls]
    .map(
      (loc) => `  <url>
    <loc>${loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>${loc === `${origin}/` ? "1.0" : "0.7"}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function buildRobotsTxt(input: FixPackageInput): string {
  const origin = originBase(input.origin);
  return `# AI assistants / crawlers — allow public content
User-agent: GPTBot
User-agent: ChatGPT-User
User-agent: OAI-SearchBot
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Applebot-Extended
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /login

User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /login

Sitemap: ${origin}/sitemap.xml
`;
}

function buildPageDesired(
  input: FixPackageInput,
  page: FixPackagePage,
  biz: ResolvedBiz,
): Record<string, unknown> {
  return buildPageJsonLd({
    origin: originBase(input.origin),
    pageUrl: page.url,
    pageType: page.pageType,
    biz,
    facts: factsFor(page),
  });
}

function asSnippet(json: string): string {
  return `<script type="application/ld+json">\n${json.trim()}\n</script>\n`;
}

function slugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
    return (path || "home").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  } catch {
    return "page";
  }
}

function stringifyDoc(doc: Record<string, unknown>): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function emitMergedJsonLd(
  desired: Record<string, unknown>,
  page: FixPackagePage,
  pathBase: string,
  files: FixFile[],
  mergeNotes: string[],
): void {
  const facts = factsFor(page);
  const merged = mergeDesiredSchema({
    desired,
    existingTypes: facts.existingTypes,
    existingBlocks: facts.existingBlocks,
  });

  if (!merged.document) {
    mergeNotes.push(`${pathBase}: skipped — target types already present (${facts.existingTypes.join(", ") || "none"})`);
    return;
  }

  if (merged.skippedTypes.length > 0) {
    mergeNotes.push(
      `${pathBase}: omitted existing types ${merged.skippedTypes.join(", ")}; emitted ${merged.emittedTypes.join(", ")}`,
    );
  }

  const json = stringifyDoc(merged.document);
  files.push({ path: `${pathBase}.jsonld`, contentType: "application/ld+json", content: json });
  files.push({
    path: `${pathBase}.snippet.html`,
    contentType: "text/html; charset=utf-8",
    content: asSnippet(json),
  });
}

function buildInstallMd(
  input: FixPackageInput,
  addressed: FindingCode[],
  files: FixFile[],
  generatedAt: Date,
  selection: FixPackage["selection"],
  mergeNotes: string[],
  validation: ValidationReport,
): string {
  const origin = originBase(input.origin);
  const date = generatedAt.toISOString().slice(0, 10);
  const fileList = files
    .filter((f) => f.path !== "INSTALL.md" && f.path !== "VALIDATION.md")
    .map((f) => `- \`${f.path}\``)
    .join("\n");

  const notes =
    mergeNotes.length > 0
      ? `\n## Merge notes\n${mergeNotes.map((n) => `- ${n}`).join("\n")}\n`
      : "";

  if (addressed.length === 0 && selection.pageUrls.length === 0 && !selection.llmsTxt && !selection.sitemapXml) {
    return `# AEO/GEO fixes for ${input.domain}

Generated on ${date}.

No files were selected for export. Choose fixes in the report UI, or re-scan ${origin} if pages failed to fetch.
`;
  }

  return `# AEO/GEO fixes for ${input.domain}

Generated on ${date}.
Gaps addressed: ${addressed.join(", ") || "(page schemas only)"}
Pages with JSON-LD: ${selection.pageUrls.length}
Validation: ${validation.ok ? "OK" : "HAS ERRORS"} (TODO tokens: ${validation.todoCount})

## Path mapping

| Package file | Install target | Live URL / page |
|---|---|---|
${files
  .filter((f) => f.path !== "INSTALL.md" && f.path !== "VALIDATION.md")
  .map((f) => {
    if (f.path === "llms.txt" || f.path === "llms-full.txt" || f.path === "robots.txt" || f.path === "sitemap.xml") {
      return `| \`${f.path}\` | Site document root / \`public/\` | ${origin}/${f.path} |`;
    }
    if (f.path === "json-ld/home.snippet.html") {
      return `| \`${f.path}\` | Home template \`<head>\` | ${origin}/ |`;
    }
    if (f.path.endsWith(".snippet.html")) {
      return `| \`${f.path}\` | Matching page \`<head>\` | (see filename / scan URL) |`;
    }
    if (f.path.endsWith(".jsonld")) {
      return `| \`${f.path}\` | Source JSON-LD (optional) | — |`;
    }
    return `| \`${f.path}\` | See below | — |`;
  })
  .join("\n")}

## Install order
1. Site root files: merge AI rules into \`robots.txt\` (do not blindly replace custom Disallows), then upload \`llms.txt\` / \`llms-full.txt\` / \`sitemap.xml\`.
2. Install **home** JSON-LD first so \`#organization\` / \`#website\` \`@id\` references resolve.
3. Paste remaining \`*.snippet.html\` into each page \`<head>\` (or before \`</body>\`).
4. Verify (see VALIDATION.md).

## CMS guides

### WordPress
- **Site files:** upload via hosting File Manager / SFTP to the web root (same folder as \`wp-config.php\`) — not the Media Library.
- **JSON-LD:** Appearance → Theme File Editor is risky; prefer a header script plugin, or Rank Math / Yoast **custom schema** / Code Insert in \`<head>\`. Paste the contents of each \`*.snippet.html\` (includes the \`<script>\` tag).
- Install home snippet on the front page first.

### Static / Netlify / Vercel static
- Drop \`robots.txt\`, \`llms.txt\`, \`sitemap.xml\` into \`public/\` or the publish directory.
- Paste snippets into your shared layout \`<head>\` (or per-page layout).

### Next.js (App Router)
- Put site files in \`public/\` so they are served at \`/\`.
- Add JSON-LD with \`next/script\` (\`type="application/ld+json"\`) or a raw \`<script>\` in \`layout.tsx\` / the page — avoid duplicating if another SEO plugin already injects the same types.

## Files
${fileList || "- (none)"}

## JSON-LD notes
- WebSite SearchAction is included only when a real search URL template was detected or supplied.
- Optional properties missing from the scan were omitted (never invented).
- LocalBusiness-family types include address when provided; hours when provided.
${selection.businessType === "SoftwareApplication" ? "- Home graph includes Organization + SoftwareApplication (`#app`) + WebSite.\n" : ""}${notes}
## 3. Verify
- See \`VALIDATION.md\` in this package
- https://validator.schema.org/
- Google Rich Results Test for each page URL
- Re-run the Schema AEO/GEO scan on ${origin}
`;
}

function addressedFromSelection(
  input: FixPackageInput,
  selection: FixPackage["selection"],
): FindingCode[] {
  const codes = failedCodes(input.findings);
  const out = new Set<FindingCode>();

  if (selection.llmsTxt) {
    if (codes.has("MISSING_LLMS_TXT")) out.add("MISSING_LLMS_TXT");
    if (codes.has("EMPTY_LLMS_TXT")) out.add("EMPTY_LLMS_TXT");
  }
  if (selection.llmsFullTxt && codes.has("MISSING_LLMS_FULL")) {
    out.add("MISSING_LLMS_FULL");
  }
  if (selection.sitemapXml) {
    if (codes.has("SITEMAP_MISSING")) out.add("SITEMAP_MISSING");
    if (codes.has("SITEMAP_UNPARSEABLE")) out.add("SITEMAP_UNPARSEABLE");
  }
  if (selection.robotsTxt) {
    if (codes.has("ROBOTS_BLOCKS_GPTBOT")) out.add("ROBOTS_BLOCKS_GPTBOT");
    if (codes.has("ROBOTS_BLOCKS_AI_BOTS")) out.add("ROBOTS_BLOCKS_AI_BOTS");
  }
  if (selection.faqJsonLd && codes.has("MISSING_FAQ_SCHEMA")) {
    out.add("MISSING_FAQ_SCHEMA");
  }

  const homeSelected = selection.pageUrls.some((url) => {
    const page = input.pages.find((p) => p.url === url);
    return page?.pageType === "home";
  });
  if (homeSelected) {
    if (codes.has("NO_JSON_LD_HOME")) out.add("NO_JSON_LD_HOME");
    if (codes.has("NO_ORG_SCHEMA")) out.add("NO_ORG_SCHEMA");
  }
  if (selection.pageUrls.length > 0 && codes.has("LOW_JSON_LD_COVERAGE")) {
    out.add("LOW_JSON_LD_COVERAGE");
  }

  return [...out].sort();
}

/**
 * Deterministic fix package from scan findings + pages + optional overrides.
 */
export function generateFixPackage(
  input: FixPackageInput,
  selectionInput?: FixSelection,
): FixPackage {
  const generatedAt = input.generatedAt ?? new Date();
  const selection = resolveSelection(input, selectionInput);
  const biz = resolveBiz(input, selection);
  const files: FixFile[] = [];
  const mergeNotes: string[] = [];
  const pageByUrl = new Map(input.pages.map((p) => [p.url, p]));
  const origin = originBase(input.origin);

  const requiredFields = computeRequiredFields(input, selection);

  const llmsInput = {
    origin,
    domain: input.domain,
    biz: {
      name: biz.name,
      description: biz.description,
      email: biz.email,
      phone: biz.phone,
      sameAs: biz.sameAs,
      address: biz.address,
    },
    pages: input.pages.map((p) => ({
      url: p.url,
      pageType: p.pageType,
      fetchStatus: p.fetchStatus,
    })),
  };

  if (selection.llmsTxt) {
    files.push({
      path: "llms.txt",
      contentType: "text/plain; charset=utf-8",
      content: buildLlmsTxt(llmsInput),
    });
  }
  if (selection.llmsFullTxt) {
    files.push({
      path: "llms-full.txt",
      contentType: "text/plain; charset=utf-8",
      content: buildLlmsFullTxt(llmsInput),
    });
  }
  if (selection.sitemapXml) {
    files.push({
      path: "sitemap.xml",
      contentType: "application/xml",
      content: buildSitemapXml(input),
    });
  }
  if (selection.robotsTxt) {
    files.push({
      path: "robots.txt",
      contentType: "text/plain; charset=utf-8",
      content: buildRobotsTxt(input),
    });
  }
  if (selection.faqJsonLd && biz.faqPairs.length > 0) {
    const faqPage =
      input.pages.find((p) => p.pageType === "faq" && p.fetchStatus === "ok")?.url ??
      `${origin}/faq`;
    const faqFacts = input.pages.find((p) => p.url === faqPage);
    const pairs = faqFacts?.evidence
      ? factsFor(faqFacts).faqPairs.length
        ? factsFor(faqFacts).faqPairs
        : biz.faqPairs
      : biz.faqPairs;
    const desired = buildFaqDesired(faqPage, pairs);
    if (desired) {
      const fakePage: FixPackagePage = faqFacts ?? {
        url: faqPage,
        pageType: "faq",
        fetchStatus: "ok",
        hasJsonLd: false,
        evidence: emptyPageFacts(),
      };
      emitMergedJsonLd(desired, fakePage, "json-ld/faq", files, mergeNotes);
    }
  }

  const orderedUrls = [...selection.pageUrls].sort((a, b) => {
    const pa = pageByUrl.get(a);
    const pb = pageByUrl.get(b);
    if (pa?.pageType === "home" && pb?.pageType !== "home") return -1;
    if (pb?.pageType === "home" && pa?.pageType !== "home") return 1;
    return 0;
  });

  for (const url of orderedUrls) {
    const page = pageByUrl.get(url);
    if (!page || page.fetchStatus !== "ok") continue;

    if (page.pageType === "home") {
      emitMergedJsonLd(buildHomeDesired(origin, biz), page, "json-ld/home", files, mergeNotes);
      continue;
    }

    const slug = `${page.pageType}-${slugFromUrl(page.url)}`;
    emitMergedJsonLd(buildPageDesired(input, page, biz), page, `json-ld/pages/${slug}`, files, mergeNotes);
  }

  const addressed = addressedFromSelection(input, selection);
  const validation = validateFixFiles(files.filter((f) => f.path !== "INSTALL.md"));

  files.push({
    path: "VALIDATION.md",
    contentType: "text/markdown; charset=utf-8",
    content: formatValidationMarkdown(validation, {
      origin,
      pageUrls: orderedUrls,
    }),
  });

  files.push({
    path: "INSTALL.md",
    contentType: "text/markdown; charset=utf-8",
    content: buildInstallMd(input, addressed, files, generatedAt, selection, mergeNotes, validation),
  });

  const meta = new Set(["INSTALL.md", "VALIDATION.md"]);
  const rest = files.filter((f) => !meta.has(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const trail = files.filter((f) => meta.has(f.path));

  return {
    domain: input.domain,
    findingsAddressed: addressed,
    files: [...rest, ...trail],
    selection,
    validation,
    mergeNotes,
    requiredFields,
  };
}
