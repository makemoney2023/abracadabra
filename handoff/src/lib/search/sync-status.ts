import type { Sql } from "@/db/sql";

export type SyncRunSummary = { total: number; queued: number; running: number; done: number; failed: number };

/** Sync jobs created in the last 24 hours per property of one organization (staff card). */
export async function recentSyncRuns(sql: Sql, organizationId: string, now = Date.now()): Promise<Record<string, SyncRunSummary>> {
  const rows = await sql.all<{ property_id: string; status: string; n: number }>(
    `SELECT r.property_id, r.status, count(*) AS n
     FROM search_sync_runs r JOIN search_properties p ON p.id = r.property_id
     WHERE p.organization_id = ? AND r.created_at >= ?
     GROUP BY r.property_id, r.status`,
    [organizationId, now - 86_400_000],
  );
  const out: Record<string, SyncRunSummary> = {};
  for (const row of rows) {
    const summary = (out[row.property_id] ??= { total: 0, queued: 0, running: 0, done: 0, failed: 0 });
    summary.total += row.n;
    if (row.status === "queued" || row.status === "running" || row.status === "done" || row.status === "failed") summary[row.status] += row.n;
  }
  return out;
}
