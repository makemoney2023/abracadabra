import type { Sql } from "@/db/sql";
import { deriveBatchStatus, isBatchActive, type FileStatus } from "@/lib/batches";
import { sendWithResend } from "@/lib/mail";
import { deliverNotifications, markRequestReceived, queueProductEvent } from "@/lib/notifications";
import type { ScanDecision } from "@/lib/scan";

/** After a finished scan, mark a named request received and queue HND-045 mail. */
export async function publishScanOutcome(
  sql: Sql,
  fileId: string,
  decision: ScanDecision,
  now: number,
): Promise<void> {
  if (decision.status === "retry") return;
  if (decision.status === "clean") {
    await markRequestReceived(sql, fileId, now);
  }
  if (decision.status === "rejected" || decision.status === "held") {
    await queueProductEvent(sql, { kind: "file.flagged", fileId, status: decision.status }, now);
  }
  const batch = await sql.get<{
    id: string;
    created_at: number;
    last_activity_at: number;
    discarded_at: number | null;
    deleted_at: number | null;
  }>(
    `SELECT batches.id, batches.created_at, batches.last_activity_at, batches.discarded_at, batches.deleted_at
     FROM files
     JOIN batches ON batches.id = files.batch_id
     WHERE files.id = ?`,
    [fileId],
  );
  if (!batch || batch.deleted_at !== null) return;
  const files = await sql.all<{ status: FileStatus }>("SELECT status FROM files WHERE batch_id = ?", [batch.id]);
  const derived = deriveBatchStatus({
    files,
    active: isBatchActive(new Date(batch.created_at), new Date(batch.last_activity_at), new Date(now)),
    discarded: batch.discarded_at !== null,
  });
  if (derived === "ready") {
    await queueProductEvent(sql, { kind: "batch.ready", batchId: batch.id }, now);
  }
}

/** Delivers queued product mail. A send failure stays inside deliverNotifications. */
export async function flushNotifications(sql: Sql, now: number): Promise<void> {
  const origin = process.env.HANDOFF_APP_ORIGIN?.trim() ?? "";
  await deliverNotifications(sql, sendWithResend, now, origin);
}
