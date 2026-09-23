import { PILLAR_WEIGHTS } from "@/lib/scoring/constants";
import {
  scoreBand,
  scoreBandLabel,
  scoreRatio,
} from "@/lib/scoring/score-color";
import type { ScoreBreakdown } from "@/lib/types";

export type ScoreSummaryGap = {
  code: string;
  severity: string;
  message: string;
};

export type ScoreSummary = {
  headline: string;
  body: string;
  /** Short bullets that justify the headline (gaps + weak pillars). */
  drivers: string[];
};

const PILLAR_LABELS: Record<keyof ScoreBreakdown, string> = {
  structuredData: "structured data",
  aiDiscoveryFiles: "AI discovery files",
  aiCrawlability: "AI crawlability",
  pageCoverage: "page coverage",
  answerReadiness: "answer readiness",
};

function asBreakdown(value: unknown): ScoreBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(PILLAR_WEIGHTS) as Array<keyof ScoreBreakdown>;
  const out = {} as ScoreBreakdown;
  for (const key of keys) {
    const n = o[key];
    if (typeof n !== "number" || Number.isNaN(n)) return null;
    out[key] = n;
  }
  return out;
}

function pillarRatios(breakdown: ScoreBreakdown): Array<{
  key: keyof ScoreBreakdown;
  label: string;
  score: number;
  max: number;
  ratio: number;
}> {
  return (Object.keys(PILLAR_WEIGHTS) as Array<keyof ScoreBreakdown>).map((key) => {
    const max = PILLAR_WEIGHTS[key];
    const score = breakdown[key];
    return {
      key,
      label: PILLAR_LABELS[key],
      score,
      max,
      ratio: scoreRatio(score, max),
    };
  });
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Deterministic written explanation of why the overall AI-visibility score landed where it did.
 */
export function buildScoreSummary(input: {
  domain: string;
  scoreTotal: number | null;
  scoreBreakdown: unknown;
  topGaps: ScoreSummaryGap[];
}): ScoreSummary {
  const { domain, scoreTotal, topGaps } = input;

  if (scoreTotal == null) {
    return {
      headline: "Score unavailable",
      body: `We do not have a finished AI-visibility score for ${domain} yet. When the scan completes, this summary will explain which pillars drove the result.`,
      drivers: ["Scan still running or failed before scoring."],
    };
  }

  const ratio = scoreRatio(scoreTotal, 100);
  const band = scoreBand(ratio);
  const bandLabel = scoreBandLabel(band);
  const headline = `${bandLabel} AI visibility (${scoreTotal}/100)`;

  const breakdown = asBreakdown(input.scoreBreakdown);
  const pillars = breakdown ? pillarRatios(breakdown) : [];
  const weakest = [...pillars].sort((a, b) => a.ratio - b.ratio).slice(0, 2);
  const strongest = [...pillars].sort((a, b) => b.ratio - a.ratio)[0];

  const gapDrivers = topGaps
    .filter((g) => g.severity === "critical" || g.severity === "warn")
    .slice(0, 3)
    .map((g) => g.message.replace(/\.$/, ""));

  const drivers: string[] = [];
  for (const w of weakest) {
    if (w.ratio < 0.85) {
      drivers.push(
        `${w.label[0]!.toUpperCase()}${w.label.slice(1)} scored ${Math.round(w.score)}/${w.max} (${Math.round(w.ratio * 100)}% of that pillar).`,
      );
    }
  }
  for (const g of gapDrivers) {
    if (!drivers.some((d) => d.includes(g))) drivers.push(g);
  }
  if (drivers.length === 0 && strongest) {
    drivers.push(
      `Strongest pillar: ${strongest.label} at ${Math.round(strongest.score)}/${strongest.max}.`,
    );
  }

  let body: string;
  if (band === "strong") {
    const strength = strongest
      ? ` ${strongest.label[0]!.toUpperCase()}${strongest.label.slice(1)} is a particular strength.`
      : "";
    body = `${domain} scores ${scoreTotal}/100 — a strong AI-visibility result. Answer engines can likely read the core translation layer with confidence.${strength}`;
    if (gapDrivers.length > 0) {
      body += ` Remaining polish: ${joinList(gapDrivers.map((g) => g.charAt(0).toLowerCase() + g.slice(1)))}.`;
    }
  } else if (band === "good") {
    const drag = weakest
      .filter((w) => w.ratio < 0.75)
      .map((w) => w.label);
    body = `${domain} scores ${scoreTotal}/100 — solid AI visibility with room to climb.`;
    if (drag.length > 0) {
      body += ` The main drag is ${joinList(drag)}.`;
    }
    if (gapDrivers.length > 0) {
      body += ` Key gaps: ${joinList(gapDrivers.map((g) => g.charAt(0).toLowerCase() + g.slice(1)))}.`;
    }
  } else if (band === "fair") {
    const drag = weakest.map((w) => w.label);
    body = `${domain} scores ${scoreTotal}/100 — fair AI visibility. Humans can still browse the site, but answer engines will guess more than they should.`;
    if (drag.length > 0) {
      body += ` Weakest pillars: ${joinList(drag)}.`;
    }
    if (gapDrivers.length > 0) {
      body += ` Top issues: ${joinList(gapDrivers.map((g) => g.charAt(0).toLowerCase() + g.slice(1)))}.`;
    }
  } else {
    const drag = weakest.map((w) => w.label);
    body = `${domain} scores ${scoreTotal}/100 — poor AI visibility. The machine-readable translation layer is thin or missing, so generative engines are unlikely to cite this site confidently.`;
    if (drag.length > 0) {
      body += ` Biggest gaps sit in ${joinList(drag)}.`;
    }
    if (gapDrivers.length > 0) {
      body += ` Start with: ${joinList(gapDrivers.map((g) => g.charAt(0).toLowerCase() + g.slice(1)))}.`;
    }
  }

  return { headline, body, drivers: drivers.slice(0, 4) };
}
