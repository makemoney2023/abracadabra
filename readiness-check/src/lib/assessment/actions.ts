import { nanoid } from "nanoid";
import { inngest } from "@/inngest/client";
import { calLink } from "@/lib/check-env";
import { computeOpsPriority } from "@/lib/ops/priority";
import { countRecentPublicScans } from "@/lib/rate-limit";
import { createPublicScan } from "@/lib/scan/create";
import { applyPublicOptIn } from "@/lib/scan/opt-in";
import type { ScoreBreakdown } from "@/lib/types";
import { config, CONFIG_VERSION } from "./config";
import { selectAssessmentPayload } from "./present";
import {
  addAssessmentEvent,
  getAssessmentByToken,
  insertAssessment,
  listAssessmentEvents,
  updateAssessment,
  type AssessmentAdmin,
  type AssessmentRow,
} from "./repository";
import { decideScanLink, type ScanRef } from "./scan-link";
import { scoreAssessment } from "./score";
import { firstStep, getSteps, nextStep } from "./steps";
import type { AssessmentScores, ScanLinkInput } from "./types";
import { applyAnswer, validateAnswer } from "./validate-answer";

const CLIENT_EVENTS = new Set(["results_viewed", "booking_opened", "pdf_downloaded"]);

type ScanRow = {
  id: string;
  public_token: string;
  status: string;
  score_total: number | null;
  score_breakdown: ScoreBreakdown | null;
  domain: string;
  origin: string;
};

type FindingRow = { code: string; severity: "info" | "warn" | "critical"; passed: boolean };

function asScanInput(scan: ScanRow | null): ScanLinkInput {
  if (!scan) return null;
  const status =
    scan.status === "running" || scan.status === "complete" || scan.status === "failed"
      ? scan.status
      : "queued";
  return {
    status,
    scoreTotal: scan.score_total,
    breakdown: scan.score_breakdown,
  };
}

function presentAssessment(row: AssessmentRow, scan: ScanRow | null, findings: FindingRow[], link: string | null) {
  const input = asScanInput(scan);
  const suggestionStatus =
    input?.status === "complete" ? "complete" : input?.status === "failed" || !input ? "unavailable" : "pending";
  return selectAssessmentPayload({
    status: row.status,
    currentStep: row.currentStep,
    answers: row.answers,
    qualifiers: row.qualifiers,
    scores: row.scores,
    optedIn: Boolean(row.optedInAt),
    token: row.publicToken,
    email: row.email,
    name: row.name,
    domain: row.domain ?? scan?.domain ?? null,
    config,
    scan: scan
      ? {
          status: suggestionStatus,
          findings,
          token: scan.public_token,
          scoreTotal: scan.score_total,
          breakdown: scan.score_breakdown,
        }
      : null,
    calLink: link,
  });
}

async function loadFindings(admin: AssessmentAdmin, scanId: string | null): Promise<FindingRow[]> {
  if (!scanId) return [];
  const { data, error } = await admin
    .from("scan_findings")
    .select("code, severity, passed")
    .eq("scan_id", scanId);
  if (error) return [];
  return (data ?? []) as FindingRow[];
}

async function loadScan(admin: AssessmentAdmin, scanId: string | null): Promise<ScanRow | null> {
  if (!scanId) return null;
  const { data, error } = await admin
    .from("scans")
    .select("id, public_token, status, score_total, score_breakdown, domain, origin")
    .eq("id", scanId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ScanRow | null) ?? null;
}

async function newestPublicScan(
  admin: AssessmentAdmin,
  domain: string,
  completedWithin24h: boolean,
): Promise<ScanRef | null> {
  let query = admin
    .from("scans")
    .select("id, public_token, status, created_at")
    .eq("domain", domain)
    .eq("source", "public")
    .order("created_at", { ascending: false })
    .limit(1);
  if (completedWithin24h) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    query = query.eq("status", "complete").gte("created_at", since);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: data.id as string, token: data.public_token as string, status: data.status as string };
}

async function linkScan(
  admin: AssessmentAdmin,
  row: AssessmentRow,
  domain: string,
  origin: string,
): Promise<{ id: string; token: string; status: string; reused: boolean } | null> {
  try {
    const decision = await decideScanLink({
      findNewestCompletedWithin24h: () => newestPublicScan(admin, domain, true),
      countRecentPublicScans: () => countRecentPublicScans(domain, admin),
      findNewestAny: () => newestPublicScan(admin, domain, false),
    });
    if (decision.action === "unavailable") {
      await addAssessmentEvent(admin, row.id, "scan_requested", { error: "unavailable" });
      return null;
    }
    const scan =
      decision.action === "reuse"
        ? decision.scan
        : await createPublicScan(admin, { domain, origin, source: "public" });
    const scanId = decision.action === "reuse" ? decision.scan.id : scan.id;
    const token = decision.action === "reuse" ? decision.scan.token : scan.token;
    const status = decision.action === "reuse" ? decision.scan.status : scan.status;
    await updateAssessment(admin, row.id, { scan_id: scanId });
    await addAssessmentEvent(admin, row.id, "scan_requested", {
      scanId,
      reused: decision.action === "reuse",
    });
    return { id: scanId, token, status, reused: decision.action === "reuse" };
  } catch (err) {
    await addAssessmentEvent(admin, row.id, "scan_requested", {
      error: err instanceof Error ? err.message : "scan failed",
    });
    return null;
  }
}

export async function createAssessment(
  admin: AssessmentAdmin,
  input: { utm?: Record<string, string>; ipHash?: string },
): Promise<{ token: string; configVersion: string; firstStep: string }> {
  const token = nanoid(24);
  const step = firstStep(config);
  const utm = { ...(input.utm ?? {}) };
  if (input.ipHash) utm.ip_hash = input.ipHash;
  const row = await insertAssessment(admin, {
    token,
    configVersion: CONFIG_VERSION,
    utm,
    currentStep: step,
  });
  await addAssessmentEvent(admin, row.id, "started", {});
  return { token, configVersion: CONFIG_VERSION, firstStep: step };
}

async function refreshIfPending(admin: AssessmentAdmin, row: AssessmentRow, scan: ScanRow | null) {
  if (!row.scores || row.scores.visibility.status !== "pending") return row.scores;
  if (!scan || scan.status !== "complete" || typeof scan.score_total !== "number") return row.scores;
  const scores = scoreAssessment({
    answers: row.answers,
    scan: { status: "complete", scoreTotal: scan.score_total, breakdown: scan.score_breakdown ?? null },
    config,
  });
  await updateAssessment(admin, row.id, { scores });
  return scores;
}

export async function readAssessment(admin: AssessmentAdmin, token: string) {
  const row = await getAssessmentByToken(admin, token);
  if (!row) return null;
  const scan = await loadScan(admin, row.scanId);
  const scores = await refreshIfPending(admin, row, scan);
  const findings = await loadFindings(admin, row.scanId);
  return presentAssessment({ ...row, scores }, scan, findings, calLink());
}

export async function patchAssessmentAnswer(
  admin: AssessmentAdmin,
  token: string,
  stepId: string,
  answer: unknown,
) {
  const row = await getAssessmentByToken(admin, token);
  if (!row) return { status: 404 as const, body: { error: "Check not found" } };
  if (row.status !== "in_progress") {
    return { status: 409 as const, body: { error: "This check is already finished" } };
  }
  const validated = validateAnswer(config, stepId, answer);
  if (!validated.ok) {
    return { status: 400 as const, body: { error: "Invalid answer", details: validated.details } };
  }
  const merged = applyAnswer(row.answers, row.qualifiers, stepId, validated.value);
  const upcoming = nextStep(config, merged.answers, stepId);
  const previousSection = getSteps(config, row.answers).find((s) => s.id === stepId)?.sectionId;
  const nextSection =
    upcoming === "gate" ? null : getSteps(config, merged.answers).find((s) => s.id === upcoming)?.sectionId;
  const patch: Record<string, unknown> = {
    answers: merged.answers,
    qualifiers: merged.qualifiers,
    current_step: upcoming === "gate" ? "gate" : upcoming,
  };
  if (validated.domain) {
    patch.domain = validated.domain;
  }
  await updateAssessment(admin, row.id, patch);
  await addAssessmentEvent(admin, row.id, "step", { stepId });
  if (previousSection && previousSection !== nextSection) {
    await addAssessmentEvent(admin, row.id, "section_complete", { sectionId: previousSection });
  }
  let scan: { id: string; token: string; status: string; reused: boolean } | null = null;
  if (stepId === "G04" && validated.domain && validated.origin) {
    scan = await linkScan(admin, row, validated.domain, validated.origin);
  }
  return { status: 200 as const, body: { ok: true, nextStep: upcoming, scan: scan ?? undefined } };
}

export async function completeAssessment(admin: AssessmentAdmin, token: string) {
  const row = await getAssessmentByToken(admin, token);
  if (!row) return { status: 404 as const, body: { error: "Check not found" } };
  if (row.status === "completed" && row.scores) {
    return { status: 200 as const, body: { ok: true, band: row.scores.overall.band } };
  }
  const scan = await loadScan(admin, row.scanId);
  const scores: AssessmentScores = scoreAssessment({
    answers: row.answers,
    scan: asScanInput(scan),
    config,
  });
  await updateAssessment(admin, row.id, {
    status: "completed",
    scores,
    completed_at: new Date().toISOString(),
    current_step: "gate",
  });
  await addAssessmentEvent(admin, row.id, "completed", { band: scores.overall.band });
  await addAssessmentEvent(admin, row.id, "gate_shown", { band: scores.overall.band });
  await inngest.send({ name: "assessment/completed", data: { assessmentId: row.id } });
  return { status: 200 as const, body: { ok: true, band: scores.overall.band } };
}

export async function optInAssessment(
  admin: AssessmentAdmin,
  token: string,
  input: { email: string; name?: string },
) {
  const row = await getAssessmentByToken(admin, token);
  if (!row) return { status: 404 as const, body: { error: "Check not found" } };
  if (row.status !== "completed" || !row.scores) {
    return { status: 409 as const, body: { error: "Finish the check before requesting the report" } };
  }
  const scan = await loadScan(admin, row.scanId);
  const domain = row.domain ?? scan?.domain ?? `check-${row.publicToken}.invalid`;
  const origin = scan?.origin ?? (row.domain ? `https://${row.domain}` : `https://${domain}`);
  const priority = computeOpsPriority({
    scoreTotal: typeof scan?.score_total === "number" ? scan.score_total : 100,
    hasContact: true,
    readiness: row.scores.readiness.total,
    topPressureSeverity: row.scores.pressures[0]?.severity ?? null,
    booked: false,
  });
  const lead = await applyPublicOptIn(admin, {
    scanId: scan?.id,
    domain,
    origin,
    email: input.email,
    name: input.name,
    source: "readiness_check",
    assessmentId: row.id,
    priorityScore: priority,
    missingContact: false,
  });
  await updateAssessment(admin, row.id, {
    lead_id: lead.leadId,
    email: input.email,
    name: input.name ?? null,
    opted_in_at: row.optedInAt ?? new Date().toISOString(),
  });
  await addAssessmentEvent(admin, row.id, "opted_in", {});
  const fresh = await getAssessmentByToken(admin, token);
  const findings = await loadFindings(admin, row.scanId);
  const payload = presentAssessment(
    {
      ...(fresh ?? row),
      email: input.email,
      name: input.name ?? row.name,
      optedInAt: fresh?.optedInAt ?? new Date().toISOString(),
      scores: row.scores,
    },
    scan,
    findings,
    calLink(),
  );
  return {
    status: 200 as const,
    body: { ok: true, leadId: lead.leadId, results: payload.results },
    scanToken: scan?.public_token ?? null,
  };
}

export async function recordClientEvent(admin: AssessmentAdmin, token: string, kind: string, data?: Record<string, unknown>) {
  if (!CLIENT_EVENTS.has(kind)) {
    return { status: 400 as const, body: { error: "Unknown event" } };
  }
  const row = await getAssessmentByToken(admin, token);
  if (!row) return { status: 404 as const, body: { error: "Check not found" } };
  await addAssessmentEvent(admin, row.id, kind, data ?? {});
  return { status: 200 as const, body: { ok: true } };
}

export async function opsAssessment(admin: AssessmentAdmin, token: string) {
  const row = await getAssessmentByToken(admin, token);
  if (!row) return null;
  const events = await listAssessmentEvents(admin, row.id);
  const { data: appointment } = await admin
    .from("appointments")
    .select("starts_at, ends_at, status, external_id")
    .eq("assessment_id", row.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { assessment: row, events, appointment: appointment ?? null };
}

