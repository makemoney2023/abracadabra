import { analyzeLlmsTxt } from "@/lib/detect/llms-txt";
import { analyzeRobots } from "@/lib/detect/robots";
import { parseSitemapUrls } from "@/lib/detect/sitemap";
import type { DetectedPage, ScoreBreakdown, ScoreResult, SiteFiles } from "@/lib/types";
import {
  AI_CRAWLABILITY_RATIOS,
  AI_DISCOVERY_RATIOS,
  ANSWER_READINESS_RATIOS,
  CRITICAL_PAGE_TYPES,
  FAQ_LIKE_SCHEMA_TYPES,
  ORG_LIKE_SCHEMA_TYPES,
  PAGE_COVERAGE_THRESHOLDS,
  PILLAR_WEIGHTS,
  STRUCTURED_DATA_RATIOS,
} from "./constants";
import { buildPriorityFixes, finding, type ScoreFinding } from "./findings";

const FAQ_LIKE_TYPES = new Set<string>(FAQ_LIKE_SCHEMA_TYPES);
const ORG_LIKE_TYPES = new Set<string>(ORG_LIKE_SCHEMA_TYPES);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function okPagesOf(pages: DetectedPage[]): DetectedPage[] {
  return pages.filter((p) => p.fetchStatus === "ok");
}

function scoreStructuredData(pages: DetectedPage[], weight: number, findings: ScoreFinding[]): number {
  const okPages = okPagesOf(pages);
  const home = okPages.find((p) => p.pageType === "home") ?? okPages[0];

  let score = 0;

  if (home?.hasJsonLd) {
    score += weight * STRUCTURED_DATA_RATIOS.jsonLdPresence;
  } else {
    findings.push(
      finding("NO_JSON_LD_HOME", "critical", false, "Home page is missing JSON-LD structured data.", {
        pageUrl: home?.url,
      }),
    );
  }

  const hasOrgSchema = home?.schemaTypes.some((t) => ORG_LIKE_TYPES.has(t)) ?? false;
  if (hasOrgSchema) {
    score += weight * STRUCTURED_DATA_RATIOS.orgSchema;
  } else {
    findings.push(
      finding("NO_ORG_SCHEMA", "warn", false, "Home page is missing Organization/LocalBusiness schema.", {
        pageUrl: home?.url,
      }),
    );
  }

  const hasFaq = okPages.some((p) => p.schemaTypes.some((t) => FAQ_LIKE_TYPES.has(t)));
  if (hasFaq) {
    score += weight * STRUCTURED_DATA_RATIOS.faqSchema;
  } else {
    findings.push(finding("MISSING_FAQ_SCHEMA", "info", false, "No FAQ schema detected across scanned pages."));
  }

  return clamp(score, 0, weight);
}

function scoreAiDiscoveryFiles(siteFiles: SiteFiles, weight: number, findings: ScoreFinding[]): number {
  const llmsWeight = weight * AI_DISCOVERY_RATIOS.llmsTxt;
  const llmsFullWeight = weight * AI_DISCOVERY_RATIOS.llmsFull;
  const sitemapWeight = weight * AI_DISCOVERY_RATIOS.sitemap;
  let score = 0;

  const llms = analyzeLlmsTxt(siteFiles.llmsTxt);
  if (!llms.present) {
    findings.push(finding("MISSING_LLMS_TXT", "critical", false, "llms.txt is missing."));
  } else if (!llms.useful) {
    findings.push(finding("EMPTY_LLMS_TXT", "warn", false, "llms.txt is present but not useful."));
  } else {
    score += llmsWeight;
  }

  const llmsFull = analyzeLlmsTxt(siteFiles.llmsFullTxt);
  if (!llmsFull.present || !llmsFull.useful) {
    findings.push(
      finding(
        "MISSING_LLMS_FULL",
        "info",
        false,
        "llms-full.txt is missing or not useful for deeper AI discovery.",
      ),
    );
  } else {
    score += llmsFullWeight;
  }

  const sitemapUrls = parseSitemapUrls(siteFiles.sitemapXml);
  if (!siteFiles.sitemapXml) {
    findings.push(finding("SITEMAP_MISSING", "warn", false, "sitemap.xml is missing."));
  } else if (sitemapUrls.length === 0) {
    findings.push(finding("SITEMAP_UNPARSEABLE", "warn", false, "sitemap.xml could not be parsed."));
  } else {
    score += sitemapWeight;
  }

  return clamp(score, 0, weight);
}

function scoreAiCrawlability(siteFiles: SiteFiles, weight: number, findings: ScoreFinding[]): number {
  const robots = analyzeRobots(siteFiles.robotsTxt);

  if (!robots.present) return weight;

  if (robots.blocksGptBot) {
    findings.push(
      finding("ROBOTS_BLOCKS_GPTBOT", "critical", false, "robots.txt disallows GPTBot.", {
        evidence: { blockedAiBots: robots.blockedAiBots },
      }),
    );
    return 0;
  }

  if (robots.blockedAiBots.length > 0) {
    findings.push(
      finding("ROBOTS_BLOCKS_AI_BOTS", "warn", false, "robots.txt disallows one or more AI crawlers.", {
        evidence: { blockedAiBots: robots.blockedAiBots },
      }),
    );
    return clamp(weight * AI_CRAWLABILITY_RATIOS.partialBlockRetained, 0, weight);
  }

  return weight;
}

function scorePageCoverage(pages: DetectedPage[], weight: number, findings: ScoreFinding[]): number {
  const failedPages = pages.filter((p) => p.fetchStatus === "failed");
  if (failedPages.length > 0) {
    findings.push(
      finding(
        "PAGES_FETCH_FAILED",
        "warn",
        false,
        `${failedPages.length} page(s) failed to fetch and were excluded from coverage.`,
        { evidence: { urls: failedPages.map((p) => p.url) } },
      ),
    );
  }

  const okPages = okPagesOf(pages);
  if (okPages.length === 0) return 0;

  const withJsonLd = okPages.filter((p) => p.hasJsonLd).length;
  const ratio = withJsonLd / okPages.length;
  let score = weight * ratio;

  const presentCriticalTypes = CRITICAL_PAGE_TYPES.filter((type) => okPages.some((p) => p.pageType === type));
  const criticalTypesMissingJsonLd = presentCriticalTypes.filter(
    (type) => !okPages.some((p) => p.pageType === type && p.hasJsonLd),
  );

  if (criticalTypesMissingJsonLd.length > 0) {
    const penaltyRatio = criticalTypesMissingJsonLd.length / presentCriticalTypes.length;
    score -= weight * penaltyRatio * PAGE_COVERAGE_THRESHOLDS.criticalTypeMissingPenalty;
    findings.push(
      finding(
        "LOW_JSON_LD_COVERAGE",
        "warn",
        false,
        `Critical page type(s) missing JSON-LD: ${criticalTypesMissingJsonLd.join(", ")}.`,
        { evidence: { missingCriticalTypes: criticalTypesMissingJsonLd } },
      ),
    );
  } else if (ratio < PAGE_COVERAGE_THRESHOLDS.lowCoverage) {
    findings.push(finding("LOW_JSON_LD_COVERAGE", "warn", false, "Less than half of scanned pages have JSON-LD."));
  }

  return clamp(score, 0, weight);
}

function scoreAnswerReadiness(pages: DetectedPage[], weight: number): number {
  const okPages = okPagesOf(pages);
  const hasFaq = okPages.some((p) => p.schemaTypes.some((t) => FAQ_LIKE_TYPES.has(t)));
  if (hasFaq) return weight;

  const hasOrgSignal = okPages.some((p) => p.schemaTypes.some((t) => ORG_LIKE_TYPES.has(t)));
  if (hasOrgSignal) return clamp(weight * ANSWER_READINESS_RATIOS.orgSignalFallback, 0, weight);

  return 0;
}

/** Info-level schema gaps that do not change pillar math (fix-package signals). */
function collectSupplementalFindings(pages: DetectedPage[], findings: ScoreFinding[]): void {
  const okPages = okPagesOf(pages);
  const inner = okPages.filter((p) => p.pageType !== "home");
  if (inner.length > 0) {
    const withBreadcrumb = inner.filter((p) => p.schemaTypes.includes("BreadcrumbList"));
    if (withBreadcrumb.length === 0) {
      findings.push(
        finding(
          "MISSING_BREADCRUMB",
          "info",
          false,
          "No BreadcrumbList schema detected on inner pages.",
        ),
      );
    }
  }

  for (const page of okPages) {
    if (page.pageType === "howto" && !page.schemaTypes.includes("HowTo")) {
      findings.push(
        finding(
          "MISSING_HOWTO_SCHEMA",
          "info",
          false,
          "How-to page is missing HowTo schema.",
          { pageUrl: page.url },
        ),
      );
    }
    if (page.pageType === "product" && !page.schemaTypes.includes("Product")) {
      findings.push(
        finding(
          "MISSING_PRODUCT_SCHEMA",
          "info",
          false,
          "Product page is missing Product schema.",
          { pageUrl: page.url },
        ),
      );
    }
  }
}

export function scoreScan({ pages, siteFiles }: { pages: DetectedPage[]; siteFiles: SiteFiles }): ScoreResult {
  const findings: ScoreFinding[] = [];

  const breakdown: ScoreBreakdown = {
    structuredData: Math.round(scoreStructuredData(pages, PILLAR_WEIGHTS.structuredData, findings)),
    aiDiscoveryFiles: Math.round(scoreAiDiscoveryFiles(siteFiles, PILLAR_WEIGHTS.aiDiscoveryFiles, findings)),
    aiCrawlability: Math.round(scoreAiCrawlability(siteFiles, PILLAR_WEIGHTS.aiCrawlability, findings)),
    pageCoverage: Math.round(scorePageCoverage(pages, PILLAR_WEIGHTS.pageCoverage, findings)),
    answerReadiness: Math.round(scoreAnswerReadiness(pages, PILLAR_WEIGHTS.answerReadiness)),
  };

  collectSupplementalFindings(pages, findings);

  const scoreTotal = clamp(
    breakdown.structuredData +
      breakdown.aiDiscoveryFiles +
      breakdown.aiCrawlability +
      breakdown.pageCoverage +
      breakdown.answerReadiness,
    0,
    100,
  );

  return {
    scoreTotal,
    breakdown,
    findings,
    priorityFixes: buildPriorityFixes(findings),
  };
}
