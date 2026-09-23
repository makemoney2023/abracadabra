import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ScanFindingRecord,
  ScanPageRecord,
  ScanRecord,
  ScanRepository,
} from "./repository";

type DbScanRow = {
  id: string;
  domain: string;
  origin: string;
  source: "public" | "ops";
  status: "queued" | "running" | "complete" | "failed";
  lead_id: string | null;
  score_total: number | null;
  score_breakdown: unknown;
  error_message: string | null;
  public_token?: string;
};

function mapScanRow(row: DbScanRow, hasContact?: boolean): ScanRecord {
  return {
    id: row.id,
    domain: row.domain,
    origin: row.origin,
    source: row.source,
    status: row.status,
    leadId: row.lead_id,
    hasContact,
    scoreTotal: row.score_total,
    scoreBreakdown: row.score_breakdown,
    errorMessage: row.error_message,
  };
}

export function createSupabaseScanRepository(
  client: ReturnType<typeof createAdminClient> = createAdminClient(),
): ScanRepository {
  return {
    async getScan(scanId) {
      const { data, error } = await client
        .from("scans")
        .select(
          "id, domain, origin, source, status, lead_id, score_total, score_breakdown, error_message, public_token",
        )
        .eq("id", scanId)
        .maybeSingle();

      if (error) throw new Error(`getScan failed: ${error.message}`);
      if (!data) return null;

      let hasContact: boolean | undefined;
      if (data.lead_id) {
        const { count, error: contactError } = await client
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("lead_id", data.lead_id);
        if (contactError) throw new Error(`getScan contacts failed: ${contactError.message}`);
        hasContact = (count ?? 0) > 0;
      }

      return mapScanRow(data as DbScanRow, hasContact);
    },

    async markRunning(scanId) {
      const { error } = await client
        .from("scans")
        .update({ status: "running", error_message: null })
        .eq("id", scanId);
      if (error) throw new Error(`markRunning failed: ${error.message}`);
    },

    async savePages(scanId, pages: ScanPageRecord[]) {
      const { error: deleteError } = await client.from("scan_pages").delete().eq("scan_id", scanId);
      if (deleteError) throw new Error(`savePages delete failed: ${deleteError.message}`);

      if (pages.length === 0) return;

      const rows = pages.map((p) => ({
        scan_id: scanId,
        url: p.url,
        page_type: p.pageType,
        fetch_status: p.fetchStatus,
        has_json_ld: p.hasJsonLd,
        schema_types: p.schemaTypes,
        evidence: p.evidence ?? {},
      }));

      const { error } = await client.from("scan_pages").insert(rows);
      if (error) throw new Error(`savePages insert failed: ${error.message}`);
    },

    async saveFindings(scanId, findings: ScanFindingRecord[]) {
      const { error: deleteError } = await client
        .from("scan_findings")
        .delete()
        .eq("scan_id", scanId);
      if (deleteError) throw new Error(`saveFindings delete failed: ${deleteError.message}`);

      if (findings.length === 0) return;

      const { data: pageRows, error: pagesError } = await client
        .from("scan_pages")
        .select("id, url")
        .eq("scan_id", scanId);
      if (pagesError) throw new Error(`saveFindings pages lookup failed: ${pagesError.message}`);

      const pageIdByUrl = new Map<string, string>(
        (pageRows ?? []).map((p: { id: string; url: string }) => [p.url, p.id]),
      );

      const rows = findings.map((f) => {
        const evidence: Record<string, unknown> = { ...(f.evidence ?? {}) };
        if (f.pageUrl) evidence.page_url = f.pageUrl;
        return {
          scan_id: scanId,
          page_id: f.pageUrl ? (pageIdByUrl.get(f.pageUrl) ?? null) : null,
          code: f.code,
          severity: f.severity,
          passed: f.passed,
          message: f.message,
          evidence,
        };
      });

      const { error } = await client.from("scan_findings").insert(rows);
      if (error) throw new Error(`saveFindings insert failed: ${error.message}`);
    },

    async markComplete(scanId, scoreTotal, scoreBreakdown) {
      const { error } = await client
        .from("scans")
        .update({
          status: "complete",
          score_total: scoreTotal,
          score_breakdown: scoreBreakdown,
          error_message: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", scanId);
      if (error) throw new Error(`markComplete failed: ${error.message}`);
    },

    async markFailed(scanId, errorMessage) {
      const { error } = await client
        .from("scans")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", scanId);
      if (error) throw new Error(`markFailed failed: ${error.message}`);
    },

    async upsertOpsQueue(input) {
      const { error } = await client.from("ops_queue").upsert(
        {
          lead_id: input.leadId,
          latest_scan_id: input.scanId,
          priority_score: input.priorityScore,
          missing_contact: input.missingContact,
        },
        { onConflict: "lead_id" },
      );
      if (error) throw new Error(`upsertOpsQueue failed: ${error.message}`);
    },
  };
}

export type ScanDetailRow = {
  id: string;
  domain: string;
  origin: string;
  status: string;
  score_total: number | null;
  score_breakdown: unknown;
  public_token: string;
};

/** Load a scan and related pages/findings by public token (service role). */
export async function loadScanByPublicToken(
  token: string,
  client: ReturnType<typeof createAdminClient> = createAdminClient(),
): Promise<{
  scan: ScanDetailRow;
  pages: ScanPageRecord[];
  findings: ScanFindingRecord[];
} | null> {
  const { data: scan, error } = await client
    .from("scans")
    .select("id, domain, origin, status, score_total, score_breakdown, public_token")
    .eq("public_token", token)
    .maybeSingle();

  if (error) throw new Error(`loadScanByPublicToken failed: ${error.message}`);
  if (!scan) return null;

  const { data: pageRows, error: pagesError } = await client
    .from("scan_pages")
    .select("url, page_type, fetch_status, has_json_ld, schema_types, evidence")
    .eq("scan_id", scan.id);
  if (pagesError) throw new Error(`loadScan pages failed: ${pagesError.message}`);

  const { data: findingRows, error: findingsError } = await client
    .from("scan_findings")
    .select("code, severity, passed, message, evidence")
    .eq("scan_id", scan.id);
  if (findingsError) throw new Error(`loadScan findings failed: ${findingsError.message}`);

  const pages: ScanPageRecord[] = (pageRows ?? []).map(
    (p: {
      url: string;
      page_type: string;
      fetch_status: string;
      has_json_ld: boolean;
      schema_types: string[] | null;
      evidence: Record<string, unknown> | null;
    }) => ({
      url: p.url,
      pageType: p.page_type,
      fetchStatus: p.fetch_status,
      hasJsonLd: p.has_json_ld,
      schemaTypes: p.schema_types ?? [],
      evidence: p.evidence ?? {},
    }),
  );

  const findings: ScanFindingRecord[] = (findingRows ?? []).map(
    (f: {
      code: string;
      severity: string;
      passed: boolean;
      message: string;
      evidence: Record<string, unknown> | null;
    }) => {
      const evidence = f.evidence ?? {};
      const pageUrl =
        typeof evidence.page_url === "string" ? evidence.page_url : undefined;
      return {
        code: f.code,
        severity: f.severity,
        passed: f.passed,
        message: f.message,
        pageUrl,
        evidence,
      };
    },
  );

  return { scan: scan as ScanDetailRow, pages, findings };
}
