import type { AssessmentConfig } from "./config-schema";
import type { Answers } from "./types";

export type Step = {
  id: string;
  sectionId: "pressure" | "readiness" | "growth" | "about";
  kind: "multi_select" | "severity" | "single_select" | "text" | "url";
};

const SECTION_ORDER = ["pressure", "readiness", "growth", "about"] as const;

export function selectedPressures(answers: Answers, source: AssessmentConfig): string[] {
  const pressure = source.questions.find((q) => q.id === "pressure");
  const allowed = new Set((pressure?.options ?? []).map((o) => o.value));
  const raw = answers.pressure;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && allowed.has(v));
}

export function getSteps(source: AssessmentConfig, answers: Answers): Step[] {
  const steps: Step[] = [
    { id: "pressure", sectionId: "pressure", kind: "multi_select" },
  ];
  for (const code of selectedPressures(answers, source)) {
    steps.push({ id: `severity:${code}`, sectionId: "pressure", kind: "severity" });
  }
  const scored = source.questions.filter((q) => q.id !== "pressure" && q.id !== "G04" && q.sectionId !== "about");
  for (const q of scored) {
    steps.push({ id: q.id, sectionId: q.sectionId, kind: q.type === "single_select" ? "single_select" : q.type });
  }
  const url = source.questions.find((q) => q.id === "G04");
  if (url) steps.push({ id: "G04", sectionId: "growth", kind: "url" });
  for (const q of source.questions.filter((item) => item.sectionId === "about")) {
    steps.push({
      id: q.id,
      sectionId: "about",
      kind: q.type === "text" ? "text" : "single_select",
    });
  }
  return steps;
}

export function firstStep(source: AssessmentConfig): string {
  return getSteps(source, {})[0]?.id ?? "pressure";
}

export function nextStep(source: AssessmentConfig, answers: Answers, currentStepId: string): string | "gate" {
  const steps = getSteps(source, answers);
  const idx = steps.findIndex((s) => s.id === currentStepId);
  if (idx < 0) return steps[0]?.id ?? "gate";
  return steps[idx + 1]?.id ?? "gate";
}

export function prevStep(source: AssessmentConfig, answers: Answers, currentStepId: string): string | null {
  const steps = getSteps(source, answers);
  const idx = steps.findIndex((s) => s.id === currentStepId);
  if (idx <= 0) return null;
  return steps[idx - 1]?.id ?? null;
}

export function sectionIndex(sectionId: Step["sectionId"]): number {
  return SECTION_ORDER.indexOf(sectionId);
}
