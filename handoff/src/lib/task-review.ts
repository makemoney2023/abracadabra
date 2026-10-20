import type { Sql } from "@/db/sql";
import { dispatchToLeadAgent } from "@/lib/agent-dispatch";
import { legacyStartsAllowed } from "@/lib/agent-mode";
import { moveTaskStage, type MoveTaskInput, type MoveTaskResult } from "@/lib/task-stage";
import { nextColumnPosition } from "@/lib/task-position";

type ReviewRow = {
  id: string;
  organization_id: string | null;
  project_id: string | null;
  title: string;
  stage: string;
  status: string;
  deliverable_id: string | null;
  review_requested_at: number | null;
};

export type ReviewDecision = "approve" | "progress" | "build";

export type ReviewInput = Omit<MoveTaskInput, "to" | "direction" | "position" | "blockedReason" | "note"> & {
  decision: ReviewDecision;
  /** Required to send back; optional on approve. */
  note?: string;
};

export type ReviewResult = MoveTaskResult | { ok: false; error: "not_in_review" | "note_required" };

async function loadReview(sql: Sql, taskId: string): Promise<ReviewRow | undefined> {
  return sql.get<ReviewRow>(
    `SELECT id, organization_id, project_id, title, stage, status, deliverable_id, review_requested_at
     FROM tasks WHERE id = ?`,
    [taskId],
  );
}

async function logReview(
  sql: Sql,
  task: ReviewRow,
  decision: ReviewDecision,
  note: string | null,
  input: ReviewInput,
): Promise<void> {
  if (!task.organization_id || !input.actor.id) return;
  const what =
    decision === "approve" ? "Review approved" : decision === "build" ? "Sent back to build" : "Sent back to in progress";
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, ?, 'staff.task_review', ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      task.organization_id,
      task.project_id,
      input.actor.kind,
      input.actor.id,
      `${what}: "${task.title}".${note ? ` ${note}` : ""}`.slice(0, 2000),
      JSON.stringify({ taskId: task.id, decision, note, stage: task.stage }),
      input.now,
    ],
  );
}

/**
 * Staff decision on a card in Review.
 * approve: to done (same as a done move, so filing and the feed see it).
 * progress: back to its own stage as in progress. Starts nothing; with AGENT_MODE=agents the lead agent gets a
 *   "changes" handoff with the note.
 * build: a normal move to build with the note as the instruction, so legacy starts a Cursor run (as a build move
 *   always does) and agents mode hands it to the lead agent.
 */
export async function decideReview(sql: Sql, input: ReviewInput): Promise<ReviewResult> {
  const task = await loadReview(sql, input.taskId);
  if (!task) return { ok: false, error: "missing" };
  if (task.status === "done" || task.review_requested_at == null) return { ok: false, error: "not_in_review" };
  const note = input.note?.trim().slice(0, 2000) || null;
  if (input.decision !== "approve" && !note) return { ok: false, error: "note_required" };

  if (input.decision === "approve") {
    const moved = await moveTaskStage(sql, { ...input, to: "done" });
    if (!moved.ok) return moved;
    await sql.run("UPDATE tasks SET review_note = NULL WHERE id = ?", [task.id]);
    await logReview(sql, task, "approve", note, input);
    return moved;
  }

  if (input.decision === "build") {
    const moved = await moveTaskStage(sql, { ...input, to: "build", instruction: note ?? undefined });
    if (!moved.ok) return moved;
    await sql.run("UPDATE tasks SET review_note = ? WHERE id = ?", [note, task.id]);
    await logReview(sql, task, "build", note, input);
    return moved;
  }

  const stage = task.stage === "engineer" || task.stage === "build" || task.stage === "run" ? task.stage : "describe";
  const position = await nextColumnPosition(sql, {
    organizationId: task.organization_id,
    projectId: task.project_id,
    column: stage,
  });
  await sql.run(
    `UPDATE tasks
     SET stage = ?, status = 'doing', review_requested_at = NULL, review_note = ?, blocked_reason = NULL,
         done_at = NULL, position = ?, updated_at = ?
     WHERE id = ?`,
    [stage, note, position, input.now, task.id],
  );
  await logReview(sql, task, "progress", note, input);
  let handedTo: string | null | undefined;
  if (!legacyStartsAllowed() && task.organization_id) {
    const sent = await dispatchToLeadAgent(sql, {
      organizationId: task.organization_id,
      projectId: task.project_id,
      taskId: task.id,
      title: task.title,
      reason: "changes",
      deliverableId: task.deliverable_id,
      note,
      actor: input.actor,
      now: input.now,
    });
    handedTo = sent.leadAgentId;
  }
  return {
    ok: true,
    taskId: task.id,
    column: stage,
    stage,
    status: "doing",
    ...(handedTo !== undefined ? { handedTo } : {}),
  };
}
