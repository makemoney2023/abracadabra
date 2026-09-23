import type { AssessmentConfig } from "./config-schema";
import { bandFor } from "./bands";
import { questionById } from "./config";
import type { Answers, AssessmentScores, ReadinessDim, ScanLinkInput } from "./types";

const DIMS: ReadinessDim[] = ["data", "process", "people", "decision"];

function round(n: number): number {
  return Math.round(n);
}

function optionScore(source: AssessmentConfig, questionId: string, value: unknown): number | null {
  if (typeof value !== "string") return null;
  const question = questionById(questionId, source);
  const option = question?.options?.find((o) => o.value === value);
  return typeof option?.score === "number" ? option.score : null;
}

function subDimension(
  source: AssessmentConfig,
  dim: ReadinessDim,
  answers: Answers,
): { score: number; incomplete: boolean } {
  const ids = source.questions.filter((q) => q.dim === dim).map((q) => q.id);
  const scores = ids
    .map((id) => optionScore(source, id, answers[id]))
    .filter((n): n is number => n != null);
  if (scores.length === 0) return { score: 0, incomplete: true };
  const mean = scores.reduce((sum, n) => sum + n, 0) / scores.length;
  return { score: round((mean / 3) * 100), incomplete: false };
}

export function scoreAssessment(input: {
  answers: Answers;
  scan: ScanLinkInput;
  config: AssessmentConfig;
}): AssessmentScores {
  const { answers, scan, config: source } = input;
  const dims = Object.fromEntries(DIMS.map((dim) => [dim, subDimension(source, dim, answers)])) as Record<
    ReadinessDim,
    { score: number; incomplete: boolean }
  >;
  const incomplete: AssessmentScores["readiness"]["incomplete"] = {};
  for (const dim of DIMS) {
    if (dims[dim].incomplete) incomplete[dim] = true;
  }
  const readinessTotal = round(DIMS.reduce((sum, dim) => sum + dims[dim].score, 0) / DIMS.length);

  const growthScores = ["G01", "G02", "G03"]
    .map((id) => optionScore(source, id, answers[id]))
    .filter((n): n is number => n != null);
  const growthTotal =
    growthScores.length === 0
      ? 0
      : round((growthScores.reduce((sum, n) => sum + n, 0) / growthScores.length / 3) * 100);

  let visibility: AssessmentScores["visibility"];
  if (!scan) {
    visibility = { total: null, breakdown: null, status: "unavailable" };
  } else if (scan.status === "complete" && typeof scan.scoreTotal === "number") {
    visibility = { total: scan.scoreTotal, breakdown: scan.breakdown, status: "complete" };
  } else if (scan.status === "failed") {
    visibility = { total: null, breakdown: null, status: "unavailable" };
  } else {
    visibility = { total: null, breakdown: scan.breakdown, status: "pending" };
  }

  const weights =
    visibility.total == null
      ? {
          readiness: source.weights.fallbackWithoutVisibility.readiness,
          visibility: 0,
          growth: source.weights.fallbackWithoutVisibility.growth,
        }
      : {
          readiness: source.weights.readiness,
          visibility: source.weights.visibility,
          growth: source.weights.growth,
        };
  const overallTotal = round(
    weights.readiness * readinessTotal +
      weights.visibility * (visibility.total ?? 0) +
      weights.growth * growthTotal,
  );

  const selected = Array.isArray(answers.pressure)
    ? answers.pressure.filter((v): v is string => typeof v === "string")
    : [];
  const severityMap = (answers.severity ?? {}) as Record<string, unknown>;
  const pressureQuestion = questionById("pressure", source);
  const pressures: Array<{ code: string; severity: 1 | 2 | 3; offerRow: string; index: number }> = selected.map(
    (code, index) => {
      const raw = severityMap[code];
      const severity: 1 | 2 | 3 = raw === 2 || raw === 3 ? raw : 1;
      const offerRow = pressureQuestion?.options?.find((o) => o.value === code)?.offerRow ?? "custom_fit";
      return { code, severity, offerRow, index };
    },
  );
  pressures.sort((a, b) => b.severity - a.severity || a.index - b.index);

  return {
    configVersion: "v1",
    readiness: {
      total: readinessTotal,
      data: dims.data.score,
      process: dims.process.score,
      people: dims.people.score,
      decision: dims.decision.score,
      incomplete,
    },
    growth: { total: growthTotal },
    visibility,
    overall: {
      total: overallTotal,
      band: bandFor(overallTotal, source).id,
      weights,
    },
    pressures: pressures.map(({ code, severity, offerRow }) => ({ code, severity, offerRow })),
    topPressure: pressures[0]?.code ?? null,
  };
}
