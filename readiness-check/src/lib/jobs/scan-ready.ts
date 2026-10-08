import type { BoundSql, JobQueue } from "@/lib/cloudflare/sql";

/** Tell Handoff a lead's scan finished so the agent can file the pages and fill the blank fields. */
export async function notifyLeadScan(db: BoundSql, queue: JobQueue | undefined, scanId: string): Promise<void> {
  if (!queue) return;
  const row = await db
    .prepare("SELECT organization_id, status FROM readiness_scans WHERE id = ?")
    .bind(scanId)
    .first<{ organization_id: string | null; status: string }>();
  if (!row?.organization_id) return;
  if (row.status !== "complete" && row.status !== "failed") return;
  await queue.send({ source: "scan_ready", organizationId: row.organization_id, scanId, status: row.status });
}
