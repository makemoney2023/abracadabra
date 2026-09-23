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

export type ResultsPayload = {
  domain: string | null;
  scores: AssessmentScores;
  bandLabel: string;
  bandSentence: string;
  topPressureLabel: string | null;
  suggestions: Record<"readiness" | "growth" | "visibility", Suggestion[]>;
  offers: Offer[];
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
  preview?: { band: string; bandLabel: string };
  results?: ResultsPayload;
};

export function buildBooking(input: {
  calLink: string | null | undefined;
  token: string;
  email: string;
  name: string;
  domain: string | null;
  band: string;
  pressure: string;
}): BookingPrefill {
  const domain = input.domain ?? "";
  const subject = encodeURIComponent(`Working session — ${domain || "Readiness Check"}`);
  const body = encodeURIComponent(`Band: ${input.band}\nSite: ${domain}`);
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
    mailto: `mailto:dev@pirx.ca?subject=${subject}&body=${body}`,
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
    return { ...base, preview: { band: band.id, bandLabel: band.label } };
  }
  const pressureQuestion = questionById("pressure", input.config);
  const top = input.scores.topPressure;
  const topLabel = pressureQuestion?.options?.find((o) => o.value === top)?.label ?? null;
  const results: ResultsPayload = {
    domain: input.domain,
    scores: input.scores,
    bandLabel: band.label,
    bandSentence: band.sentence,
    topPressureLabel: topLabel,
    suggestions: selectSuggestions({
      scores: input.scores,
      answers: input.answers,
      scan: input.scan,
      config: input.config,
    }),
    offers: mapPressuresToOffers({ pressures: input.scores.pressures, config: input.config }),
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
      pressure: top ?? "",
    }),
    appointment: input.appointment,
  };
  return { ...base, results };
}
