export type ScanSource = "public" | "ops";
export type ScanStatus = "queued" | "running" | "complete" | "failed";
export type PageFetchStatus = "pending" | "ok" | "failed" | "unknown";
export type FindingSeverity = "info" | "warn" | "critical";
export type OpsStatus = "new" | "contacted" | "won" | "skipped" | "booked";

export type ScoreBreakdown = {
  structuredData: number;
  aiDiscoveryFiles: number;
  aiCrawlability: number;
  pageCoverage: number;
  answerReadiness: number;
};

export type FindingCode =
  | "MISSING_LLMS_TXT"
  | "EMPTY_LLMS_TXT"
  | "MISSING_LLMS_FULL"
  | "SITEMAP_MISSING"
  | "SITEMAP_UNPARSEABLE"
  | "ROBOTS_BLOCKS_GPTBOT"
  | "ROBOTS_BLOCKS_AI_BOTS"
  | "NO_JSON_LD_HOME"
  | "NO_ORG_SCHEMA"
  | "LOW_JSON_LD_COVERAGE"
  | "PAGES_FETCH_FAILED"
  | "MISSING_FAQ_SCHEMA"
  | "MISSING_BREADCRUMB"
  | "MISSING_HOWTO_SCHEMA"
  | "MISSING_PRODUCT_SCHEMA";

export type DetectedPage = {
  url: string;
  pageType: string;
  fetchStatus: PageFetchStatus;
  hasJsonLd: boolean;
  schemaTypes: string[];
  rawContent?: string;
  /** PageFacts stored on scan_pages.evidence for fix generation */
  evidence?: import("@/lib/facts/types").PageFacts;
};

export type SiteFiles = {
  robotsTxt: string | null;
  sitemapXml: string | null;
  llmsTxt: string | null;
  llmsFullTxt: string | null;
};

export type ScoreResult = {
  scoreTotal: number;
  breakdown: ScoreBreakdown;
  findings: Array<{
    code: FindingCode;
    severity: FindingSeverity;
    passed: boolean;
    message: string;
    pageUrl?: string;
    evidence?: Record<string, unknown>;
  }>;
  priorityFixes: string[];
};
