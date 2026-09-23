import { normalizeDomain } from "@/lib/domain";
import type { AssessmentConfig } from "./config-schema";
import { questionById } from "./config";

export type ValidAnswer =
  | { ok: true; value: unknown; domain?: string; origin?: string }
  | { ok: false; details: string };

export function validateAnswer(
  source: AssessmentConfig,
  stepId: string,
  answer: unknown,
): ValidAnswer {
  if (stepId.startsWith("severity:")) {
    const code = stepId.slice("severity:".length);
    const pressure = questionById("pressure", source);
    const known = (pressure?.options ?? []).some((o) => o.value === code);
    if (!known) return { ok: false, details: "Unknown symptom" };
    if (answer !== 1 && answer !== 2 && answer !== 3) {
      return { ok: false, details: "Severity must be 1, 2, or 3" };
    }
    return { ok: true, value: answer };
  }

  const question = questionById(stepId, source);
  if (!question) return { ok: false, details: "Unknown step" };

  if (question.type === "multi_select") {
    if (!Array.isArray(answer) || answer.some((v) => typeof v !== "string")) {
      return { ok: false, details: "Select a list of symptoms" };
    }
    const allowed = new Set((question.options ?? []).map((o) => o.value));
    const unique = [...new Set(answer)];
    if (unique.some((v) => !allowed.has(v))) {
      return { ok: false, details: "Unknown symptom" };
    }
    return { ok: true, value: unique };
  }

  if (question.type === "single_select") {
    const allowed = new Set((question.options ?? []).map((o) => o.value));
    if (typeof answer !== "string" || !allowed.has(answer)) {
      return { ok: false, details: "Choose one of the options" };
    }
    return { ok: true, value: answer };
  }

  if (question.type === "text") {
    if (typeof answer !== "string") return { ok: false, details: "Enter text" };
    const trimmed = answer.trim();
    const max = question.maxLength ?? 240;
    if (trimmed.length > max) return { ok: false, details: `Keep it under ${max} characters` };
    return { ok: true, value: trimmed };
  }

  if (question.type === "url") {
    if (typeof answer !== "string" || !answer.trim()) {
      return { ok: false, details: "Enter a website" };
    }
    try {
      const normalized = normalizeDomain(answer);
      return { ok: true, value: normalized.origin, domain: normalized.domain, origin: normalized.origin };
    } catch (err) {
      return { ok: false, details: err instanceof Error ? err.message : "Invalid domain" };
    }
  }

  return { ok: false, details: "Unsupported step" };
}

export function applyAnswer(
  answers: Record<string, unknown>,
  qualifiers: Record<string, unknown>,
  stepId: string,
  value: unknown,
): { answers: Record<string, unknown>; qualifiers: Record<string, unknown> } {
  const nextAnswers = { ...answers };
  const nextQualifiers = { ...qualifiers };
  if (stepId.startsWith("severity:")) {
    const code = stepId.slice("severity:".length);
    const current = (nextAnswers.severity ?? {}) as Record<string, unknown>;
    nextAnswers.severity = { ...current, [code]: value };
    return { answers: nextAnswers, qualifiers: nextQualifiers };
  }
  if (stepId.startsWith("Q")) {
    nextQualifiers[stepId] = value;
    return { answers: nextAnswers, qualifiers: nextQualifiers };
  }
  nextAnswers[stepId] = value;
  if (stepId === "pressure" && Array.isArray(value)) {
    const severity = { ...((nextAnswers.severity ?? {}) as Record<string, unknown>) };
    for (const key of Object.keys(severity)) {
      if (!value.includes(key)) delete severity[key];
    }
    nextAnswers.severity = severity;
  }
  return { answers: nextAnswers, qualifiers: nextQualifiers };
}
