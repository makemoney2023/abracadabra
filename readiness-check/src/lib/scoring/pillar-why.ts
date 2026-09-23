import { PILLAR_WEIGHTS } from "@/lib/scoring/constants";
import type { FindingCode, ScoreBreakdown } from "@/lib/types";

export type PillarWhy = {
  key: keyof ScoreBreakdown;
  label: string;
  score: number;
  max: number;
  summary: string;
  /** Concrete gaps — finding codes/messages and/or pages missing JSON-LD */
  bullets: string[];
};

export type FindingLike = {
  code: string;
  severity: string;
  passed: boolean;
  message: string;
};

export type PageLike = {
  url: string;
  pageType: string;
  fetchStatus: string;
  hasJsonLd: boolean;
};

const PILLAR_META: Array<{
  key: keyof ScoreBreakdown;
  label: string;
  codes: FindingCode[];
  whatItMeasures: string;
}> = [
  {
    key: "structuredData",
    label: "Structured data",
    codes: ["NO_JSON_LD_HOME", "NO_ORG_SCHEMA", "MISSING_FAQ_SCHEMA"],
    whatItMeasures: "JSON-LD on the home page, Organization/LocalBusiness, and FAQ schema",
  },
  {
    key: "aiDiscoveryFiles",
    label: "AI discovery files",
    codes: [
      "MISSING_LLMS_TXT",
      "EMPTY_LLMS_TXT",
      "MISSING_LLMS_FULL",
      "SITEMAP_MISSING",
      "SITEMAP_UNPARSEABLE",
    ],
    whatItMeasures: "Useful llms.txt / llms-full.txt and a parseable sitemap.xml at the site root",
  },
  {
    key: "aiCrawlability",
    label: "AI crawlability",
    codes: ["ROBOTS_BLOCKS_GPTBOT", "ROBOTS_BLOCKS_AI_BOTS"],
    whatItMeasures: "Whether robots.txt allows major AI crawlers (or does not blanket-block them)",
  },
  {
    key: "pageCoverage",
    label: "Page coverage",
    codes: [
      "LOW_JSON_LD_COVERAGE",
      "PAGES_FETCH_FAILED",
      "MISSING_BREADCRUMB",
      "MISSING_HOWTO_SCHEMA",
      "MISSING_PRODUCT_SCHEMA",
    ],
    whatItMeasures: "Share of scanned pages with JSON-LD, especially home/contact/service templates",
  },
  {
    key: "answerReadiness",
    label: "Answer readiness",
    codes: ["MISSING_FAQ_SCHEMA", "NO_ORG_SCHEMA", "MISSING_BREADCRUMB"],
    whatItMeasures: "FAQ schema and organization/contact signals that help answer engines cite you",
  },
];

const GAP_LABEL: Partial<Record<FindingCode, string>> = {
  MISSING_LLMS_TXT: "Missing llms.txt",
  EMPTY_LLMS_TXT: "llms.txt present but not useful",
  MISSING_LLMS_FULL: "Missing or thin llms-full.txt",
  SITEMAP_MISSING: "Missing sitemap.xml",
  SITEMAP_UNPARSEABLE: "sitemap.xml could not be parsed",
  ROBOTS_BLOCKS_GPTBOT: "robots.txt blocks GPTBot",
  ROBOTS_BLOCKS_AI_BOTS: "robots.txt blocks one or more AI crawlers",
  NO_JSON_LD_HOME: "Home page missing JSON-LD",
  NO_ORG_SCHEMA: "Home page missing Organization/LocalBusiness schema",
  MISSING_FAQ_SCHEMA: "No FAQ schema detected",
  LOW_JSON_LD_COVERAGE: "Low JSON-LD coverage across pages",
  PAGES_FETCH_FAILED: "Some pages failed to fetch",
  MISSING_BREADCRUMB: "No BreadcrumbList on inner pages",
  MISSING_HOWTO_SCHEMA: "How-to page missing HowTo schema",
  MISSING_PRODUCT_SCHEMA: "Product page missing Product schema",
};

function asBreakdown(value: Partial<ScoreBreakdown> | ScoreBreakdown | unknown): ScoreBreakdown {
  const o = value && typeof value === "object" ? (value as Partial<ScoreBreakdown>) : {};
  return {
    structuredData: typeof o.structuredData === "number" ? o.structuredData : 0,
    aiDiscoveryFiles: typeof o.aiDiscoveryFiles === "number" ? o.aiDiscoveryFiles : 0,
    aiCrawlability: typeof o.aiCrawlability === "number" ? o.aiCrawlability : 0,
    pageCoverage: typeof o.pageCoverage === "number" ? o.pageCoverage : 0,
    answerReadiness: typeof o.answerReadiness === "number" ? o.answerReadiness : 0,
  };
}

function gapBullet(finding: FindingLike): string {
  const label = GAP_LABEL[finding.code as FindingCode] ?? finding.message;
  return `${finding.code}: ${label}`;
}

function summarize(
  score: number,
  max: number,
  gapLabels: string[],
  whatItMeasures: string,
): string {
  if (score >= max && gapLabels.length === 0) {
    return `Full score — checks for ${whatItMeasures} passed.`;
  }
  if (gapLabels.length > 0) {
    const listed = gapLabels.join("; ");
    if (score === 0) {
      return `No points earned. Gaps: ${listed}.`;
    }
    return `Partial score (${score}/${max}). Gaps: ${listed}.`;
  }
  if (score === 0) {
    return `No points earned for ${whatItMeasures}.`;
  }
  return `Score ${score}/${max} for ${whatItMeasures}.`;
}

/**
 * Build per-pillar explanations from score breakdown + failed findings (+ pages for coverage).
 */
export function buildPillarWhy(
  breakdownInput: Partial<ScoreBreakdown> | ScoreBreakdown | unknown,
  findings: FindingLike[],
  pages: PageLike[] = [],
): Record<keyof ScoreBreakdown, PillarWhy> {
  const breakdown = asBreakdown(breakdownInput);
  const failed = findings.filter((f) => !f.passed);
  const missingJsonLdPages = pages.filter((p) => p.fetchStatus === "ok" && !p.hasJsonLd);

  const result = {} as Record<keyof ScoreBreakdown, PillarWhy>;

  for (const meta of PILLAR_META) {
    const max = PILLAR_WEIGHTS[meta.key];
    const score = breakdown[meta.key];
    const related = failed.filter((f) => meta.codes.includes(f.code as FindingCode));
    const bullets = related.map(gapBullet);
    const gapLabels = related.map(
      (f) => GAP_LABEL[f.code as FindingCode] ?? f.message,
    );

    if (meta.key === "pageCoverage" && missingJsonLdPages.length > 0) {
      for (const page of missingJsonLdPages) {
        bullets.push(`NO_JSON_LD: ${page.pageType} — ${page.url}`);
      }
      if (!gapLabels.some((g) => /json-ld/i.test(g))) {
        gapLabels.push(`${missingJsonLdPages.length} page(s) missing JSON-LD`);
      }
    }

    result[meta.key] = {
      key: meta.key,
      label: meta.label,
      score,
      max,
      summary: summarize(score, max, gapLabels, meta.whatItMeasures),
      bullets,
    };
  }

  return result;
}

export const PILLAR_ORDER = PILLAR_META.map((m) => m.key);

/** Short plain-language “what this pillar measures” for info tooltips. */
export const PILLAR_DESCRIPTIONS: Record<keyof ScoreBreakdown, string> = Object.fromEntries(
  PILLAR_META.map((m) => [m.key, m.whatItMeasures]),
) as Record<keyof ScoreBreakdown, string>;

export function getPillarDescription(key: keyof ScoreBreakdown): string {
  return PILLAR_DESCRIPTIONS[key];
}
