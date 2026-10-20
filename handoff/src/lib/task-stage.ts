import { dispatchToLeadAgent } from "@/lib/agent-dispatch";
import { legacyStartsAllowed } from "@/lib/agent-mode";
import type { Sql } from "@/db/sql";
import type { WakeReason } from "@/lib/agent-wake";
import { claimDueWorkflow, scheduleTaskSwarm } from "@/lib/client-workflows";
import type { ObjectStore } from "@/lib/store/objects";
import { defaultBuildDeps, startBuild, type BuildDeps, type GateReason } from "@/lib/cursor-build";
import { nextColumnPosition } from "@/lib/task-position";
import { BOARD_COLUMNS, COLUMN_SQL, columnOf as boardColumnOf } from "@/lib/board-model";

export { nextColumnPosition } from "@/lib/task-position";

export const TASK_COLUMNS = BOARD_COLUMNS;
export type TaskColumn = (typeof TASK_COLUMNS)[number];

type TaskMoveRow = {
  id: string;
  organization_id: string | null;
  project_id: string | null;
  stage: string;
  status: string;
  position: number;
  review_requested_at: number | null;
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
  /** When set, a move to run starts this task's swarm in this call. */
  swarm?: {
    origin: string;
    fetchImpl?: typeof fetch;
    wait?: (ms: number) => Promise<void>;
    store?: ObjectStore;
  };
  instruction?: string;
  readSkill?: (skillPath: string) => Promise<string | null>;
  /** A move to review keeps this as the note staff read. */
  note?: string;
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
      executionId?: string;
      swarmStatus?: string;
      output?: string;
      waitingOn?: string;
      startedWorkflowId?: string;
      /** AGENT_MODE=agents: the task went to this lead agent (null: Client Services must assign one). */
      handedTo?: string | null;
    }
  | { ok: false; error: "missing" | "invalid" | GateReason };

function columnOf(task: { status: string; stage: string; review_requested_at?: number | null }): TaskColumn {
  return boardColumnOf(task);
}

export function isColumn(value: string | undefined): value is TaskColumn {
  return (TASK_COLUMNS as readonly string[]).includes(value ?? "");
}

async function columnMates(sql: Sql, task: TaskMoveRow, column: TaskColumn): Promise<{ id: string }[]> {
  return sql.all<{ id: string }>(
    `SELECT id FROM tasks
     WHERE ifnull(organization_id, '') = ifnull(?, '')
       AND ifnull(project_id, '') = ifnull(?, '')
       AND ${COLUMN_SQL}
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
    "SELECT id, organization_id, project_id, stage, status, position, review_requested_at FROM tasks WHERE id = ?",
    [input.taskId],
  );
  if (!task) return { ok: false, error: "missing" };
  const moved = await moveTask(sql, task, input);
  // Leaving Review: any successful move to another column drops the review flag (the stage stays).
  if (moved.ok && task.review_requested_at != null && moved.column !== "review") {
    await sql.run("UPDATE tasks SET review_requested_at = NULL WHERE id = ?", [task.id]);
  }
  return moved;
}

async function moveTask(sql: Sql, task: TaskMoveRow, input: MoveTaskInput): Promise<MoveTaskResult> {
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
  if (input.to === "review") return moveToReview(sql, task, current, input);
  return moveToStage(sql, task, input.to, current, input);
}

/**
 * Review waits on staff. It never starts a cloud run, a swarm, or a wake, in either AGENT_MODE.
 * The stage stays as it was, so a send back knows where the card came from.
 */
async function moveToReview(
  sql: Sql,
  task: TaskMoveRow,
  current: TaskColumn,
  input: MoveTaskInput,
): Promise<MoveTaskResult> {
  if (current === "done") return { ok: false, error: "invalid" };
  const note = input.note?.trim().slice(0, 2000) || null;
  if (current === "review" && input.position === undefined && note === null) {
    return { ok: true, taskId: task.id, column: "review", stage: task.stage, status: task.status };
  }
  const position = await place(sql, task, "review", input);
  await sql.run(
    `UPDATE tasks
     SET status = 'doing', review_requested_at = COALESCE(review_requested_at, ?), review_note = COALESCE(?, review_note),
         blocked_reason = NULL, done_at = NULL, position = ?, updated_at = ?
     WHERE id = ?`,
    [input.now, note, position, input.now, task.id],
  );
  await logMove(sql, task, "review", note ? `Moved to review. ${note}` : inputBody("review"), input.now, input.actor);
  return { ok: true, taskId: task.id, column: "review", stage: task.stage, status: "doing" };
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

async function handToAgent(sql: Sql, task: TaskMoveRow, column: "build" | "run", input: MoveTaskInput): Promise<MoveTaskResult> {
  const position = await place(sql, task, column, input);
  await sql.run(
    `UPDATE tasks SET stage = ?, status = 'doing', blocked_reason = NULL, done_at = NULL, position = ?, updated_at = ? WHERE id = ?`,
    [column, position, input.now, task.id],
  );
  await logMove(sql, task, column, inputBody(column), input.now, input.actor);
  let handedTo: string | null = null;
  if (task.organization_id) {
    const row = await sql.get<{ title: string; project_id: string | null; deliverable_id: string | null }>(
      "SELECT title, project_id, deliverable_id FROM tasks WHERE id = ?",
      [task.id],
    );
    const sent = await dispatchToLeadAgent(sql, {
      organizationId: task.organization_id,
      projectId: row?.project_id ?? null,
      taskId: task.id,
      title: row?.title ?? "Task",
      reason: column,
      deliverableId: row?.deliverable_id ?? null,
      note: input.instruction ?? null,
      actor: input.actor,
      now: input.now,
    });
    handedTo = sent.leadAgentId;
  }
  return { ok: true, taskId: task.id, column, stage: column, status: "doing", handedTo };
}

async function moveToBuild(sql: Sql, task: TaskMoveRow, input: MoveTaskInput): Promise<MoveTaskResult> {
  if (!legacyStartsAllowed()) return handToAgent(sql, task, "build", input);
  const built = await startBuild(sql, task.id, input.build ?? defaultBuildDeps(input.now));
  if (!built.ok) {
    await sql.run("UPDATE tasks SET stage = ?, done_at = NULL WHERE id = ?", [task.stage, task.id]);
    return { ok: false, error: built.reason };
  }
  const position = await place(sql, task, "build", input);
  if (built.action === "waiting") {
    await sql.run("UPDATE tasks SET position = ?, done_at = NULL WHERE id = ?", [position, task.id]);
    await logMove(sql, task, "build", "Waiting for a free cloud run.", input.now, input.actor);
    return { ok: true, taskId: task.id, column: "build", stage: "build", status: "todo", waiting: "cap_reached" };
  }
  await sql.run(
    "UPDATE tasks SET position = ?, done_at = NULL, status = 'doing', blocked_reason = NULL WHERE id = ?",
    [position, task.id],
  );
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
  if (!legacyStartsAllowed()) return handToAgent(sql, task, "run", input);
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
  const taskStatus = status === "done" ? "todo" : status;
  const origin = input.swarm?.origin.trim() ?? "";
  if (!scheduled.none && origin.startsWith("https://")) {
    const started = await claimDueWorkflow({
      sql,
      organizationId: scheduled.organizationId,
      origin,
      now: input.now,
      workflowId: scheduled.workflowId,
      instruction: input.instruction,
      fetchImpl: input.swarm?.fetchImpl,
      wait: input.swarm?.wait,
      store: input.swarm?.store,
      readSkill: input.readSkill,
    });
    const follow =
      !started.ok ||
      (started.ok && !started.none && (started.status === "running" || started.status === "queued" || started.more));
    if (follow) await input.wake?.(scheduled.organizationId, "due");
    await logMove(sql, task, "run", inputBody("run"), input.now, input.actor);
    if (!started.ok) return started;
    if (started.none) {
      return { ok: true, taskId: task.id, column: "run", stage: "run", status: taskStatus, workflowId: scheduled.workflowId };
    }
    return {
      ok: true,
      taskId: task.id,
      column: "run",
      stage: "run",
      status: taskStatus,
      workflowId: scheduled.workflowId,
      executionId: started.executionId || undefined,
      swarmStatus: started.status,
      output: started.output,
      waitingOn: started.status === "queued" ? started.waitingOn : undefined,
      startedWorkflowId: started.workflowId,
    };
  }
  if (!scheduled.none) await input.wake?.(scheduled.organizationId, "due");
  await logMove(sql, task, "run", inputBody("run"), input.now, input.actor);
  return {
    ok: true,
    taskId: task.id,
    column: "run",
    stage: "run",
    status: taskStatus,
    workflowId: scheduled.none ? null : scheduled.workflowId,
  };
}
