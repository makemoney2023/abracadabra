import type { ScoreBreakdown } from "@/lib/types";

export type BandId = "early" | "forming" | "ready" | "running";
export type ReadinessDim = "data" | "process" | "people" | "decision";
export type SuggestionSection = "readiness" | "growth" | "visibility";
export type SuggestionSeverity = "info" | "warn" | "critical";

export type AssessmentScores = {
  configVersion: "v1";
  readiness: {
    total: number;
    data: number;
    process: number;
    people: number;
    decision: number;
    incomplete: Partial<Record<ReadinessDim, true>>;
  };
  growth: { total: number };
  visibility: {
    total: number | null;
    breakdown: ScoreBreakdown | null;
    status: "complete" | "pending" | "unavailable";
  };
  overall: {
    total: number;
    band: BandId;
    weights: { readiness: number; visibility: number; growth: number };
  };
  pressures: Array<{ code: string; severity: 1 | 2 | 3; offerRow: string }>;
  topPressure: string | null;
};

export type Suggestion = {
  code: string;
  section: SuggestionSection;
  severity: SuggestionSeverity;
  title: string;
  body: string;
  guideSlug: string;
};

export type Offer = {
  row: string;
  said: string;
  build: string;
  specimens: Array<{ name: string; url: string }>;
};

export type ScanLinkInput = {
  status: "queued" | "running" | "complete" | "failed";
  scoreTotal: number | null;
  breakdown: ScoreBreakdown | null;
} | null;

export type Answers = Record<string, unknown>;
