"use client";

import { useEffect, useMemo, useState } from "react";
import { config } from "@/lib/assessment/config";
import type { AssessmentPayload } from "@/lib/assessment/present";
import { getSteps, sectionIndex, type Step } from "@/lib/assessment/steps";
import { GateForm } from "./GateForm";
import { ProgressSegments } from "./ProgressSegments";
import { MultiSelect } from "./questions/MultiSelect";
import { SeverityPicker } from "./questions/SeverityPicker";
import { SingleSelect } from "./questions/SingleSelect";
import { TextField } from "./questions/TextField";
import { UrlField } from "./questions/UrlField";
import { ResultsView } from "./results/ResultsView";

function draftFor(step: Step, answers: Record<string, unknown>, qualifiers: Record<string, unknown>): unknown {
  if (step.kind === "severity") {
    const code = step.id.slice("severity:".length);
    const map = (answers.severity ?? {}) as Record<string, unknown>;
    return map[code] ?? null;
  }
  if (step.id.startsWith("Q")) return qualifiers[step.id] ?? "";
  if (step.kind === "multi_select") return Array.isArray(answers.pressure) ? answers.pressure : [];
  return answers[step.id] ?? (step.kind === "text" || step.kind === "url" ? "" : null);
}

export function CheckSession({ token }: { token: string }) {
  const [payload, setPayload] = useState<AssessmentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const res = await fetch(`/api/assessments/${token}`);
    if (res.status === 404) {
      setError("This check link isn't valid.");
      setLoaded(true);
      return;
    }
    const data = (await res.json()) as AssessmentPayload & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Could not load this check.");
      setLoaded(true);
      return;
    }
    setPayload(data);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const steps = useMemo(
    () => (payload ? getSteps(config, payload.answers) : []),
    [payload],
  );
  const currentId = payload?.currentStep && payload.currentStep !== "gate" ? payload.currentStep : steps[0]?.id;
  const step = steps.find((item) => item.id === currentId) ?? steps[0];

  useEffect(() => {
    if (!payload || !step) return;
    setDraft(draftFor(step, payload.answers, payload.qualifiers));
  }, [payload, step]);

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading your check…</p>;
  if (error) {
    return (
      <div className="space-y-3">
        <p role="alert">{error}</p>
        <a className="underline" href="/check">
          Start a new one
        </a>
      </div>
    );
  }
  if (!payload) return null;
  if (payload.results) return <ResultsView token={token} initial={payload.results} />;
  if (payload.status === "completed" || payload.currentStep === "gate") {
    return <GateForm token={token} bandLabel={payload.preview?.bandLabel ?? "Scored"} />;
  }
  if (!step) return null;

  const question = config.questions.find((item) => item.id === (step.kind === "severity" ? "pressure" : step.id));
  const prompt =
    step.kind === "severity"
      ? (question?.options?.find((option) => option.value === step.id.slice("severity:".length))?.label ?? "How costly is this?")
      : (question?.prompt ?? "");

  async function save(nextDraft = draft) {
    if (!step) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId: step.id, answer: nextDraft }),
      });
      const data = (await res.json()) as { error?: string; details?: string; nextStep?: string };
      if (!res.ok) {
        setError(typeof data.details === "string" ? data.details : (data.error ?? "Could not save that answer."));
        return;
      }
      if (data.nextStep === "gate") {
        await fetch(`/api/assessments/${token}/complete`, { method: "POST" });
      }
      await load();
    } catch {
      setError("Could not save that answer. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function goBack() {
    const index = steps.findIndex((item) => item.id === step?.id);
    const previous = index > 0 ? steps[index - 1] : null;
    if (!previous || !payload) return;
    setPayload({ ...payload, currentStep: previous.id });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <ProgressSegments active={sectionIndex(step.sectionId)} />
      <div className="space-y-4">
        <h1 className="font-heading text-3xl tracking-tight">{prompt}</h1>
        {step.kind === "multi_select" ? (
          <MultiSelect
            options={question?.options ?? []}
            value={Array.isArray(draft) ? (draft as string[]) : []}
            onChange={setDraft}
          />
        ) : null}
        {step.kind === "severity" ? (
          <SeverityPicker
            options={config.severity}
            value={typeof draft === "number" ? draft : null}
            onChange={setDraft}
          />
        ) : null}
        {step.kind === "single_select" ? (
          <SingleSelect
            name={prompt}
            options={question?.options ?? []}
            value={typeof draft === "string" ? draft : null}
            onChange={setDraft}
          />
        ) : null}
        {step.kind === "text" ? (
          <TextField
            id={step.id}
            label={prompt}
            value={typeof draft === "string" ? draft : ""}
            maxLength={question?.maxLength ?? 240}
            suggestions={question?.suggestions}
            onChange={setDraft}
          />
        ) : null}
        {step.kind === "url" ? (
          <UrlField id={step.id} value={typeof draft === "string" ? draft : ""} onChange={setDraft} />
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="button" className="min-h-11 cursor-pointer rounded-md border px-4 text-sm" onClick={goBack}>
            Back
          </button>
          <button
            type="button"
            disabled={pending}
            className="bg-primary text-primary-foreground min-h-11 cursor-pointer rounded-md px-4 text-sm font-medium disabled:opacity-60"
            onClick={() => void save()}
          >
            {pending ? "Saving…" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
