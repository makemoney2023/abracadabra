import type { Sql } from "@/db/sql";
import { itemForPath } from "@/lib/artifact-adapter";
import { baseName } from "@/lib/file-label";
import { queueProductEvent } from "@/lib/notifications";

/**
 * Agent filings wait for Client Services. A filing lands in the client's space as a held batch (batches.held_at):
 * staff and the space's operators see it, client members don't. Each filing gets a deliverable (in_review, not yet
 * published) so it shows in Client Services' space review and needs-review lists, linked to the card.
 * Approving clears the hold, publishes the deliverable, and sends the client the usual "is ready" email.
 * An agent can supersede or retract its own held filing; Client Services can discard any filing, old ones included.
 */

export type ReviewState = "held" | "approved" | "superseded" | "retracted" | "discarded";
export type ReviewActor = { kind: "agent" | "staff" | "system"; id: string };

type WorkRow = {
  id: string;
  agent_id: string;
  title: string;
  state: string;
  review_state: ReviewState | null;
  organization_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
  task_id: string | null;
  batch_id: string | null;
  deliverable_id: string | null;
  external_id: string;
};

const WORK_COLUMNS =
  "id, agent_id, title, state, review_state, organization_id, project_id, workspace_id, task_id, batch_id, deliverable_id, external_id";

export async function loadWork(sql: Sql, id: string): Promise<WorkRow | undefined> {
  return sql.get<WorkRow>(`SELECT ${WORK_COLUMNS} FROM agent_work_items WHERE id = ?`, [id]);
}

/** An agent's own item, by work item id or by the external_id it filed with. */
export async function loadOwnWork(sql: Sql, agentId: string, ref: string): Promise<WorkRow | undefined> {
  return sql.get<WorkRow>(
    `SELECT ${WORK_COLUMNS} FROM agent_work_items WHERE agent_id = ? AND (id = ? OR external_id = ?) LIMIT 1`,
    [agentId, ref, ref],
  );
}

async function activity(
  sql: Sql,
  row: Pick<WorkRow, "organization_id" | "project_id" | "workspace_id">,
  kind: string,
  actor: ReviewActor,
  body: string,
  data: Record<string, unknown>,
  now: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      row.organization_id,
      row.project_id,
      row.workspace_id,
      kind,
      actor.kind,
      actor.id,
      body.slice(0, 500),
      JSON.stringify(data),
      now,
    ],
  );
}

/** One deliverable per filing: a row per stored file, in_review and unpublished until Client Services approves. */
export async function createWorkDeliverable(
  sql: Sql,
  input: {
    organizationId: string;
    projectId: string | null;
    workspaceId: string;
    title: string;
    agentId: string;
    folder: string;
    summary: string | null;
    files: { relativePath: string; objectKey: string; sizeBytes: number }[];
    now: number;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const writes: { statement: string; params: readonly unknown[] }[] = [
    {
      statement: `INSERT INTO deliverables (
          id, organization_id, project_id, workspace_id, title, kind, status, version,
          source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at, updated_at, published_version
        ) VALUES (?, ?, ?, ?, ?, 'document', 'in_review', 1, NULL, NULL, NULL, 'agent', ?, ?, ?, NULL)`,
      params: [id, input.organizationId, input.projectId, input.workspaceId, input.title.slice(0, 200), input.agentId, input.now, input.now],
    },
  ];
  input.files.forEach((file, index) => {
    const media = itemForPath(file.relativePath, file.objectKey);
    let mediaJson = media.mediaJson;
    try {
      const parsed = JSON.parse(mediaJson) as { size?: number }[];
      if (parsed[0]) parsed[0].size = file.sizeBytes;
      mediaJson = JSON.stringify(parsed);
    } catch {
      mediaJson = media.mediaJson;
    }
    writes.push({
      statement: `INSERT INTO deliverable_items (
          id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
        ) VALUES (?, ?, 1, ?, ?, NULL, ?, ?, ?, NULL, 'pending', ?)`,
      params: [
        crypto.randomUUID(),
        id,
        input.folder.slice(0, 200),
        media.format,
        baseName(file.relativePath).slice(0, 200),
        index === 0 ? (input.summary?.slice(0, 4000) ?? null) : null,
        mediaJson,
        index,
      ],
    });
  });
  await sql.batch(writes);
  return id;
}

/**
 * Points the card at this filing's deliverable. A card that already points at a non-agent deliverable (a website
 * build, say) keeps it.
 */
export async function linkTaskDeliverable(sql: Sql, taskId: string, deliverableId: string): Promise<void> {
  await sql.run(
    `UPDATE tasks SET deliverable_id = ?
     WHERE id = ? AND (deliverable_id IS NULL
       OR deliverable_id IN (SELECT deliverable_id FROM agent_work_items WHERE deliverable_id IS NOT NULL))`,
    [deliverableId, taskId],
  );
}

export type ApproveResult = { ok: true; approved: boolean } | { ok: false; error: "missing" | "invalid"; message: string };

/** Client Services approval: the batch shows to client members in its folder, and the client gets the ready email once. */
export async function approveAgentWork(sql: Sql, input: { id: string; actor: ReviewActor; now: number }): Promise<ApproveResult> {
  const row = await loadWork(sql, input.id);
  if (!row || row.state !== "filed") return { ok: false, error: "missing", message: "No filed work with that id." };
  if (row.review_state === "approved") return { ok: true, approved: false };
  if (row.review_state !== "held") {
    return { ok: false, error: "invalid", message: row.review_state ? `That work is ${row.review_state}.` : "That work was filed before review and is already visible." };
  }
  const writes: { statement: string; params: readonly unknown[] }[] = [
    { statement: "UPDATE agent_work_items SET review_state = 'approved', reviewed_at = ?, updated_at = ? WHERE id = ?", params: [input.now, input.now, row.id] },
  ];
  if (row.batch_id) writes.push({ statement: "UPDATE batches SET held_at = NULL WHERE id = ?", params: [row.batch_id] });
  if (row.deliverable_id) {
    writes.push({
      statement: `UPDATE deliverables SET published_version = version, published_at = ?, status = 'approved', updated_at = ?
                  WHERE id = ? AND status != 'archived'`,
      params: [input.now, input.now, row.deliverable_id],
    });
  }
  await sql.batch(writes);
  await activity(sql, row, "client_services.agent_work_approved", input.actor, `Approved "${row.title}". It's in the client's space now.`, {
    work_item_id: row.id, deliverable_id: row.deliverable_id, batch_id: row.batch_id, task_id: row.task_id,
  }, input.now);
  if (row.deliverable_id) await noticeOnce(sql, row.deliverable_id, row.title, input.now);
  return { ok: true, approved: true };
}

/** The client's "is ready" mail (deliverable.published, to every member of the space), at most once per version. */
async function noticeOnce(sql: Sql, deliverableId: string, title: string, now: number): Promise<void> {
  const deliverable = await sql.get<{ version: number }>("SELECT version FROM deliverables WHERE id = ?", [deliverableId]);
  if (!deliverable) return;
  const sent = await sql.get<{ deliverable_id: string }>(
    "SELECT deliverable_id FROM deliverable_notices WHERE deliverable_id = ? AND version = ?",
    [deliverableId, deliverable.version],
  );
  if (sent) return;
  await sql.run("INSERT INTO deliverable_notices (deliverable_id, version, sent_at) VALUES (?, ?, ?)", [deliverableId, deliverable.version, now]);
  await queueProductEvent(sql, { kind: "deliverable.published", deliverableId, version: deliverable.version, title }, now);
}

/** Every held filing on a card, when Client Services approves the card. */
export async function approveTaskWork(sql: Sql, input: { taskId: string; actor: ReviewActor; now: number }): Promise<number> {
  const rows = await sql.all<{ id: string }>(
    "SELECT id FROM agent_work_items WHERE task_id = ? AND state = 'filed' AND review_state = 'held' ORDER BY filed_at",
    [input.taskId],
  );
  let approved = 0;
  for (const row of rows) {
    const result = await approveAgentWork(sql, { id: row.id, actor: input.actor, now: input.now });
    if (result.ok && result.approved) approved += 1;
  }
  return approved;
}

/** The held filing behind a deliverable, when Client Services approves that deliverable in the space review. */
export async function approveDeliverableWork(sql: Sql, input: { deliverableId: string; actor: ReviewActor; now: number }): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM agent_work_items WHERE deliverable_id = ? AND state = 'filed' AND review_state = 'held'",
    [input.deliverableId],
  );
  if (!row) return false;
  const result = await approveAgentWork(sql, { id: row.id, actor: input.actor, now: input.now });
  return result.ok && result.approved;
}

export type WithdrawResult = { ok: true; state: ReviewState } | { ok: false; error: "missing" | "invalid" | "forbidden"; message: string };

const WITHDRAW_KIND: Record<"superseded" | "retracted" | "discarded", string> = {
  superseded: "client_agent.work_superseded",
  retracted: "client_agent.work_retracted",
  discarded: "client_services.agent_work_discarded",
};

/**
 * Takes a filing out of the client space: its batch is discarded (hidden from everyone's folder list), its
 * deliverable archived, and a card that pointed at it points at the replacement (supersede) or at nothing.
 * Agents may only supersede or retract their own held filing. Client Services may discard any filed item,
 * including ones filed before review existed.
 */
export async function withdrawAgentWork(
  sql: Sql,
  input: { id: string; to: "superseded" | "retracted" | "discarded"; actor: ReviewActor; now: number; agentId?: string; supersededBy?: string | null; reason?: string | null },
): Promise<WithdrawResult> {
  const row = input.agentId ? await loadOwnWork(sql, input.agentId, input.id) : await loadWork(sql, input.id);
  if (!row || row.state !== "filed") return { ok: false, error: "missing", message: "No filed work with that id." };
  if (input.to !== "discarded") {
    if (row.agent_id !== input.agentId) return { ok: false, error: "forbidden", message: "That work belongs to another agent." };
    if (row.review_state !== "held") {
      return {
        ok: false,
        error: "invalid",
        message: row.review_state === "approved" || row.review_state === null
          ? "That work is already in the client's space. Ask Client Services to discard it."
          : `That work is already ${row.review_state}.`,
      };
    }
  }
  let replacement: string | null = null;
  if (input.supersededBy) {
    replacement = (await sql.get<{ deliverable_id: string | null }>("SELECT deliverable_id FROM agent_work_items WHERE id = ?", [input.supersededBy]))?.deliverable_id ?? null;
  }
  const writes: { statement: string; params: readonly unknown[] }[] = [
    {
      statement: `UPDATE agent_work_items SET review_state = ?, superseded_by = ?, reviewed_at = ?, updated_at = ?${input.to === "discarded" ? ", state = 'discarded'" : ""}
                  WHERE id = ?`,
      params: [input.to, input.supersededBy ?? null, input.now, input.now, row.id],
    },
  ];
  if (row.batch_id) writes.push({ statement: "UPDATE batches SET discarded_at = COALESCE(discarded_at, ?) WHERE id = ?", params: [input.now, row.batch_id] });
  if (row.deliverable_id) {
    writes.push({ statement: "UPDATE deliverables SET status = 'archived', updated_at = ? WHERE id = ?", params: [input.now, row.deliverable_id] });
    writes.push({ statement: "UPDATE tasks SET deliverable_id = ? WHERE deliverable_id = ?", params: [replacement, row.deliverable_id] });
  }
  await sql.batch(writes);
  const verb = input.to === "superseded" ? "replaced" : input.to === "retracted" ? "took back" : "discarded";
  await activity(sql, row, WITHDRAW_KIND[input.to], input.actor, `${input.actor.id} ${verb} "${row.title}".${input.reason ? ` ${input.reason}` : ""}`, {
    work_item_id: row.id, external_id: row.external_id, batch_id: row.batch_id, deliverable_id: row.deliverable_id, superseded_by: input.supersededBy ?? null, task_id: row.task_id,
  }, input.now);
  return { ok: true, state: input.to };
}
