import type { Sql } from "@/db/sql";
import { purgeWorkspace } from "@/lib/retention";
import type { ObjectStore } from "@/lib/store/objects";

/** Purges archived workspaces whose purge date has arrived. A failed delete stays archived. */
export async function purgeDueWorkspaces(sql: Sql, store: ObjectStore, now: number): Promise<number> {
  const rows = await sql.all<{ id: string }>(
    `SELECT id FROM workspaces
     WHERE status = 'archived' AND purged_at IS NULL AND purge_after IS NOT NULL AND purge_after <= ?`,
    [now],
  );
  let purged = 0;
  for (const row of rows) {
    try {
      const result = await purgeWorkspace({
        sql,
        caller: null,
        store,
        workspaceId: row.id,
        reason: null,
        now,
      });
      if (result.ok) purged += 1;
    } catch {
      // Object deletion failed. The workspace stays archived for the next pass.
    }
  }
  return purged;
}
