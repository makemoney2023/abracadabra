/** Report data shared by the PDF renderers. No PDF library imports here. */
import { buildScoreSummary } from "@/lib/scoring/score-summary";
import type { ScoreBreakdown } from "@/lib/types";
import { groupPages, PDF_PAGE_LIMIT, worstPages } from "@/lib/scan/page-groups";

export type ReportPage = {
  url: string;
  pageType: string;
  fetchStatus: string;
  hasJsonLd: boolean;
  schemaTypes: string[];
};

export type ReportFinding = {
  code: string;
  severity: string;
  passed: boolean;
  message: string;
  pageUrl?: string;
};

export type ReportInput = {
  domain: string;
  scoreTotal: number | null;
  scoreBreakdown: unknown;
  pages: ReportPage[];
  findings: ReportFinding[];
  robotsNote?: string | null;
};

export type ReportProps = {
  title: string;
  domain: string;
  scoreTotal: number | null;
  summaryHeadline: string;
  summaryBody: string;
  summaryDrivers: string[];
  pillars: Array<{ label: string; score: number }>;
  /** The worst pages first, at most PDF_PAGE_LIMIT. `pagesTotal` is every page scanned (the CSV has them all). */
  pages: ReportPage[];
  pagesTotal: number;
  /** Deep scans: how robots.txt was followed. */
  robotsNote: string | null;
  pagesFailed: number;
  pagesMissingSchema: number;
  /** Per section: label, pages, failed, without structured data. Worst sections first. */
  sections: Array<{ label: string; total: number; failed: number; missingSchema: number }>;
  findings: ReportFinding[];
};

const PILLAR_LABELS: Array<{ key: keyof ScoreBreakdown; label: string }> = [
  { key: "structuredData", label: "Structured data" },
  { key: "aiDiscoveryFiles", label: "AI discovery files" },
  { key: "aiCrawlability", label: "AI crawlability" },
  { key: "pageCoverage", label: "Page coverage" },
  { key: "answerReadiness", label: "Answer readiness" },
];

function asBreakdown(value: unknown): Partial<ScoreBreakdown> {
  if (!value || typeof value !== "object") return {};
  return value as Partial<ScoreBreakdown>;
}

export function buildReportProps(input: ReportInput): ReportProps {
  const breakdown = asBreakdown(input.scoreBreakdown);
  const topGaps = input.findings
    .filter((f) => !f.passed && (f.severity === "critical" || f.severity === "warn"))
    .slice(0, 3)
    .map((f) => ({ code: f.code, severity: f.severity, message: f.message }));
  const summary = buildScoreSummary({
    domain: input.domain,
    scoreTotal: input.scoreTotal,
    scoreBreakdown: input.scoreBreakdown,
    topGaps,
  });
  return {
    title: `Schema AEO/GEO report — ${input.domain}`,
    domain: input.domain,
    scoreTotal: input.scoreTotal,
    summaryHeadline: summary.headline,
    summaryBody: summary.body,
    summaryDrivers: summary.drivers,
    pillars: PILLAR_LABELS.map(({ key, label }) => ({
      label,
      score: typeof breakdown[key] === "number" ? (breakdown[key] as number) : 0,
    })),
    pages: worstPages(input.pages, PDF_PAGE_LIMIT),
    pagesTotal: input.pages.length,
    robotsNote: input.robotsNote ?? null,
    pagesFailed: input.pages.filter((p) => p.fetchStatus !== "ok").length,
    pagesMissingSchema: input.pages.filter((p) => p.fetchStatus === "ok" && !p.hasJsonLd).length,
    sections: groupPages(input.pages).map((group) => ({
      label: group.label,
      total: group.pages.length,
      failed: group.failed,
      missingSchema: group.missingSchema,
    })),
    findings: input.findings,
  };
}
