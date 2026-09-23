import type { Answers, AssessmentScores } from "./types";

export type AssessmentStatus = "in_progress" | "completed" | "abandoned";

export type AssessmentRow = {
  id: string;
  publicToken: string;
  configVersion: string;
  status: AssessmentStatus;
  leadId: string | null;
  scanId: string | null;
  domain: string | null;
  email: string | null;
  name: string | null;
  answers: Answers;
  qualifiers: Record<string, unknown>;
  scores: AssessmentScores | null;
  utm: Record<string, unknown>;
  currentStep: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  optedInAt: string | null;
};

export type AssessmentAdmin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type DbAssessment = {
  id: string;
  public_token: string;
  config_version: string;
  status: AssessmentStatus;
  lead_id: string | null;
  scan_id: string | null;
  domain: string | null;
  email: string | null;
  name: string | null;
  answers: Answers | null;
  qualifiers: Record<string, unknown> | null;
  scores: AssessmentScores | null;
  utm: Record<string, unknown> | null;
  current_step: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  opted_in_at: string | null;
};

export function mapAssessment(row: DbAssessment): AssessmentRow {
  return {
    id: row.id,
    publicToken: row.public_token,
    configVersion: row.config_version,
    status: row.status,
    leadId: row.lead_id,
    scanId: row.scan_id,
    domain: row.domain,
    email: row.email,
    name: row.name,
    answers: row.answers ?? {},
    qualifiers: row.qualifiers ?? {},
    scores: row.scores,
    utm: row.utm ?? {},
    currentStep: row.current_step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    optedInAt: row.opted_in_at,
  };
}

export async function getAssessmentByToken(
  admin: AssessmentAdmin,
  token: string,
): Promise<AssessmentRow | null> {
  const { data, error } = await admin
    .from("assessments")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapAssessment(data as DbAssessment) : null;
}

export async function insertAssessment(
  admin: AssessmentAdmin,
  input: { token: string; configVersion: string; utm: Record<string, unknown>; currentStep: string },
): Promise<AssessmentRow> {
  const { data, error } = await admin
    .from("assessments")
    .insert({
      public_token: input.token,
      config_version: input.configVersion,
      utm: input.utm,
      current_step: input.currentStep,
      status: "in_progress",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return mapAssessment(data as DbAssessment);
}

export async function updateAssessment(
  admin: AssessmentAdmin,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("assessments").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addAssessmentEvent(
  admin: AssessmentAdmin,
  assessmentId: string,
  kind: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin.from("assessment_events").insert({
    assessment_id: assessmentId,
    kind,
    data,
  });
  if (error) throw new Error(error.message);
}

export async function listAssessmentEvents(
  admin: AssessmentAdmin,
  assessmentId: string,
): Promise<Array<{ id: string; kind: string; data: unknown; createdAt: string }>> {
  const { data, error } = await admin
    .from("assessment_events")
    .select("id, kind, data, created_at")
    .eq("assessment_id", assessmentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { id: string; kind: string; data: unknown; created_at: string }) => ({
    id: row.id,
    kind: row.kind,
    data: row.data,
    createdAt: row.created_at,
  }));
}
