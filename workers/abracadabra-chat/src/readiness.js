import { READINESS } from "./readiness-questions.js";

/**
 * The Readiness Check, asked inside the chat. The check worker stays the source of truth: the chat
 * creates a real assessment, sends each answer with PATCH, follows the nextStep the check returns,
 * then asks the check to score it. The visitor opens the report on check.abra-ca-dabra.app/check/<token>,
 * where the check's own email gate and opt-in run as usual.
 */
export const CHECK_ORIGIN = "https://check.abra-ca-dabra.app";
export const READINESS_STEPS_ESTIMATE = 17;

export function checkOrigin(env) {
  return String(env?.READINESS_ORIGIN || CHECK_ORIGIN).replace(/\/+$/, "");
}

/** Through the service binding when it is set (no public hop), else the public origin. */
export async function checkFetch(env, path, init = {}, deps = {}) {
  const url = `${checkOrigin(env)}${path}`;
  const request = new Request(url, init);
  if (env?.READINESS && typeof env.READINESS.fetch === "function") return env.READINESS.fetch(request);
  return (deps.readinessFetch || deps.fetchImpl || fetch)(request);
}

/** What the widget shows for one step: a prompt and, where there are any, the options. */
export function stepView(stepId, answered = 0) {
  const progress = { answered, estimate: Math.max(READINESS_STEPS_ESTIMATE, answered + 1) };
  if (stepId.startsWith("severity:")) {
    const code = stepId.slice("severity:".length);
    const symptom = READINESS.questions.pressure.options.find((o) => o.value === code);
    if (!symptom) return null;
    return { id: stepId, kind: "severity", prompt: "How much does this cost you?", detail: symptom.label, options: READINESS.severity, progress };
  }
  const q = READINESS.questions[stepId];
  if (!q) return null;
  return {
    id: stepId,
    kind: q.type,
    prompt: q.prompt,
    ...(q.options ? { options: q.options } : {}),
    ...(q.maxLength ? { maxLength: q.maxLength } : {}),
    ...(q.suggestions ? { suggestions: q.suggestions } : {}),
    progress,
  };
}

export function bandView(band) {
  const known = READINESS.bands[band];
  return known ? { id: band, label: known.label, sentence: known.sentence } : { id: String(band || ""), label: "Finished", sentence: "" };
}

/** Answers are checked for shape here; the check validates them again. */
export function cleanAnswer(stepId, answer) {
  if (stepId.startsWith("severity:")) return [1, 2, 3].includes(answer) ? answer : undefined;
  const q = READINESS.questions[stepId];
  if (!q) return undefined;
  if (q.type === "multi_select") {
    if (!Array.isArray(answer)) return undefined;
    const allowed = new Set(q.options.map((o) => o.value));
    return [...new Set(answer)].filter((v) => allowed.has(v));
  }
  if (q.type === "single_select") return q.options.some((o) => o.value === answer) ? answer : undefined;
  if (q.type === "text" || q.type === "url") return typeof answer === "string" ? answer.trim().slice(0, q.maxLength || 240) : undefined;
  return undefined;
}

/** A plain-words label for the answer, for the chat transcript (never sent to the model as an instruction). */
export function answerLabel(stepId, answer) {
  if (stepId.startsWith("severity:")) return READINESS.severity.find((s) => s.value === answer)?.label || "";
  const q = READINESS.questions[stepId];
  if (!q) return "";
  if (q.type === "multi_select") {
    const labels = answer.map((v) => q.options.find((o) => o.value === v)?.label).filter(Boolean);
    return labels.length ? labels.join(" / ") : "None of these";
  }
  if (q.type === "single_select") return q.options.find((o) => o.value === answer)?.label || "";
  return answer || "(skipped)";
}
