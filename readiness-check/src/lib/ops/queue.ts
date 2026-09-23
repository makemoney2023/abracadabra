import type { OpsStatus } from "@/lib/types";

export type OpsQueueFilters = {
  status?: OpsStatus;
  hasEmail?: boolean;
  minScore?: number;
  maxScore?: number;
};

export type OpsQueueItem = {
  id: string;
  leadId: string;
  status: OpsStatus;
  priorityScore: number;
  missingContact: boolean;
  notes: string | null;
  statusChangedAt: string;
  lead: {
    id: string;
    name: string | null;
    domain: string;
    website: string | null;
    industry: string | null;
  };
  contacts: Array<{
    id: string;
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
  }>;
  latestScan: {
    id: string;
    scoreTotal: number | null;
    status: string;
    publicToken: string;
    scoreBreakdown: unknown;
  } | null;
  topGaps: Array<{ code: string; severity: string; message: string }>;
  check: {
    token: string;
    band: string | null;
    overall: number | null;
    readiness: number | null;
    growth: number | null;
    visibility: number | null;
    pressures: string[];
    appointmentStartsAt: string | null;
  } | null;
};

export function parseQueueFilters(searchParams: URLSearchParams): OpsQueueFilters {
  const status = searchParams.get("status") as OpsStatus | null;
  const hasEmailRaw = searchParams.get("hasEmail");
  const minScoreRaw = searchParams.get("minScore");
  const maxScoreRaw = searchParams.get("maxScore");

  const filters: OpsQueueFilters = {};
  if (status && ["new", "contacted", "won", "skipped", "booked"].includes(status)) {
    filters.status = status;
  }
  if (hasEmailRaw === "true") filters.hasEmail = true;
  if (hasEmailRaw === "false") filters.hasEmail = false;
  if (minScoreRaw != null && minScoreRaw !== "") {
    const n = Number(minScoreRaw);
    if (!Number.isNaN(n)) filters.minScore = n;
  }
  if (maxScoreRaw != null && maxScoreRaw !== "") {
    const n = Number(maxScoreRaw);
    if (!Number.isNaN(n)) filters.maxScore = n;
  }
  return filters;
}

export function applyQueueFilters(
  items: OpsQueueItem[],
  filters: OpsQueueFilters,
): OpsQueueItem[] {
  return items.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.hasEmail === true) {
      const has = item.contacts.some((c) => Boolean(c.email));
      if (!has) return false;
    }
    if (filters.hasEmail === false) {
      const has = item.contacts.some((c) => Boolean(c.email));
      if (has) return false;
    }
    const score = item.latestScan?.scoreTotal;
    if (filters.minScore != null) {
      if (typeof score !== "number" || score < filters.minScore) return false;
    }
    if (filters.maxScore != null) {
      if (typeof score !== "number" || score > filters.maxScore) return false;
    }
    return true;
  });
}

type DbFinding = {
  code: string;
  severity: string;
  passed: boolean;
  message: string;
};

type DbContact = {
  id: string;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
};

type DbLead = {
  id: string;
  name: string | null;
  domain: string;
  website: string | null;
  industry: string | null;
  contacts?: DbContact[] | null;
};

type DbScan = {
  id: string;
  score_total: number | null;
  status: string;
  public_token: string;
  score_breakdown: unknown;
  scan_findings?: DbFinding[] | null;
};

type DbAppointment = {
  starts_at: string;
  status: string;
};

type DbAssessment = {
  public_token: string;
  scores: unknown;
  answers: unknown;
  appointments?: DbAppointment | DbAppointment[] | null;
};

export type DbQueueRow = {
  id: string;
  lead_id: string;
  status: OpsStatus;
  priority_score: number | string;
  missing_contact: boolean;
  notes: string | null;
  status_changed_at: string;
  leads: DbLead | DbLead[] | null;
  scans: DbScan | DbScan[] | null;
  assessments?: DbAssessment | DbAssessment[] | null;
};

function readScores(scores: unknown): {
  band: string | null;
  overall: number | null;
  readiness: number | null;
  growth: number | null;
  visibility: number | null;
} {
  if (!scores || typeof scores !== "object") {
    return { band: null, overall: null, readiness: null, growth: null, visibility: null };
  }
  const record = scores as Record<string, unknown>;
  const overall = record.overall as { total?: unknown; band?: unknown } | undefined;
  const readiness = record.readiness as { total?: unknown } | undefined;
  const growth = record.growth as { total?: unknown } | undefined;
  const visibility = record.visibility as { total?: unknown } | undefined;
  const num = (value: unknown) => (typeof value === "number" ? value : null);
  return {
    band: typeof overall?.band === "string" ? overall.band : null,
    overall: num(overall?.total),
    readiness: num(readiness?.total),
    growth: num(growth?.total),
    visibility: num(visibility?.total),
  };
}

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapQueueRow(row: DbQueueRow): OpsQueueItem {
  const lead = asOne(row.leads);
  const scan = asOne(row.scans);
  const findings = (scan?.scan_findings ?? []).filter(
    (f) => !f.passed && (f.severity === "critical" || f.severity === "warn"),
  );
  const topGaps = findings.slice(0, 3).map((f) => ({
    code: f.code,
    severity: f.severity,
    message: f.message,
  }));
  const assessment = asOne(row.assessments);
  const appointment = asOne(assessment?.appointments);
  const parsed = assessment ? readScores(assessment.scores) : null;
  const pressureRaw =
    assessment && assessment.answers && typeof assessment.answers === "object"
      ? (assessment.answers as { pressure?: unknown }).pressure
      : null;
  const pressures = Array.isArray(pressureRaw)
    ? pressureRaw.filter((code): code is string => typeof code === "string")
    : [];

  return {
    id: row.id,
    leadId: row.lead_id,
    status: row.status,
    priorityScore: Number(row.priority_score),
    missingContact: row.missing_contact,
    notes: row.notes,
    statusChangedAt: row.status_changed_at,
    lead: {
      id: lead?.id ?? row.lead_id,
      name: lead?.name ?? null,
      domain: lead?.domain ?? "",
      website: lead?.website ?? null,
      industry: lead?.industry ?? null,
    },
    contacts: lead?.contacts ?? [],
    latestScan: scan
      ? {
          id: scan.id,
          scoreTotal: scan.score_total,
          status: scan.status,
          publicToken: scan.public_token,
          scoreBreakdown: scan.score_breakdown,
        }
      : null,
    topGaps,
    check: assessment
      ? {
          token: assessment.public_token,
          band: parsed?.band ?? null,
          overall: parsed?.overall ?? null,
          readiness: parsed?.readiness ?? null,
          growth: parsed?.growth ?? null,
          visibility: parsed?.visibility ?? null,
          pressures,
          appointmentStartsAt: appointment?.starts_at ?? null,
        }
      : null,
  };
}
