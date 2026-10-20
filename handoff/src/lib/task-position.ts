import type { Sql } from "@/db/sql";
import { COLUMN_SQL } from "@/lib/board-model";

/** Next position at the end of one column for one project. */
export async function nextColumnPosition(
  sql: Sql,
  input: { organizationId: string | null; projectId: string | null; column: string },
): Promise<number> {
  const row = await sql.get<{ next: number | null }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tasks
     WHERE ifnull(organization_id, '') = ifnull(?, '')
       AND ifnull(project_id, '') = ifnull(?, '')
       AND ${COLUMN_SQL}`,
    [input.organizationId, input.projectId, input.column, input.column, input.column],
  );
  return Number(row?.next ?? 0);
}
