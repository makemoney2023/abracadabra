import type { AssessmentConfig } from "./config-schema";
import { bandFor } from "./bands";
import { mapPressuresToOffers } from "./offers";
import { questionById } from "./config";
import { selectSuggestions, type SuggestionScan } from "./suggest";
import type { Answers, AssessmentScores, Offer, Suggestion } from "./types";

export type BookingPrefill = {
  calLink: string | null;
  prefill: { name: string; email: string; assessment: string; domain: string; band: string; pressure: string };
  mailto: string;
};

/**
 * What a visitor sees: the scores (overall, readiness with its four pillars, growth, website visibility),
 * a stage name with its sentence, and next steps for their business. `stage` and `bandLabel`/`bandSentence`
 * carry the same band; the band fields keep the pre-stage API shape for anything that still reads them.
 */
export type StageView = { id: string; label: string; sentence: string };

export type PressureView = { code: string; label: string; severityLabel: string };

export type ResultsPayload = {
  domain: string | null;
  scores: AssessmentScores;
  bandLabel: string;
  bandSentence: string;
  stage: StageView;
  topPressureLabel: string | null;
  pressures: PressureView[];
  suggestions: Record<"readiness" | "growth" | "visibility", Suggestion[]>;
  offers: Offer[];
  visibility: { status: AssessmentScores["visibility"]["status"] };
  scan: {
    token: string;
    status: string;
    scoreTotal: number | null;
    breakdown: unknown;
  } | null;
  booking: BookingPrefill;
  appointment?: { startsAt: string; status: string };
};

export type AssessmentPayload = {
  status: string;
  currentStep: string | null;
  answers: Answers;
  qualifiers: Record<string, unknown>;
  gated: boolean;
  /** The gate shows the stage name only; the scores come with the results after the email. */
  preview?: { stage: string; stageLabel: string; band: string; bandLabel: string };
  results?: ResultsPayload;
};

/**
 * "The job that costs the most right now: <label>." Pressure labels are full sentences that already end
 * with a period, so strip trailing punctuation before adding ours (no "gets done..").
 */
export function costliestJobSentence(label: string | null | undefined): string {
  const trimmed = (label ?? "").replace(/[.\s]+$/, "");
  return trimmed ? `The job that costs the most right now: ${trimmed}.` : "";
}

export function buildBooking(input: {
  calLink: string | null | undefined;
  token: string;
  email: string;
  name: string;
  domain: string | null;
  band: string;
  stageLabel?: string;
  pressure: string;
}): BookingPrefill {
  const domain = input.domain ?? "";
  const subject = encodeURIComponent(`Working session — ${domain || "Readiness Check"}`);
  const body = encodeURIComponent(`Stage: ${input.stageLabel ?? input.band}\nSite: ${domain}`);
  return {
    calLink: input.calLink || null,
    prefill: {
      name: input.name,
      email: input.email,
      assessment: input.token,
      domain,
      band: input.band,
      pressure: input.pressure,
    },
    mailto: `mailto:houdini@abra-ca-dabra.app?subject=${subject}&body=${body}`,
  };
}

export function selectAssessmentPayload(input: {
  status: string;
  currentStep: string | null;
  answers: Answers;
  qualifiers: Record<string, unknown>;
  scores: AssessmentScores | null;
  optedIn: boolean;
  token: string;
  email: string | null;
  name: string | null;
  domain: string | null;
  config: AssessmentConfig;
  scan: (SuggestionScan & { token: string; scoreTotal: number | null; breakdown: unknown }) | null;
  calLink?: string | null;
  appointment?: { startsAt: string; status: string };
}): AssessmentPayload {
  const base = {
    status: input.status,
    currentStep: input.currentStep,
    answers: input.answers,
    qualifiers: input.qualifiers,
    gated: !input.optedIn,
  };
  if (!input.scores) return base;
  const band = bandFor(input.scores.overall.total, input.config);
  if (!input.optedIn) {
    return { ...base, preview: { stage: band.id, stageLabel: band.label, band: band.id, bandLabel: band.label } };
  }
  const pressureQuestion = questionById("pressure", input.config);
  const top = input.scores.topPressure;
  const topLabel = pressureQuestion?.options?.find((o) => o.value === top)?.label ?? null;
  const pressures: PressureView[] = input.scores.pressures.map((item) => ({
    code: item.code,
    label: pressureQuestion?.options?.find((o) => o.value === item.code)?.label ?? item.code,
    severityLabel: input.config.severity.find((s) => s.score === item.severity)?.label ?? "",
  }));
  const results: ResultsPayload = {
    domain: input.domain,
    scores: input.scores,
    bandLabel: band.label,
    bandSentence: band.sentence,
    stage: { id: band.id, label: band.label, sentence: band.sentence },
    topPressureLabel: topLabel,
    pressures,
    suggestions: selectSuggestions({
      scores: input.scores,
      answers: input.answers,
      scan: input.scan,
      config: input.config,
    }),
    offers: mapPressuresToOffers({ pressures: input.scores.pressures, config: input.config }),
    visibility: { status: input.scores.visibility.status },
    scan: input.scan
      ? {
          token: input.scan.token,
          status: input.scan.status,
          scoreTotal: input.scan.scoreTotal,
          breakdown: input.scan.breakdown,
        }
      : null,
    booking: buildBooking({
      calLink: input.calLink,
      token: input.token,
      email: input.email ?? "",
      name: input.name ?? "",
      domain: input.domain,
      band: band.id,
      stageLabel: band.label,
      pressure: top ?? "",
    }),
    appointment: input.appointment,
  };
  return { ...base, results };
}
