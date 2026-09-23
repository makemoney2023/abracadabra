import { FINDING_IMPACT } from "@/lib/scoring/constants";
import type { FindingCode } from "@/lib/types";
import type { AssessmentConfig } from "./config-schema";
import type { Answers, AssessmentScores, ReadinessDim, Suggestion } from "./types";

const SEVERITY_RANK = { critical: 0, warn: 1, info: 2 } as const;
const DIM_CODE: Record<ReadinessDim, string> = {
  data: "DATA",
  process: "PROCESS",
  people: "PEOPLE",
  decision: "DECISION",
};

export function findingCodeToSlug(code: string): string {
  return code.toLowerCase().replace(/_/g, "-");
}

function bySeverity(list: Suggestion[]): Suggestion[] {
  return [...list].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, 3);
}

function lookup(source: AssessmentConfig, code: string): Suggestion | null {
  const found = source.suggestions.find((s) => s.code === code);
  return found ? { ...found } : null;
}

export type SuggestionScan = {
  status: "complete" | "pending" | "unavailable";
  findings?: Array<{ code: string; severity: "info" | "warn" | "critical"; passed: boolean }>;
};

export function selectSuggestions(input: {
  scores: AssessmentScores;
  answers: Answers;
  scan: SuggestionScan | null;
  config: AssessmentConfig;
}): Record<"readiness" | "growth" | "visibility", Suggestion[]> {
  const { scores, answers, scan, config: source } = input;
  const readiness: Suggestion[] = [];
  const dims: ReadinessDim[] = ["data", "process", "people", "decision"];
  const allStrong = dims.every((dim) => scores.readiness[dim] >= 70 && !scores.readiness.incomplete[dim]);
  if (allStrong) {
    const strong = lookup(source, "READY_STRONG");
    if (strong) readiness.push(strong);
  } else {
    for (const dim of dims) {
      const value = scores.readiness[dim];
      const code =
        value < 40 ? `READY_${DIM_CODE[dim]}_LOW` : value <= 69 ? `READY_${DIM_CODE[dim]}_MID` : null;
      if (!code) continue;
      const item = lookup(source, code);
      if (item) readiness.push(item);
    }
  }

  const growth: Suggestion[] = [];
  const growthTriggers: Array<[string, string]> = [
    ["G01", "GROWTH_ONE_CHANNEL"],
    ["G02", "GROWTH_AI_UNCHECKED"],
    ["G03", "GROWTH_SITE_STUCK"],
  ];
  for (const [id, code] of growthTriggers) {
    const question = source.questions.find((q) => q.id === id);
    const selected = question?.options?.find((o) => o.value === answers[id]);
    if (selected && typeof selected.score === "number" && selected.score <= 1) {
      const item = lookup(source, code);
      if (item) growth.push(item);
    }
  }

  const visibility: Suggestion[] = [];
  if (!scan || scan.status === "unavailable") {
    const item = lookup(source, "VIS_UNAVAILABLE");
    if (item) visibility.push(item);
  } else if (scan.status === "pending") {
    const item = lookup(source, "VIS_PENDING");
    if (item) visibility.push(item);
  } else {
    const ranked = (scan.findings ?? [])
      .filter((f) => !f.passed && f.severity !== "info")
      .sort((a, b) => {
        const impact = (FINDING_IMPACT[b.code as FindingCode] ?? 0) - (FINDING_IMPACT[a.code as FindingCode] ?? 0);
        if (impact !== 0) return impact;
        return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      })
      .slice(0, 3);
    for (const finding of ranked) {
      const item = lookup(source, finding.code) ?? {
        code: finding.code,
        section: "visibility" as const,
        severity: "warn" as const,
        title: finding.code,
        body: "Fix this on the site, then rerun the scan.",
        guideSlug: `fix/${findingCodeToSlug(finding.code)}`,
      };
      visibility.push(item);
    }
  }

  return {
    readiness: bySeverity(readiness),
    growth: bySeverity(growth),
    visibility: bySeverity(visibility),
  };
}
