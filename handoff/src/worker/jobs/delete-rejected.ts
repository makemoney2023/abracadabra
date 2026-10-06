import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import type { ObjectStore } from "@/lib/store/objects";

/** Deletes rejected and failed object bytes after 14 days. The file row and its reason stay. */
export async function deleteExpiredObjects(sql: Sql, store: ObjectStore, now: number): Promise<number> {
  const cutoff = now - LIMITS.rejectedObjectTtlMs;
  const rows = await sql.all<{ id: string; object_key: string }>(
    `SELECT id, object_key FROM files
     WHERE status IN ('rejected', 'failed')
       AND object_deleted_at IS NULL
       AND COALESCE(scanned_at, uploaded_at, created_at) <= ?`,
    [cutoff],
  );
  let deleted = 0;
  for (const row of rows) {
    await store.remove(row.object_key);
    await sql.run(
      "UPDATE files SET object_deleted_at = ? WHERE id = ? AND object_deleted_at IS NULL",
      [now, row.id],
    );
    deleted += 1;
  }
  return deleted;
}
