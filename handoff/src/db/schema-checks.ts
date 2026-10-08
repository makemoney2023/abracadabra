import { schemaScanReport, type SchemaReportFinding, type SchemaReportPage, type SchemaScanReport } from "@/lib/schema-report";
import type { Sql } from "./sql";

export type SchemaCheckRow = {
  id: string;
  objective: string;
  status: string;
  error_message: string | null;
  created_at: number;
};

export type SchemaSiteRow = {
  id: string;
  domain: string;
  name: string | null;
  website: string | null;
  verdict: string;
  answer: string | null;
  organization_id: string | null;
  contacts_json: string;
  scan_id: string | null;
};

export async function recentSchemaChecks(sql: Sql): Promise<SchemaCheckRow[]> {
  return sql.all<SchemaCheckRow>(
    `SELECT id, objective, status, error_message, created_at
     FROM schema_checks ORDER BY created_at DESC LIMIT 20`,
  );
}

export async function schemaCheckSites(sql: Sql, checkId: string): Promise<SchemaSiteRow[]> {
  return sql.all<SchemaSiteRow>(
    `SELECT id, domain, name, website, verdict, answer, organization_id, contacts_json, scan_id
     FROM schema_check_sites WHERE check_id = ? ORDER BY domain`,
    [checkId],
  );
}

function jsonList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function jsonObject(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function schemaReportsFor(sql: Sql, scanIds: string[]): Promise<Map<string, SchemaScanReport>> {
  const reports = new Map<string, SchemaScanReport>();
  for (const scanId of scanIds) {
    const scan = await sql.get<{
      status: string;
      score_total: number | null;
      score_breakdown_json: string | null;
      error_message: string | null;
      public_token: string;
    }>(
      `SELECT status, score_total, score_breakdown_json, error_message, public_token
       FROM readiness_scans WHERE id = ?`,
      [scanId],
    );
    if (!scan) continue;
    const pages = await sql.all<{
      url: string;
      page_type: string;
      fetch_status: string;
      has_json_ld: number;
      schema_types_json: string;
    }>(
      `SELECT url, page_type, fetch_status, has_json_ld, schema_types_json
       FROM readiness_scan_pages WHERE scan_id = ?`,
      [scanId],
    );
    const findings = await sql.all<{
      severity: string;
      message: string;
      passed: number;
      page_url: string | null;
    }>(
      `SELECT severity, message, passed, page_url FROM readiness_scan_findings WHERE scan_id = ?`,
      [scanId],
    );
    const pageRows: SchemaReportPage[] = pages.map((page) => ({
      url: page.url,
      pageType: page.page_type,
      fetchStatus: page.fetch_status,
      hasJsonLd: page.has_json_ld === 1,
      schemaTypes: jsonList(page.schema_types_json),
    }));
    const findingRows: SchemaReportFinding[] = findings.map((finding) => ({
      severity: finding.severity,
      message: finding.message,
      passed: finding.passed === 1,
      pageUrl: finding.page_url,
    }));
    reports.set(
      scanId,
      schemaScanReport({
        status: scan.status,
        scoreTotal: scan.score_total,
        scoreBreakdown: jsonObject(scan.score_breakdown_json),
        error: scan.error_message,
        publicToken: scan.public_token,
        pages: pageRows,
        findings: findingRows,
      }),
    );
  }
  return reports;
}

export async function latestSchemaScan(sql: Sql, organizationId: string): Promise<SchemaScanReport | null> {
  const row = await sql.get<{ id: string }>(
    `SELECT id FROM readiness_scans
     WHERE organization_id = ?
     ORDER BY COALESCE(completed_at, created_at) DESC
     LIMIT 1`,
    [organizationId],
  );
  if (!row) return null;
  const reports = await schemaReportsFor(sql, [row.id]);
  return reports.get(row.id) ?? null;
}
