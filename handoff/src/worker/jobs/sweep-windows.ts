import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { queueProductEvent } from "@/lib/notifications";

/** Pending and uploading files in a closed window become failed, and the uploader is mailed once. */
export async function sweepClosedWindows(sql: Sql, now: number): Promise<number> {
  const batches = await sql.all<{ id: string }>(
    `SELECT id FROM batches
     WHERE deleted_at IS NULL
       AND (? - last_activity_at >= ? OR ? - created_at >= ?)`,
    [now, LIMITS.activityWindowMs, now, LIMITS.maxBatchLifeMs],
  );
  let closed = 0;
  for (const batch of batches) {
    const open = await sql.get<{ n: number }>(
      `SELECT count(*) AS n FROM files
       WHERE batch_id = ? AND status IN ('pending', 'uploading')`,
      [batch.id],
    );
    if (!open || Number(open.n) === 0) continue;
    await sql.run(
      `UPDATE files
       SET status = 'failed', scan_reason = ?
       WHERE batch_id = ? AND status IN ('pending', 'uploading')`,
      ["The upload time ran out before this file finished.", batch.id],
    );
    await queueProductEvent(sql, { kind: "batch.window_failed", batchId: batch.id }, now);
    closed += 1;
  }
  return closed;
}
