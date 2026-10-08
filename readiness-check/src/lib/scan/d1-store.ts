import { nanoid } from "nanoid";
import type { BoundSql } from "@/lib/cloudflare/sql";
import { PUBLIC_SCAN_LIMIT } from "@/lib/rate-limit";
import type {
  ScanFindingRecord,
  ScanPageRecord,
  ScanRecord,
  ScanRepository,
} from "@/lib/scan/repository";

const WINDOW_MS = 24 * 60 * 60 * 1000;

type ScanRow = {
  id: string;
  domain: string;
  origin: string;
  source: "public" | "ops";
  status: "queued" | "running" | "complete" | "failed";
  organization_id: string | null;
  score_total: number | null;
  score_breakdown_json: string | null;
  error_message: string | null;
  public_token: string;
};

type PageRow = {
  url: string;
  page_type: string;
  fetch_status: string;
  has_json_ld: number;
  schema_types_json: string;
  evidence_json: string;
};

type FindingRow = {
  code: string;
  severity: string;
  passed: number;
  message: string;
  page_url: string | null;
  evidence_json: string;
};

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapPage(row: PageRow): ScanPageRecord {
  const types = parseJson(row.schema_types_json);
  return {
    url: row.url,
    pageType: row.page_type,
    fetchStatus: row.fetch_status,
    hasJsonLd: row.has_json_ld === 1,
    schemaTypes: Array.isArray(types) ? types.filter((item) => typeof item === "string") : [],
    evidence: asRecord(parseJson(row.evidence_json)),
  };
}

function mapFinding(row: FindingRow): ScanFindingRecord {
  const evidence = asRecord(parseJson(row.evidence_json));
  return {
    code: row.code,
    severity: row.severity,
    passed: row.passed === 1,
    message: row.message,
    pageUrl: row.page_url ?? undefined,
    evidence,
  };
}

async function contactCount(db: BoundSql, organizationId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM contacts
       WHERE organization_id = ? AND email IS NOT NULL AND trim(email) != ''`,
    )
    .bind(organizationId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

async function readScan(db: BoundSql, scanId: string): Promise<ScanRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, domain, origin, source, status, organization_id, score_total,
              score_breakdown_json, error_message, public_token
       FROM readiness_scans WHERE id = ?`,
    )
    .bind(scanId)
    .first<ScanRow>();
  if (!row) return null;
  const hasContact = row.organization_id ? (await contactCount(db, row.organization_id)) > 0 : undefined;
  return {
    id: row.id,
    domain: row.domain,
    origin: row.origin,
    source: row.source,
    status: row.status,
    leadId: row.organization_id,
    hasContact,
    scoreTotal: row.score_total,
    scoreBreakdown: parseJson(row.score_breakdown_json),
    errorMessage: row.error_message,
  };
}

async function noteScan(db: BoundSql, scanId: string, status: "complete" | "failed", now: number, error?: string): Promise<void> {
  const row = await db
    .prepare("SELECT organization_id, domain, score_total, public_token FROM readiness_scans WHERE id = ?")
    .bind(scanId)
    .first<{ organization_id: string | null; domain: string; score_total: number | null; public_token: string | null }>();
  if (!row?.organization_id) return;
  const body =
    status === "complete"
      ? `Schema scan finished for ${row.domain}. Score ${row.score_total ?? "none"}.`
      : `Schema scan failed for ${row.domain}. ${(error ?? "The scan failed.").slice(0, 300)}`;
  await db
    .prepare(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
       VALUES (?, ?, 'schema.scan', 'system', 'schema', ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      row.organization_id,
      body,
      JSON.stringify({ scanId, status, domain: row.domain, score: row.score_total, publicToken: row.public_token }),
      now,
    )
    .run();
}

export async function countRecentPublicScansOnD1(
  db: BoundSql,
  domain: string,
  now = Date.now(),
): Promise<{ allowed: boolean; count: number }> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM readiness_scans
       WHERE domain = ? AND source = 'public' AND organization_id IS NULL AND created_at >= ?`,
    )
    .bind(domain, now - WINDOW_MS)
    .first<{ n: number }>();
  const count = Number(row?.n ?? 0);
  return { allowed: count < PUBLIC_SCAN_LIMIT, count };
}

export async function insertScan(
  db: BoundSql,
  input: {
    domain: string;
    origin: string;
    source: "public" | "ops";
    organizationId?: string | null;
    now?: number;
  },
): Promise<{ id: string; token: string; status: "queued" }> {
  const id = crypto.randomUUID();
  const token = nanoid(24);
  const now = input.now ?? Date.now();
  await db
    .prepare(
      `INSERT INTO readiness_scans
        (id, public_token, domain, origin, source, status, organization_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
    )
    .bind(id, token, input.domain, input.origin, input.source, input.organizationId ?? null, now)
    .run();
  return { id, token, status: "queued" };
}

export async function deleteScan(db: BoundSql, scanId: string): Promise<void> {
  await db.prepare("DELETE FROM readiness_scan_findings WHERE scan_id = ?").bind(scanId).run();
  await db.prepare("DELETE FROM readiness_scan_pages WHERE scan_id = ?").bind(scanId).run();
  await db.prepare("DELETE FROM readiness_scans WHERE id = ?").bind(scanId).run();
}

export async function loadScanByPublicToken(db: BoundSql, token: string) {
  const scan = await db
    .prepare(
      `SELECT id, domain, origin, source, status, score_total, score_breakdown_json, public_token
       FROM readiness_scans WHERE public_token = ?`,
    )
    .bind(token)
    .first<{
      id: string;
      domain: string;
      origin: string;
      source: string;
      status: string;
      score_total: number | null;
      score_breakdown_json: string | null;
      public_token: string;
    }>();
  if (!scan) return null;

  const pages = await db
    .prepare(
      `SELECT url, page_type, fetch_status, has_json_ld, schema_types_json, evidence_json
       FROM readiness_scan_pages WHERE scan_id = ?`,
    )
    .bind(scan.id)
    .all<PageRow>();
  const findings = await db
    .prepare(
      `SELECT code, severity, passed, message, page_url, evidence_json
       FROM readiness_scan_findings WHERE scan_id = ?`,
    )
    .bind(scan.id)
    .all<FindingRow>();

  return {
    scan: {
      id: scan.id,
      domain: scan.domain,
      origin: scan.origin,
      source: scan.source,
      status: scan.status,
      score_total: scan.score_total,
      score_breakdown: parseJson(scan.score_breakdown_json),
      public_token: scan.public_token,
    },
    pages: (pages.results ?? []).map(mapPage),
    findings: (findings.results ?? []).map(mapFinding),
  };
}

export function createD1ScanRepository(db: BoundSql): ScanRepository {
  return {
    getScan(scanId) {
      return readScan(db, scanId);
    },

    async markRunning(scanId) {
      await db
        .prepare("UPDATE readiness_scans SET status = 'running', error_message = NULL WHERE id = ?")
        .bind(scanId)
        .run();
    },

    async savePages(scanId, pages: ScanPageRecord[]) {
      await db.prepare("DELETE FROM readiness_scan_pages WHERE scan_id = ?").bind(scanId).run();
      for (const page of pages) {
        await db
          .prepare(
            `INSERT INTO readiness_scan_pages
              (id, scan_id, url, page_type, fetch_status, has_json_ld, schema_types_json, evidence_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            scanId,
            page.url,
            page.pageType,
            page.fetchStatus,
            page.hasJsonLd ? 1 : 0,
            JSON.stringify(page.schemaTypes),
            JSON.stringify(page.evidence ?? {}),
          )
          .run();
      }
    },

    async saveFindings(scanId, findings: ScanFindingRecord[]) {
      await db.prepare("DELETE FROM readiness_scan_findings WHERE scan_id = ?").bind(scanId).run();
      for (const finding of findings) {
        const evidence = { ...(finding.evidence ?? {}) };
        if (finding.pageUrl) evidence.page_url = finding.pageUrl;
        await db
          .prepare(
            `INSERT INTO readiness_scan_findings
              (id, scan_id, page_url, code, severity, passed, message, evidence_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            scanId,
            finding.pageUrl ?? null,
            finding.code,
            finding.severity,
            finding.passed ? 1 : 0,
            finding.message,
            JSON.stringify(evidence),
          )
          .run();
      }
    },

    async markComplete(scanId, scoreTotal, scoreBreakdown) {
      const finished = Date.now();
      await db
        .prepare(
          `UPDATE readiness_scans
           SET status = 'complete', score_total = ?, score_breakdown_json = ?,
               error_message = NULL, completed_at = ?
           WHERE id = ?`,
        )
        .bind(scoreTotal, JSON.stringify(scoreBreakdown), finished, scanId)
        .run();
      await noteScan(db, scanId, "complete", finished);
    },

    async markFailed(scanId, errorMessage) {
      const current = await db
        .prepare("SELECT status FROM readiness_scans WHERE id = ?")
        .bind(scanId)
        .first<{ status: string }>();
      if (current?.status === "complete") return;
      const finished = Date.now();
      await db
        .prepare(
          `UPDATE readiness_scans
           SET status = 'failed', error_message = ?, completed_at = ?
           WHERE id = ?`,
        )
        .bind(errorMessage, finished, scanId)
        .run();
      await noteScan(db, scanId, "failed", finished, errorMessage);
    },

    async upsertOpsQueue(input) {
      const nextStep = input.missingContact
        ? `Review scan ${input.scanId}. No email on file. Priority ${input.priorityScore}.`
        : `Review scan ${input.scanId}. Priority ${input.priorityScore}.`;
      const now = Date.now();
      const existing = await db
        .prepare("SELECT id FROM deals WHERE organization_id = ? AND stage = 'new' LIMIT 1")
        .bind(input.leadId)
        .first<{ id: string }>();
      if (existing) {
        await db
          .prepare("UPDATE deals SET next_step = ?, updated_at = ? WHERE id = ?")
          .bind(nextStep, now, existing.id)
          .run();
        return;
      }
      await db
        .prepare(
          `INSERT INTO deals (id, organization_id, title, stage, source, next_step, created_at, updated_at)
           VALUES (?, ?, 'Follow up', 'new', 'ai_search', ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), input.leadId, nextStep, now, now)
        .run();
    },
  };
}
