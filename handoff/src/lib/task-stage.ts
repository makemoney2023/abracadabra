import type { Sql } from "@/db/sql";
import type { WakeReason } from "@/lib/agent-wake";
import { scheduleTaskSwarm } from "@/lib/client-workflows";
import { defaultBuildDeps, startBuild, type BuildDeps, type GateReason } from "@/lib/cursor-build";

export const TASK_COLUMNS = ["describe", "engineer", "build", "run", "done"] as const;
export type TaskColumn = (typeof TASK_COLUMNS)[number];

type TaskMoveRow = {
  id: string;
  organization_id: string | null;
  project_id: string | null;
  stage: string;
  status: string;
  position: number;
};

export type MoveTaskInput = {
  taskId: string;
  to?: TaskColumn;
  direction?: "up" | "down";
  position?: number;
  blockedReason?: string;
  now: number;
  actor: { kind: "staff" | "agent"; id: string };
  build?: BuildDeps;
  wake?: (organizationId: string, reason: WakeReason) => Promise<unknown>;
};

export type MoveTaskResult =
  | {
      ok: true;
      taskId: string;
      column: TaskColumn;
      stage: string;
      status: string;
      waiting?: "cap_reached";
      runId?: string;
      workflowId?: string | null;
    }
  | { ok: false; error: "missing" | "invalid" | GateReason };

function columnOf(task: { status: string; stage: string }): TaskColumn {
  if (task.status === "done") return "done";
  if (task.stage === "engineer" || task.stage === "build" || task.stage === "run" || task.stage === "describe") {
    return task.stage;
  }
  return "describe";
}

function isColumn(value: string | undefined): value is TaskColumn {
  return value === "describe" || value === "engineer" || value === "build" || value === "run" || value === "done";
}

/** Next position at the end of one column for one project. */
export async function nextColumnPosition(
  sql: Sql,
  input: { organizationId: string | null; projectId: string | null; column: string },
): Promise<number> {
  const row = await sql.get<{ next: number | null }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tasks
     WHERE ifnull(organization_id, '') = ifnull(?, '')
       AND ifnull(project_id, '') = ifnull(?, '')
       AND (
         (? = 'done' AND status = 'done')
         OR (? != 'done' AND stage = ? AND status != 'done')
       )`,
    [input.organizationId, input.projectId, input.column, input.column, input.column],
  );
  return Number(row?.next ?? 0);
}

async function columnMates(sql: Sql, task: TaskMoveRow, column: TaskColumn): Promise<{ id: string }[]> {
  return sql.all<{ id: string }>(
    `SELECT id FROM tasks
     WHERE ifnull(organization_id, '') = ifnull(?, '')
       AND ifnull(project_id, '') = ifnull(?, '')
       AND (
         (? = 'done' AND status = 'done')
         OR (? != 'done' AND stage = ? AND status != 'done')
       )
     ORDER BY position, created_at, id`,
    [task.organization_id, task.project_id, column, column, column],
  );
}

async function writePositions(sql: Sql, ids: string[], now: number): Promise<void> {
  for (let index = 0; index < ids.length; index += 1) {
    await sql.run("UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?", [index, now, ids[index]]);
  }
}

function inputBody(column: TaskColumn): string {
  return `Moved to ${column}.`;
}

async function logMove(
  sql: Sql,
  task: TaskMoveRow,
  column: TaskColumn,
  body: string,
  now: number,
  actor: { kind: "staff" | "agent"; id: string },
): Promise<void> {
  if (!task.organization_id || !actor.id) return;
  const kind = actor.kind === "staff" ? "staff.task_stage" : "agent.task_stage";
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      task.organization_id,
      task.project_id,
      kind,
      actor.kind,
      actor.id,
      body,
      JSON.stringify({ taskId: task.id, stage: column }),
      now,
    ],
  );
}

/** One stage move for the board, staff chat, and the agent. Build and run keep their gates. */
export async function moveTaskStage(sql: Sql, input: MoveTaskInput): Promise<MoveTaskResult> {
  const task = await sql.get<TaskMoveRow>(
    "SELECT id, organization_id, project_id, stage, status, position FROM tasks WHERE id = ?",
    [input.taskId],
  );
  if (!task) return { ok: false, error: "missing" };
  if (input.blockedReason !== undefined) {
    const reason = input.blockedReason.trim();
    if (!reason) return { ok: false, error: "invalid" };
    await sql.run("UPDATE tasks SET status = 'blocked', blocked_reason = ?, updated_at = ? WHERE id = ?", [
      reason,
      input.now,
      task.id,
    ]);
    await logMove(sql, task, columnOf(task), reason, input.now, input.actor);
    return { ok: true, taskId: task.id, column: columnOf(task), stage: task.stage, status: "blocked" };
  }
  if (input.direction) {
    return reorder(sql, task, input.direction, input.now, input.actor);
  }
  if (!isColumn(input.to)) return { ok: false, error: "invalid" };
  const current = columnOf(task);
  if (input.to === "build") return moveToBuild(sql, task, input);
  if (input.to === "run") return moveToRun(sql, task, input);
  if (input.to === "done") return moveToDone(sql, task, input);
  return moveToStage(sql, task, input.to, current, input);
}

async function reorder(
  sql: Sql,
  task: TaskMoveRow,
  direction: "up" | "down",
  now: number,
  actor: { kind: "staff" | "agent"; id: string },
): Promise<MoveTaskResult> {
  const column = columnOf(task);
  const mates = await columnMates(sql, task, column);
  const ids = mates.map((row) => row.id);
  const index = ids.indexOf(task.id);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index >= 0 && swap >= 0 && swap < ids.length) {
    const current = ids[index];
    const neighbor = ids[swap];
    if (current && neighbor) {
      ids[index] = neighbor;
      ids[swap] = current;
    }
  }
  await writePositions(sql, ids, now);
  await logMove(sql, task, column, direction === "up" ? "Moved up." : "Moved down.", now, actor);
  return { ok: true, taskId: task.id, column, stage: task.stage, status: task.status };
}

async function place(
  sql: Sql,
  task: TaskMoveRow,
  column: TaskColumn,
  input: MoveTaskInput,
): Promise<number> {
  if (input.position !== undefined && Number.isInteger(input.position)) return input.position;
  if (columnOf(task) === column) return task.position;
  return nextColumnPosition(sql, { organizationId: task.organization_id, projectId: task.project_id, column });
}

async function moveToStage(
  sql: Sql,
  task: TaskMoveRow,
  column: "describe" | "engineer",
  current: TaskColumn,
  input: MoveTaskInput,
): Promise<MoveTaskResult> {
  if (current === column && input.position === undefined) {
    return { ok: true, taskId: task.id, column, stage: task.stage, status: task.status };
  }
  const position = await place(sql, task, column, input);
  const status = task.status === "blocked" || task.status === "done" ? "todo" : task.status;
  await sql.run(
    `UPDATE tasks
     SET stage = ?, status = ?, blocked_reason = NULL, done_at = NULL, position = ?, updated_at = ?
     WHERE id = ?`,
    [column, status, position, input.now, task.id],
  );
  await logMove(sql, task, column, inputBody(column), input.now, input.actor);
  return { ok: true, taskId: task.id, column, stage: column, status };
}

async function moveToDone(sql: Sql, task: TaskMoveRow, input: MoveTaskInput): Promise<MoveTaskResult> {
  if (task.status === "done" && input.position === undefined) {
    return { ok: true, taskId: task.id, column: "done", stage: task.stage, status: "done" };
  }
  const position = await place(sql, task, "done", input);
  await sql.run(
    `UPDATE tasks
     SET status = 'done', done_at = ?, blocked_reason = NULL, position = ?, updated_at = ?
     WHERE id = ?`,
    [input.now, position, input.now, task.id],
  );
  await logMove(sql, task, "done", inputBody("done"), input.now, input.actor);
  return { ok: true, taskId: task.id, column: "done", stage: task.stage, status: "done" };
}

async function moveToBuild(sql: Sql, task: TaskMoveRow, input: MoveTaskInput): Promise<MoveTaskResult> {
  const built = await startBuild(sql, task.id, input.build ?? defaultBuildDeps(input.now));
  if (!built.ok) {
    await sql.run("UPDATE tasks SET stage = ? WHERE id = ?", [task.stage, task.id]);
    return { ok: false, error: built.reason };
  }
  const position = await place(sql, task, "build", input);
  await sql.run("UPDATE tasks SET position = ? WHERE id = ?", [position, task.id]);
  if (built.action === "waiting") {
    await logMove(sql, task, "build", "Waiting for a free cloud run.", input.now, input.actor);
    return { ok: true, taskId: task.id, column: "build", stage: "build", status: "todo", waiting: "cap_reached" };
  }
  await logMove(sql, task, "build", inputBody("build"), input.now, input.actor);
  return {
    ok: true,
    taskId: task.id,
    column: "build",
    stage: "build",
    status: "doing",
    runId: built.runId,
  };
}

async function moveToRun(sql: Sql, task: TaskMoveRow, input: MoveTaskInput): Promise<MoveTaskResult> {
  const position = await place(sql, task, "run", input);
  const status = task.status === "blocked" || task.status === "done" ? "todo" : task.status;
  await sql.run(
    `UPDATE tasks
     SET stage = 'run', status = ?, blocked_reason = NULL, done_at = NULL, position = ?, updated_at = ?
     WHERE id = ?`,
    [status === "done" ? "todo" : status, position, input.now, task.id],
  );
  const scheduled = await scheduleTaskSwarm(sql, { taskId: task.id, now: input.now });
  if (!scheduled.ok) return { ok: false, error: "missing" };
  if (!scheduled.none) await input.wake?.(scheduled.organizationId, "due");
  await logMove(sql, task, "run", inputBody("run"), input.now, input.actor);
  return {
    ok: true,
    taskId: task.id,
    column: "run",
    stage: "run",
    status: status === "done" ? "todo" : status,
    workflowId: scheduled.none ? null : scheduled.workflowId,
  };
}
