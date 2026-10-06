import { checkUrl } from "@/lib/check-env";
import { mapAssessment, type AssessmentAdmin, type AssessmentRow } from "@/lib/assessment/repository";

type IntakeRow = {
  id: string;
  email: string | null;
  name?: string | null;
  domain: string | null;
  answers?: unknown;
  scores?: { overall?: { total?: number } } | null;
  utm?: unknown;
  completedAt?: string | null;
  publicToken: string;
};

export type IntakeBody = Record<string, unknown>;

export function assessmentIntakeBody(
  row: IntakeRow,
  reportOrigin: string,
): { skip: true } | { skip: false; body: IntakeBody } {
  if (!row.email) return { skip: true };
  const origin = reportOrigin.replace(/\/$/, "");
  return {
    skip: false,
    body: {
      assessment_id: row.id,
      email: row.email,
      name: row.name ?? null,
      domain: row.domain,
      answers: row.answers ?? {},
      scores: row.scores ?? {},
      total_score: row.scores?.overall?.total ?? null,
      utm: row.utm ?? {},
      report_url: `${origin}/r/${row.publicToken}`,
      completed_at: row.completedAt ? Date.parse(row.completedAt) : null,
    },
  };
}

async function signBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export async function postSignedIntake(
  origin: string,
  secret: string,
  path: string,
  body: IntakeBody,
  now: number,
  fetchImpl: FetchImpl = fetch,
): Promise<{ ok: true; skipped?: boolean }> {
  if (!secret.trim() || !origin.trim()) return { ok: true, skipped: true };
  const raw = JSON.stringify(body);
  const signature = await signBody(secret, raw);
  const response = await fetchImpl(`${origin.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-intake-signature": signature,
      "x-intake-timestamp": String(now),
    },
    body: raw,
  });
  if (response.status !== 202) {
    throw new Error(`Handoff intake returned ${response.status}`);
  }
  return { ok: true };
}

function intakeEnv(): { origin: string; secret: string } {
  return {
    origin: process.env.HANDOFF_INTAKE_ORIGIN?.trim() ?? "",
    secret: process.env.INTAKE_SIGNING_SECRET?.trim() ?? "",
  };
}

export async function deliverCompletedAssessment(
  admin: AssessmentAdmin,
  assessmentId: string,
  now = Date.now(),
): Promise<{ ok: true; skipped?: boolean }> {
  const { data, error } = await admin.from("assessments").select("*").eq("id", assessmentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: true, skipped: true };
  const row = mapAssessment(data as Parameters<typeof mapAssessment>[0]);
  return postAssessmentRow(row, now);
}

async function postAssessmentRow(
  row: AssessmentRow,
  now: number,
): Promise<{ ok: true; skipped?: boolean }> {
  const built = assessmentIntakeBody(row, checkUrl());
  if (built.skip) return { ok: true, skipped: true };
  const { origin, secret } = intakeEnv();
  return postSignedIntake(origin, secret, "/api/intake/assessment", built.body, now);
}

export async function forwardBooking(
  event: {
    kind: "created" | "rescheduled" | "cancelled";
    externalId: string | null;
    startsAt: string | null;
    email: string | null;
    name: string | null;
  },
  now = Date.now(),
): Promise<{ ok: true; skipped?: boolean }> {
  const { origin, secret } = intakeEnv();
  if (!origin || !secret) return { ok: true, skipped: true };
  if (!event.externalId || !event.startsAt) return { ok: true, skipped: true };
  const startsAt = Date.parse(event.startsAt);
  if (!Number.isFinite(startsAt)) return { ok: true, skipped: true };
  return postSignedIntake(
    origin,
    secret,
    "/api/intake/booking",
    {
      external_id: event.externalId,
      email: event.email,
      name: event.name,
      starts_at: startsAt,
      kind: event.kind,
    },
    now,
  );
}
