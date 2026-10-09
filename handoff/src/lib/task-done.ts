import type { Sql } from "@/db/sql";
import { nextColumnPosition } from "@/lib/task-position";

/** Marks one card done and records the move. A card that is already done stays done. */
export async function markTaskDone(
  sql: Sql,
  input: { taskId: string; now: number; actor: { kind: "staff" | "agent"; id: string } },
): Promise<boolean> {
  const task = await sql.get<{
    id: string;
    organization_id: string | null;
    project_id: string | null;
    status: string;
  }>("SELECT id, organization_id, project_id, status FROM tasks WHERE id = ?", [input.taskId]);
  if (!task) return false;
  if (task.status === "done") return true;
  const position = await nextColumnPosition(sql, {
    organizationId: task.organization_id,
    projectId: task.project_id,
    column: "done",
  });
  await sql.run(
    `UPDATE tasks
     SET status = 'done', done_at = ?, blocked_reason = NULL, position = ?, updated_at = ?
     WHERE id = ?`,
    [input.now, position, input.now, task.id],
  );
  if (task.organization_id && input.actor.id) {
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        task.organization_id,
        task.project_id,
        input.actor.kind === "staff" ? "staff.task_stage" : "agent.task_stage",
        input.actor.kind,
        input.actor.id,
        "Moved to done.",
        JSON.stringify({ taskId: task.id, stage: "done" }),
        input.now,
      ],
    );
  }
  return true;
}
