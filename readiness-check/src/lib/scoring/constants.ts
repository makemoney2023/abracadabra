import type { FindingCode } from "@/lib/types";

export const PILLAR_WEIGHTS = {
  structuredData: 35,
  aiDiscoveryFiles: 20,
  aiCrawlability: 20,
  pageCoverage: 15,
  answerReadiness: 10,
} as const;

export const MAX_PAGES = 40;

/** Schema.org types treated as FAQ-like signals across pillars. */
export const FAQ_LIKE_SCHEMA_TYPES = ["FAQPage", "QAPage"] as const;

/** Schema.org types treated as Organization/LocalBusiness signals across pillars. */
export const ORG_LIKE_SCHEMA_TYPES = ["Organization", "LocalBusiness"] as const;

/** Page types considered critical for coverage — must carry JSON-LD to avoid a coverage penalty. */
export const CRITICAL_PAGE_TYPES = ["home", "contact", "service"] as const;

/** Fraction of the `structuredData` pillar attributed to each sub-check. Must sum to 1. */
export const STRUCTURED_DATA_RATIOS = {
  jsonLdPresence: 0.5,
  orgSchema: 0.3,
  faqSchema: 0.2,
} as const;

/** Fraction of the `aiDiscoveryFiles` pillar attributed to each sub-check. Must sum to 1. */
export const AI_DISCOVERY_RATIOS = {
  llmsTxt: 0.45,
  llmsFull: 0.15,
  sitemap: 0.4,
} as const;

export const AI_CRAWLABILITY_RATIOS = {
  /** Fraction of the `aiCrawlability` weight retained when non-GPTBot AI bots are blocked (not a blanket GPTBot block). */
  partialBlockRetained: 0.5,
} as const;

export const ANSWER_READINESS_RATIOS = {
  /** Fraction of the `answerReadiness` weight awarded when only Organization/LocalBusiness contact signals are present (no FAQ). */
  orgSignalFallback: 0.4,
} as const;

export const PAGE_COVERAGE_THRESHOLDS = {
  /** Below this JSON-LD ratio among ok pages, flag general low coverage. */
  lowCoverage: 0.5,
  /** Fraction of the `pageCoverage` weight deducted (scaled by missing/present critical types) when a critical page type lacks JSON-LD. */
  criticalTypeMissingPenalty: 0.5,
  /** Approximate `pageCoverage` weight fraction a `PAGES_FETCH_FAILED` finding represents for priority-fix ranking. */
  pagesFetchFailedImpact: 0.25,
} as const;

/**
 * Approximate pillar points recoverable by resolving each finding — used to rank `priorityFixes`.
 * Derived from the pillar weights and ratios above so impact values stay in sync with the scoring rules.
 */
export const FINDING_IMPACT: Record<FindingCode, number> = {
  NO_JSON_LD_HOME: PILLAR_WEIGHTS.structuredData * STRUCTURED_DATA_RATIOS.jsonLdPresence,
  NO_ORG_SCHEMA: PILLAR_WEIGHTS.structuredData * STRUCTURED_DATA_RATIOS.orgSchema,
  MISSING_FAQ_SCHEMA: PILLAR_WEIGHTS.structuredData * STRUCTURED_DATA_RATIOS.faqSchema,
  MISSING_LLMS_TXT: PILLAR_WEIGHTS.aiDiscoveryFiles * AI_DISCOVERY_RATIOS.llmsTxt,
  EMPTY_LLMS_TXT: PILLAR_WEIGHTS.aiDiscoveryFiles * AI_DISCOVERY_RATIOS.llmsTxt,
  MISSING_LLMS_FULL: PILLAR_WEIGHTS.aiDiscoveryFiles * AI_DISCOVERY_RATIOS.llmsFull,
  SITEMAP_MISSING: PILLAR_WEIGHTS.aiDiscoveryFiles * AI_DISCOVERY_RATIOS.sitemap,
  SITEMAP_UNPARSEABLE: PILLAR_WEIGHTS.aiDiscoveryFiles * AI_DISCOVERY_RATIOS.sitemap,
  ROBOTS_BLOCKS_GPTBOT: PILLAR_WEIGHTS.aiCrawlability,
  ROBOTS_BLOCKS_AI_BOTS: PILLAR_WEIGHTS.aiCrawlability * (1 - AI_CRAWLABILITY_RATIOS.partialBlockRetained),
  LOW_JSON_LD_COVERAGE: PILLAR_WEIGHTS.pageCoverage * PAGE_COVERAGE_THRESHOLDS.criticalTypeMissingPenalty,
  PAGES_FETCH_FAILED: PILLAR_WEIGHTS.pageCoverage * PAGE_COVERAGE_THRESHOLDS.pagesFetchFailedImpact,
  MISSING_BREADCRUMB: 1,
  MISSING_HOWTO_SCHEMA: 1,
  MISSING_PRODUCT_SCHEMA: 1,
};
