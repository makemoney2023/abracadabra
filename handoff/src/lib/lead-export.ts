import type { Sql } from "../db/sql";
import { routingStatusOf, type RoutingStatus } from "./lead-routing";
import { CHECK_ORIGIN } from "./schema-report";

/** Constant-time string compare. Unequal lengths still walk the longer string. */
export function sameToken(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

/** True only when a token is configured and the Bearer header matches it. */
export function exportAuthorized(header: string | null, token: string): boolean {
  const expected = token.trim();
  if (!expected) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? "");
  if (!match) return false;
  return sameToken(match[1].trim(), expected);
}

/**
 * Link to the "Are you ready for AI" Readiness Check survey. /check/start only keeps utm_* params,
 * so the deal ref rides in utm_content and comes back in the assessment's utm_json.
 */
export function surveyUrl(dealId: string, origin = CHECK_ORIGIN): string {
  const url = new URL("/check/start", origin);
  url.searchParams.set("utm_source", "outbound");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", "schema_score");
  url.searchParams.set("utm_content", `deal_${dealId}`);
  return url.toString();
}

export type ExportedLead = {
  deal_id: string;
  organization_id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  primary_contact: { name: string | null; email: string | null; title: string | null } | null;
  source: string | null;
  lead_score: number | null;
  schema_score: number | null;
  scored_at: string | null;
  routing_status: RoutingStatus | null;
  schema_report_url: string | null;
  survey_url: string;
  readiness: { total_score: number | null; scores_json: unknown; report_url: string | null } | null;
  bdr: Record<string, unknown> | null;
  enrichment: Record<string, unknown> | null;
  stage: string;
  contacts: { name: string | null; email: string | null; is_primary: boolean }[];
  outreach: Record<string, unknown>[];
  closing: { closed_at: string | null; value_cents: number | null; products: unknown; notes: string | null } | null;
};

type Row = {
  deal_id: string;
  organization_id: string;
  name: string;
  domain: string | null;
  website: string | null;
  source: string | null;
  lead_score: number | null;
  scored_at: string | null;
  routing_status: string | null;
  contact_name: string | null;
  contact_email: string | null;
  bdr_json: string | null;
  enrich_json: string | null;
  stage: string;
  closed_at: number | null;
  value_cents: number | null;
  won_json: string | null;
  a_total: number | null;
  a_scores: string | null;
  a_report: string | null;
};

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Read-only. Deals with the given routing status, newest score first. */
export async function exportLeads(
  sql: Sql,
  input: { status?: string | null; since?: string | null; checkOrigin?: string },
): Promise<ExportedLead[] | { error: string }> {
  const raw = input.status?.trim() || "ready_for_outbound";
  const won = raw === "won";
  const status = won ? null : routingStatusOf(raw);
  if (!won && !status) return { error: "status must be ready_for_outbound, enriched, nurture, scoring_error, or won." };
  const params: unknown[] = won ? [] : [status];
  const where = won
    ? "o.archived_at IS NULL AND d.stage = 'won'"
    : "o.archived_at IS NULL AND d.stage NOT IN ('won', 'lost') AND d.routing_status = ?";
  let sinceClause = "";
  if (input.since?.trim()) {
    const parsed = Date.parse(input.since.trim());
    if (!Number.isFinite(parsed)) return { error: "since must be an ISO date." };
    sinceClause = won ? "AND d.closed_at >= ?" : "AND d.scored_at >= ?";
    params.push(won ? parsed : new Date(parsed).toISOString());
  }
  const hasScans = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'readiness_scans'",
  );
  const rows = await sql.all<Row & { scan_token?: string | null }>(
    `SELECT d.id AS deal_id, o.id AS organization_id, o.name, o.domain, o.website, d.source,
            d.lead_score, d.scored_at, d.routing_status, d.stage, d.closed_at, d.value_cents,
            (SELECT data_json FROM activities a WHERE a.deal_id = d.id AND a.kind = 'deal.won'
              ORDER BY created_at DESC LIMIT 1) AS won_json,
            (SELECT name FROM contacts c WHERE c.organization_id = o.id ORDER BY is_primary DESC, created_at LIMIT 1) AS contact_name,
            (SELECT email FROM contacts c WHERE c.organization_id = o.id ORDER BY is_primary DESC, created_at LIMIT 1) AS contact_email,
            (SELECT data_json FROM activities a WHERE a.organization_id = o.id AND a.kind = 'lead.prospected'
              ORDER BY created_at DESC LIMIT 1) AS bdr_json,
            (SELECT data_json FROM activities a WHERE a.deal_id = d.id AND a.kind = 'lead.enriched'
              ORDER BY created_at DESC LIMIT 1) AS enrich_json,
            (SELECT total_score FROM assessments s WHERE s.organization_id = o.id ORDER BY completed_at DESC LIMIT 1) AS a_total,
            (SELECT scores_json FROM assessments s WHERE s.organization_id = o.id ORDER BY completed_at DESC LIMIT 1) AS a_scores,
            (SELECT report_url FROM assessments s WHERE s.organization_id = o.id ORDER BY completed_at DESC LIMIT 1) AS a_report
            ${hasScans ? `, (SELECT public_token FROM readiness_scans r WHERE r.status = 'complete'
                AND (r.organization_id = o.id OR r.domain = o.domain)
                ORDER BY COALESCE(r.completed_at, r.created_at) DESC LIMIT 1) AS scan_token` : ""}
     FROM deals d JOIN organizations o ON o.id = d.organization_id
     WHERE ${where} ${sinceClause}
     ORDER BY ${won ? "d.closed_at" : "d.scored_at"} DESC
     LIMIT 500`,
    params,
  );
  const origin = input.checkOrigin || CHECK_ORIGIN;
  const extras = new Map<string, { contacts: ExportedLead["contacts"]; outreach: Record<string, unknown>[] }>();
  for (const row of rows) {
    const contacts = await sql.all<{ name: string | null; email: string | null; is_primary: number }>(
      "SELECT name, email, is_primary FROM contacts WHERE organization_id = ? ORDER BY is_primary DESC, created_at",
      [row.organization_id],
    );
    const sent = await sql.all<{ data_json: string | null }>(
      "SELECT data_json FROM activities WHERE deal_id = ? AND kind = 'lead.contacted' ORDER BY created_at",
      [row.deal_id],
    );
    extras.set(row.deal_id, {
      contacts: contacts.map((c) => ({ name: c.name, email: c.email, is_primary: c.is_primary === 1 })),
      outreach: sent.map((a) => (parse(a.data_json) ?? {}) as Record<string, unknown>),
    });
  }
  return rows.map((row) => {
    const bdr = (parse(row.bdr_json) ?? {}) as Record<string, unknown>;
    const str = (value: unknown) => (typeof value === "string" ? value : null);
    const hasReadiness = row.a_total != null || row.a_scores != null || row.a_report != null;
    return {
      deal_id: row.deal_id,
      organization_id: row.organization_id,
      name: row.name,
      domain: row.domain,
      website: row.website,
      industry: str(bdr.industry),
      location: str(bdr.location),
      primary_contact:
        row.contact_name || row.contact_email
          ? { name: row.contact_name, email: row.contact_email, title: str(bdr.contact_title) }
          : null,
      source: row.source,
      lead_score: row.lead_score,
      schema_score: row.lead_score,
      scored_at: row.scored_at,
      routing_status: routingStatusOf(row.routing_status),
      schema_report_url: row.scan_token ? `${origin}/scan/${row.scan_token}` : null,
      survey_url: surveyUrl(row.deal_id, origin),
      readiness: hasReadiness
        ? { total_score: row.a_total, scores_json: parse(row.a_scores), report_url: row.a_report }
        : null,
      bdr: row.bdr_json ? bdr : null,
      enrichment: (parse(row.enrich_json) as Record<string, unknown> | null) ?? null,
      stage: row.stage,
      contacts: extras.get(row.deal_id)?.contacts ?? [],
      outreach: extras.get(row.deal_id)?.outreach ?? [],
      closing:
        row.stage === "won"
          ? (() => {
              const w = (parse(row.won_json) ?? {}) as Record<string, unknown>;
              return {
                closed_at: row.closed_at == null ? null : new Date(row.closed_at).toISOString(),
                value_cents: row.value_cents,
                products: w.products ?? null,
                notes: typeof w.notes === "string" ? w.notes : null,
              };
            })()
          : null,
    };
  });
}
