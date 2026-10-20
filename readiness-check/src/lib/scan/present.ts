import { buildPillarWhy, type PillarWhy } from "@/lib/scoring/pillar-why";
import { buildScoreSummary, type ScoreSummary } from "@/lib/scoring/score-summary";
import type { ScoreBreakdown } from "@/lib/types";

export type ScanGap = {
  code: string;
  severity: string;
  message: string;
};

export type PageMissingJsonLd = {
  url: string;
  pageType: string;
};

export type FullScanView = {
  domain: string;
  status: string;
  scoreTotal: number | null;
  scoreBreakdown: unknown;
  findings: Array<{
    code: string;
    severity: string;
    passed: boolean;
    message: string;
    pageUrl?: string;
    evidence?: Record<string, unknown>;
  }>;
  pages: Array<{
    url: string;
    pageType: string;
    fetchStatus: string;
    hasJsonLd: boolean;
    schemaTypes: string[];
  }>;
};

type ScanPayloadBase = {
  domain: string;
  status: string;
  scoreTotal: number | null;
  scoreBreakdown: unknown;
  topGaps: ScanGap[];
  pagesMissingJsonLd: PageMissingJsonLd[];
  pillarWhy: Record<keyof ScoreBreakdown, PillarWhy>;
  scoreSummary: ScoreSummary;
  /** Every issue the scan recorded. Free: no email, no payment. */
  findings: FullScanView["findings"];
};

export type LockedScanPayload = ScanPayloadBase & {
  unlocked: false;
};

export type UnlockedScanPayload = ScanPayloadBase & {
  unlocked: true;
  pages: FullScanView["pages"];
};

export type ScanPayload = LockedScanPayload | UnlockedScanPayload;

function selectTopGaps(findings: FullScanView["findings"]): ScanGap[] {
  return findings
    .filter((f) => !f.passed && (f.severity === "critical" || f.severity === "warn"))
    .slice(0, 3)
    .map((f) => ({
      code: f.code,
      severity: f.severity,
      message: f.message,
    }));
}

export function selectPagesMissingJsonLd(
  pages: FullScanView["pages"],
): PageMissingJsonLd[] {
  return pages
    .filter((p) => p.fetchStatus === "ok" && !p.hasJsonLd)
    .map((p) => ({ url: p.url, pageType: p.pageType }));
}

/**
 * Soft-gate projection. Always free: score, pillars, every finding, pages missing structured data.
 * Email unlock adds the page matrix (and the PDF route). Fix files are paid, separately.
 */
export function selectScanPayload(full: FullScanView, unlocked: boolean): ScanPayload {
  const topGaps = selectTopGaps(full.findings);
  const pagesMissingJsonLd = selectPagesMissingJsonLd(full.pages);
  const pillarWhy = buildPillarWhy(full.scoreBreakdown, full.findings, full.pages);
  const scoreSummary = buildScoreSummary({
    domain: full.domain,
    scoreTotal: full.scoreTotal,
    scoreBreakdown: full.scoreBreakdown,
    topGaps,
  });
  const base: ScanPayloadBase = {
    domain: full.domain,
    status: full.status,
    scoreTotal: full.scoreTotal,
    scoreBreakdown: full.scoreBreakdown,
    topGaps,
    pagesMissingJsonLd,
    pillarWhy,
    scoreSummary,
    findings: full.findings,
  };

  if (!unlocked) {
    return { ...base, unlocked: false };
  }

  return {
    ...base,
    unlocked: true,
    pages: full.pages,
  };
}
