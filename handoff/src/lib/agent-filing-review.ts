import type { Sql } from "@/db/sql";
import { assignmentFor, type AgentPrincipal, type WorkPayload } from "@/lib/agent-work-filing";
import { itemForPath } from "@/lib/artifact-adapter";
import { videoTypeForName } from "@/lib/video-files";
import { isNamedPoster } from "@/lib/video-posters";
import { previewContentType } from "@/lib/preview";
import { captionForImage, carryForwardWrites } from "@/lib/shelf-carry";
import { DELIVERABLE_KINDS } from "@/lib/deliverable-manifest";
import { queueProductEvent } from "@/lib/notifications";
import { nextColumnPosition } from "@/lib/task-position";

/**
 * Agent filings and Client Services review.
 * - A filing is held (batches.held_at): client members can't see it until Client Services approves.
 * - A filing on a card becomes the card's deliverable (created on first filing) as a version. Filings on the same
 *   card join the open version; a new version starts after an approval, after a send back, or when the filing
 *   supersedes earlier ones. A new version keeps every piece from the published round that this filing does not replace.
 * - Filing never closes a card: it goes to Waiting on Client Services; a Done card is reopened into review.
 * - Approve releases the held batches, hides superseded ones, publishes the deliverable version, and posts the client
 *   notice: a suggested update on the Client Services feed (draft mode, default) or the "is ready" email (auto).
 * - Send back keeps everything held. A held filing can be withdrawn by its agent (or the lead); Client Services can
 *   withdraw any filing, including one filed before the hold shipped.
 */

type Write = { statement: string; params: readonly unknown[] };

export type FilingReview = {
  held: true;
  deliverableId: string | null;
  deliverableVersion: number | null;
  awaitingReview: boolean;
  taskReopened: boolean;
  workRequestId: string | null;
  superseded: string[];
};

const KIND_MAP: Record<string, string> = {
  report: "document", document: "document", research: "document", plan: "document", note: "document", decision: "document",
  meeting: "document", log: "document", handoff: "document", catalog: "website", copy: "social_pack", design: "design_system", code: "website",
  data: "other", other: "other",
};
const KINDS = new Set<string>(DELIVERABLE_KINDS);
const COPY_LIMIT = 100_000;

function activity(input: {
  organizationId: string; projectId: string | null; workspaceId: string | null; kind: string; actorKind: string; actorId: string;
  body: string; data: Record<string, unknown>; now: number;
}): Write {
  return {
    statement: `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      crypto.randomUUID(), input.organizationId, input.projectId, input.workspaceId, input.kind, input.actorKind, input.actorId,
      input.body.slice(0, 2000), JSON.stringify(input.data), input.now,
    ],
  };
}

// ---------- Request link ----------

/**
 * The Client Services request a filing (or card) answers. work_request_id must be this client's; a thread_id
 * matches a request's source_thread_id or source_message_id, else a request record is made for that thread so the
 * card, filings and feed point at the original email. Without either, the card's own request is used.
 */
export async function resolveFilingRequest(
  sql: Sql,
  input: {
    organizationId: string; taskId: string | null; workRequestId: string | null; threadId: string | null; title: string;
    summary: string | null; projectId: string | null; workspaceId: string | null; now: number;
  },
): Promise<string | null> {
  let id: string | null = null;
  if (input.workRequestId) {
    const row = await sql.get<{ id: string }>("SELECT id FROM client_work_requests WHERE id = ? AND organization_id = ?", [input.workRequestId, input.organizationId]);
    id = row?.id ?? null;
  } else if (input.threadId) {
    id = await requestForThread(sql, {
      organizationId: input.organizationId, threadId: input.threadId, subject: input.title, brief: input.summary ?? input.title,
      projectId: input.projectId, workspaceId: input.workspaceId, clientEmail: null, sourceMessageId: null, now: input.now,
    });
  }
  if (!id && input.taskId) {
    const task = await sql.get<{ work_request_id: string | null }>("SELECT work_request_id FROM tasks WHERE id = ?", [input.taskId]);
    id = task?.work_request_id ?? (await sql.get<{ id: string }>("SELECT id FROM client_work_requests WHERE task_id = ? LIMIT 1", [input.taskId]))?.id ?? null;
  }
  if (id && input.taskId) {
    await sql.run("UPDATE tasks SET work_request_id = COALESCE(work_request_id, ?) WHERE id = ?", [id, input.taskId]);
    await sql.run("UPDATE client_work_requests SET task_id = COALESCE(task_id, ?), updated_at = ? WHERE id = ?", [input.taskId, input.now, id]);
  }
  return id;
}

/** Finds or makes the request record for one email thread of one client. */
export async function requestForThread(
  sql: Sql,
  input: {
    organizationId: string; threadId: string; subject: string; brief: string; projectId: string | null; workspaceId: string | null;
    clientEmail: string | null; sourceMessageId: string | null; now: number;
  },
): Promise<string> {
  const found = await sql.get<{ id: string }>(
    `SELECT id FROM client_work_requests WHERE organization_id = ? AND (source_thread_id = ? OR source_message_id = ? OR source_message_id = ?)
     ORDER BY created_at LIMIT 1`,
    [input.organizationId, input.threadId, input.sourceMessageId ?? input.threadId, `thread:${input.threadId}`],
  );
  if (found) {
    await sql.run("UPDATE client_work_requests SET source_thread_id = COALESCE(source_thread_id, ?) WHERE id = ?", [input.threadId, found.id]);
    return found.id;
  }
  const id = crypto.randomUUID();
  await sql.batch([
    {
      statement: `INSERT INTO client_work_requests (
         id, source_message_id, source_thread_id, organization_id, project_id, workspace_id, task_id, client_email, subject, brief,
         state, match_kind, decided_by, decided_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'accepted', 'handoff', 'client-services', ?, ?, ?)`,
      params: [
        id, input.sourceMessageId ?? `thread:${input.threadId}`, input.threadId, input.organizationId, input.projectId, input.workspaceId,
        input.clientEmail, input.subject.slice(0, 500), input.brief.slice(0, 20000), input.now, input.now, input.now,
      ],
    },
    activity({
      organizationId: input.organizationId, projectId: input.projectId, workspaceId: input.workspaceId, kind: "client_work.handoff",
      actorKind: "agent", actorId: "client-services", body: `Client request handed to the client's agents: ${input.subject}`,
      data: { work_request_id: id, source_thread_id: input.threadId, source_message_id: input.sourceMessageId, client_email: input.clientEmail },
      now: input.now,
    }),
  ]);
  return id;
}

// ---------- Supersede ----------

/** Each id (work item id, or this agent's external_id) is a filed item of this client, not withdrawn or already superseded, by this agent or (for the lead) any agent. */
export async function checkSupersedes(
  sql: Sql,
  input: { agent: AgentPrincipal; organizationId: string; ids: string[] },
): Promise<{ ok: true; ids: string[] } | { ok: false; message: string }> {
  const lead = input.agent.assignments.some((row) => row.organizationId === input.organizationId && row.role === "lead");
  const ids: string[] = [];
  for (const id of input.ids) {
    type Row = { id: string; agent_id: string; organization_id: string | null; state: string; retracted_at: number | null; superseded_by: string | null };
    const cols = "id, agent_id, organization_id, state, retracted_at, superseded_by";
    // A work item id, or this agent's own external_id.
    const row =
      (await sql.get<Row>(`SELECT ${cols} FROM agent_work_items WHERE id = ?`, [id])) ??
      (await sql.get<Row>(`SELECT ${cols} FROM agent_work_items WHERE agent_id = ? AND external_id = ?`, [input.agent.agentId, id]));
    if (!row || row.state !== "filed" || row.organization_id !== input.organizationId) return { ok: false, message: `supersedes: ${id} is not a filing of this client.` };
    if (row.agent_id !== input.agent.agentId && !lead) return { ok: false, message: `supersedes: ${id} was filed by another agent. Ask the lead agent.` };
    if (row.retracted_at != null) return { ok: false, message: `supersedes: ${id} was withdrawn.` };
    if (row.superseded_by) return { ok: false, message: `supersedes: ${id} is already superseded by ${row.superseded_by}.` };
    if (!ids.includes(row.id)) ids.push(row.id);
  }
  return { ok: true, ids };
}

// ---------- Filing: deliverable version + review gate ----------

type TaskRow = {
  id: string; title: string; organization_id: string | null; project_id: string | null; status: string; stage: string;
  review_requested_at: number | null; deliverable_id: string | null;
};

async function pickVersion(sql: Sql, deliverable: { id: string; version: number; published_version: number | null }, taskId: string, supersedes: string[]): Promise<number> {
  const items = await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_items WHERE deliverable_id = ? AND version = ?", [deliverable.id, deliverable.version]);
  if (!items?.n) return deliverable.version;
  if (deliverable.published_version != null && deliverable.published_version >= deliverable.version) return deliverable.version + 1;
  if (supersedes.length) return deliverable.version + 1;
  // A send back since the open version's last filing starts a new version.
  const last = await sql.get<{ at: number | null }>(
    `SELECT MAX(filed_at) AS at FROM agent_work_items WHERE deliverable_id = ? AND deliverable_version = ? AND retracted_at IS NULL`,
    [deliverable.id, deliverable.version],
  );
  const sentBack = await sql.get<{ id: string }>(
    `SELECT id FROM activities WHERE kind IN ('client_services.task_review', 'staff.task_review')
       AND json_extract(data_json, '$.taskId') = ? AND json_extract(data_json, '$.decision') != 'approve' AND created_at >= ? LIMIT 1`,
    [taskId, Number(last?.at ?? 0)],
  );
  return sentBack ? deliverable.version + 1 : deliverable.version;
}

/** A clip's media_json gains its poster picture (role "poster") when one is linked. Pictures and files are unchanged. */
function withPoster(mediaJson: string, file: { relative_path: string; poster_path: string | null; poster_key: string | null }): string {
  if (!file.poster_key || !file.poster_path || !videoTypeForName(file.relative_path)) return mediaJson;
  const type = previewContentType(file.poster_path);
  if (!type.startsWith("image/")) return mediaJson;
  try {
    const parsed = JSON.parse(mediaJson) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) return mediaJson;
    return JSON.stringify([...parsed, { r2_key: file.poster_key, role: "poster", content_type: type, size: 0 }]);
  } catch {
    return mediaJson;
  }
}

export async function recordFiling(
  sql: Sql,
  input: {
    itemId: string; batchId: string; agent: AgentPrincipal; payload: WorkPayload; summary: string;
    /** Stored path of the filing's summary file ("<folder>/summary.md" or "<folder>/<title> - summary.md"). */
    summaryPath?: string | null; organizationId: string;
    workspaceId: string; projectId: string | null; taskId: string | null; workRequestId: string | null; now: number;
  },
): Promise<FilingReview> {
  const { payload } = input;
  const writes: Write[] = [];
  let deliverableId: string | null = null;
  let version: number | null = null;
  let awaitingReview = false;
  let taskReopened = false;
  const task = input.taskId
    ? await sql.get<TaskRow>(
        "SELECT id, title, organization_id, project_id, status, stage, review_requested_at, deliverable_id FROM tasks WHERE id = ?",
        [input.taskId],
      )
    : undefined;

  if (task) {
    const existing = task.deliverable_id
      ? await sql.get<{ id: string; workspace_id: string; version: number; published_version: number | null; status: string }>(
          "SELECT id, workspace_id, version, published_version, status FROM deliverables WHERE id = ? AND status != 'archived'",
          [task.deliverable_id],
        )
      : undefined;
    const kind = payload.deliverableKind && KINDS.has(payload.deliverableKind) ? payload.deliverableKind : KIND_MAP[payload.kind] ?? "other";
    if (existing && existing.workspace_id === input.workspaceId) {
      deliverableId = existing.id;
      version = await pickVersion(sql, existing, task.id, payload.supersedes);
      if (version !== existing.version) {
        writes.push({ statement: "UPDATE deliverables SET version = ?, status = 'draft', updated_at = ? WHERE id = ?", params: [version, input.now, existing.id] });
      } else {
        writes.push({ statement: "UPDATE deliverables SET updated_at = ? WHERE id = ?", params: [input.now, existing.id] });
      }
    } else {
      deliverableId = crypto.randomUUID();
      version = 1;
      const space = await sql.get<{ project_id: string | null }>("SELECT project_id FROM workspaces WHERE id = ?", [input.workspaceId]);
      writes.push({
        statement: `INSERT INTO deliverables (
          id, organization_id, project_id, workspace_id, title, kind, status, version, source_repo_id, source_ref, published_at,
          actor_kind, actor_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, NULL, NULL, NULL, 'agent', ?, ?, ?)`,
        params: [deliverableId, input.organizationId, space?.project_id ?? task.project_id ?? input.projectId, input.workspaceId, task.title.slice(0, 200), kind, input.agent.agentId, input.now, input.now],
      });
      writes.push({ statement: "UPDATE tasks SET deliverable_id = ? WHERE id = ?", params: [deliverableId, task.id] });
      writes.push(activity({
        organizationId: input.organizationId, projectId: task.project_id, workspaceId: input.workspaceId, kind: "deliverable_created",
        actorKind: "agent", actorId: input.agent.agentId, body: task.title, data: { deliverable_id: deliverableId, task_id: task.id }, now: input.now,
      }));
    }
    // Items: the summary is the page copy; every other stored file is an item; each link is a link item.
    const files = await sql.all<{ relative_path: string; object_key: string; poster_path: string | null; poster_key: string | null }>(
      `SELECT f.relative_path, f.object_key, p.relative_path AS poster_path, p.object_key AS poster_key
       FROM files f
       LEFT JOIN file_posters fp ON fp.file_id = f.id
       LEFT JOIN files p ON p.id = fp.poster_file_id AND p.status != 'failed'
       WHERE f.batch_id = ? AND f.status != 'failed' ORDER BY f.relative_path`,
      [input.batchId],
    );
    const sortBase = await sql.get<{ n: number | null }>("SELECT MAX(sort) AS n FROM deliverable_items WHERE deliverable_id = ? AND version = ?", [deliverableId, version]);
    let sort = Number(sortBase?.n ?? -1) + 1;
    const sourceVersion = existing && version !== existing.version ? (existing.published_version ?? existing.version) : null;
    const earlierNotes = sourceVersion == null
      ? []
      : await sql.all<{ copy_text: string }>(
          "SELECT copy_text FROM deliverable_items WHERE deliverable_id = ? AND version = ? AND copy_text IS NOT NULL AND copy_text != ''",
          [deliverableId, sourceVersion],
        );
    const notes = [input.summary, ...earlierNotes.map((row) => row.copy_text)].join("\n");
    const incomingTitles = [payload.title.slice(0, 200)];
    const item = (title: string, format: string, copy: string | null, media: string, link: string | null): Write => ({
      statement: `INSERT INTO deliverable_items (id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort, work_item_id)
                  VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'pending', ?, ?)`,
      params: [crypto.randomUUID(), deliverableId, version, payload.title.slice(0, 200), format, title.slice(0, 200), copy, media, link, sort++, input.itemId],
    });
    writes.push(item(payload.title, "page", input.summary.slice(0, COPY_LIMIT), "[]", null));
    for (const file of files) {
      const name = file.relative_path.split("/").pop() ?? file.relative_path;
      // The summary is the page item above; its stored file ("summary.md", or "<title> - summary.md" in a named folder) is not a piece.
      if (file.relative_path === input.summaryPath || /^summary( \(\d+\))?\.md$/i.test(name)) continue;
      // A picture named "<clip>-poster.png" belongs to its clip (shown before play). It is not a piece of its own.
      if (isNamedPoster(file, files)) continue;
      incomingTitles.push(name.slice(0, 200));
      const shaped = itemForPath(file.relative_path, file.object_key);
      writes.push(item(name, shaped.format, captionForImage(notes, name), withPoster(shaped.mediaJson, file), null));
    }
    for (const link of payload.links) {
      incomingTitles.push(link.label.slice(0, 200));
      writes.push(item(link.label, "link", null, "[]", link.url));
    }
    if (sourceVersion != null && deliverableId) {
      writes.push(...await carryForwardWrites(sql, {
        deliverableId,
        fromVersion: sourceVersion,
        toVersion: version,
        incomingTitles,
        notes,
      }));
    }
    writes.push({
      statement: "UPDATE agent_work_items SET deliverable_id = ?, deliverable_version = ? WHERE id = ?",
      params: [deliverableId, version, input.itemId],
    });

    // Review gate. Done: reopen into review as a new version. Open and not in review: to review unless keep_task_open.
    const inReview = task.status !== "done" && task.review_requested_at != null;
    if (task.status === "done" || (!inReview && !payload.keepTaskOpen)) {
      const position = await nextColumnPosition(sql, { organizationId: task.organization_id, projectId: task.project_id, column: "review" });
      const note = task.status === "done"
        ? `Reopened: ${input.agent.label} filed a new version (v${version}) of "${payload.title}".`
        : `${input.agent.label} filed "${payload.title}" (v${version}).`;
      writes.push({
        statement: `UPDATE tasks SET status = 'doing', review_requested_at = ?, review_note = ?, blocked_reason = NULL, done_at = NULL,
                      position = ?, updated_at = ? WHERE id = ?`,
        params: [input.now, note.slice(0, 2000), position, input.now, task.id],
      });
      writes.push(activity({
        organizationId: input.organizationId, projectId: task.project_id, workspaceId: input.workspaceId, kind: "agent.task_stage",
        actorKind: "agent", actorId: input.agent.agentId, body: `Moved to Waiting on Client Services. ${note}`,
        data: { taskId: task.id, stage: "review", column: "review", reopened: task.status === "done" }, now: input.now,
      }));
      taskReopened = task.status === "done";
      awaitingReview = true;
    } else {
      awaitingReview = inReview;
    }
    if (awaitingReview) {
      writes.push(activity({
        organizationId: input.organizationId, projectId: task.project_id, workspaceId: input.workspaceId, kind: "client_agent.review_waiting",
        actorKind: "agent", actorId: input.agent.agentId,
        body: `Awaiting Client Services review: "${task.title}". ${input.agent.label} filed "${payload.title}" (v${version}, held until approved).`,
        data: {
          task_id: task.id, work_item_id: input.itemId, agent_id: input.agent.agentId, deliverable_id: deliverableId, version,
          reopened: taskReopened, work_request_id: input.workRequestId, links: payload.links,
        },
        now: input.now,
      }));
    }
  }

  // Supersede: the old filings are marked; a still-held one is hidden now, a released one at the next approval.
  if (payload.supersedes.length) {
    const marks = payload.supersedes.map(() => "?").join(", ");
    writes.push({
      statement: `UPDATE agent_work_items SET superseded_by = ?, updated_at = ? WHERE id IN (${marks}) AND superseded_by IS NULL`,
      params: [input.itemId, input.now, ...payload.supersedes],
    });
    writes.push({
      statement: `UPDATE batches SET hidden_at = ? WHERE hidden_at IS NULL AND held_at IS NOT NULL AND released_at IS NULL
                    AND id IN (SELECT batch_id FROM agent_work_items WHERE id IN (${marks}) AND batch_id IS NOT NULL)`,
      params: [input.now, ...payload.supersedes],
    });
    writes.push(activity({
      organizationId: input.organizationId, projectId: task?.project_id ?? input.projectId, workspaceId: input.workspaceId,
      kind: "client_agent.work_superseded", actorKind: "agent", actorId: input.agent.agentId,
      body: `${input.agent.label} filed "${payload.title}" to replace ${payload.supersedes.length} earlier filing${payload.supersedes.length === 1 ? "" : "s"}.`,
      data: { work_item_id: input.itemId, supersedes: payload.supersedes, task_id: task?.id ?? null }, now: input.now,
    }));
  }
  if (writes.length) await sql.batch(writes);
  return { held: true, deliverableId, deliverableVersion: version, awaitingReview, taskReopened, workRequestId: input.workRequestId, superseded: payload.supersedes };
}

// ---------- Approve: release + publish + notice ----------

export type ReleaseResult = {
  released: string[];
  hidden: string[];
  deliverableId: string | null;
  publishedVersion: number | null;
  notice: "draft" | "auto" | null;
  /** Every released filing was already delivered (catalog): the deliverable is approved and no client update is posted. */
  delivered?: boolean;
};

/**
 * Client Services approved: release the card's held filings (or one deliverable's), hide what they superseded,
 * publish the deliverable at the newest released version, and post the client notice. A card with no held filing
 * (work filed before the hold) releases nothing and posts no notice.
 */
export async function releaseHeldWork(
  sql: Sql,
  input: { taskId?: string | null; deliverableId?: string | null; now: number; actor?: { kind: string; id: string } },
): Promise<ReleaseResult> {
  const actor = input.actor ?? { kind: "system", id: "client-services" };
  const empty: ReleaseResult = { released: [], hidden: [], deliverableId: null, publishedVersion: null, notice: null };
  if (!input.taskId && !input.deliverableId) return empty;
  const items = await sql.all<{
    id: string; title: string; batch_id: string | null; deliverable_id: string | null; deliverable_version: number | null;
    supersedes_json: string; organization_id: string; workspace_id: string | null; project_id: string | null; task_id: string | null;
    work_request_id: string | null; agent_id: string; already_delivered: number;
  }>(
    `SELECT id, title, batch_id, deliverable_id, deliverable_version, supersedes_json, organization_id, workspace_id, project_id, task_id,
            work_request_id, agent_id, already_delivered
     FROM agent_work_items
     WHERE state = 'filed' AND retracted_at IS NULL AND released_at IS NULL AND superseded_by IS NULL
       AND ${input.taskId ? "task_id = ?" : "deliverable_id = ?"}
     ORDER BY filed_at`,
    [input.taskId ?? input.deliverableId],
  );
  if (items.length === 0) return empty;
  const writes: Write[] = [];
  const ids = items.map((item) => item.id);
  const marks = ids.map(() => "?").join(", ");
  writes.push({ statement: `UPDATE agent_work_items SET released_at = ?, updated_at = ? WHERE id IN (${marks})`, params: [input.now, input.now, ...ids] });
  writes.push({
    statement: `UPDATE batches SET released_at = ? WHERE released_at IS NULL AND id IN (SELECT batch_id FROM agent_work_items WHERE id IN (${marks}))`,
    params: [input.now, ...ids],
  });
  // What these filings replaced leaves the client's view now (released or filed before the hold).
  const replaced = new Set<string>();
  for (const item of items) {
    try {
      for (const id of JSON.parse(item.supersedes_json) as unknown[]) if (typeof id === "string") replaced.add(id);
    } catch {
      // A bad list hides nothing.
    }
  }
  const older = await sql.all<{ id: string }>(
    `SELECT id FROM agent_work_items WHERE superseded_by IN (${marks})${replaced.size ? ` OR id IN (${[...replaced].map(() => "?").join(", ")})` : ""}`,
    [...ids, ...replaced],
  );
  const hidden = older.map((row) => row.id).filter((id) => !ids.includes(id));
  if (hidden.length) {
    writes.push({
      statement: `UPDATE batches SET hidden_at = ? WHERE hidden_at IS NULL AND id IN (SELECT batch_id FROM agent_work_items WHERE id IN (${hidden.map(() => "?").join(", ")}))`,
      params: [input.now, ...hidden],
    });
  }
  const first = items[items.length - 1]!;
  // Catalog: work finished before it was filed. Published as approved (delivered) and no client update is posted.
  const delivered = items.every((item) => item.already_delivered === 1);
  let deliverableId: string | null = null;
  let publishedVersion: number | null = null;
  let deliverableTitle = first.title;
  const versions = items.filter((item) => item.deliverable_id && item.deliverable_version != null);
  if (versions.length) {
    const newest = versions.reduce((a, b) => ((b.deliverable_version ?? 0) >= (a.deliverable_version ?? 0) ? b : a));
    deliverableId = newest.deliverable_id;
    publishedVersion = newest.deliverable_version;
    const row = await sql.get<{ title: string; version: number }>("SELECT title, version FROM deliverables WHERE id = ?", [deliverableId]);
    deliverableTitle = row?.title ?? deliverableTitle;
    writes.push({
      statement: `UPDATE deliverables SET published_version = ?, version = MAX(version, ?), published_at = ?, status = ?, updated_at = ? WHERE id = ?`,
      params: [publishedVersion, publishedVersion, input.now, delivered ? "approved" : "in_review", input.now, deliverableId],
    });
    if (delivered) {
      writes.push({
        statement: "UPDATE deliverable_items SET status = 'approved' WHERE deliverable_id = ? AND version = ? AND status = 'pending'",
        params: [deliverableId, publishedVersion],
      });
    }
    writes.push(activity({
      organizationId: first.organization_id, projectId: first.project_id, workspaceId: first.workspace_id, kind: "deliverable_published",
      actorKind: actor.kind, actorId: actor.id,
      body: delivered
        ? `${deliverableTitle} (v${publishedVersion}) is in the client space as delivered work (filed after it was finished, no client update).`
        : `${deliverableTitle} (v${publishedVersion}) is released to the client space.`,
      data: { deliverable_id: deliverableId, version: publishedVersion, task_id: first.task_id, work_item_ids: ids, delivered }, now: input.now,
    }));
  }
  await sql.batch(writes);
  if (delivered) return { released: ids, hidden, deliverableId, publishedVersion, notice: null, delivered: true };

  // The notice. Draft (default): a suggested update on the Client Services feed. Auto: the "is ready" email to members.
  const org = await sql.get<{ client_update_mode: string | null; name: string }>("SELECT client_update_mode, name FROM organizations WHERE id = ?", [first.organization_id]);
  const mode = org?.client_update_mode === "auto" ? "auto" : "draft";
  if (mode === "auto" && deliverableId && publishedVersion != null) {
    const sent = await sql.get<{ deliverable_id: string }>("SELECT deliverable_id FROM deliverable_notices WHERE deliverable_id = ? AND version = ?", [deliverableId, publishedVersion]);
    if (!sent) {
      await sql.run("INSERT INTO deliverable_notices (deliverable_id, version, sent_at) VALUES (?, ?, ?)", [deliverableId, publishedVersion, input.now]);
      await queueProductEvent(sql, { kind: "deliverable.published", deliverableId, version: publishedVersion, title: deliverableTitle }, input.now);
    }
  } else {
    const requestId = items.map((item) => item.work_request_id).find(Boolean) ?? null;
    const request = requestId
      ? await sql.get<{ client_email: string | null; subject: string; source_thread_id: string | null; source_message_id: string }>(
          "SELECT client_email, subject, source_thread_id, source_message_id FROM client_work_requests WHERE id = ?",
          [requestId],
        )
      : undefined;
    const space = first.workspace_id ? await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [first.workspace_id]) : undefined;
    const subject = request?.subject ? `Re: ${request.subject}` : `${deliverableTitle} is ready`;
    const body = [
      "Hi,",
      "",
      `${deliverableTitle} is ready for you in your space.${space ? ` Open it at ${(process.env.HANDOFF_APP_ORIGIN || "https://handoff.abra-ca-dabra.app").replace(/\/$/, "")}/w/${space.slug}.` : ""}`,
      ...items.map((item) => `- ${item.title}`),
      "",
      "Reply here with any changes.",
    ].join("\n");
    await sql.run(
      `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
       VALUES (?, ?, ?, ?, 'client_work.update_ready', ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(), first.organization_id, first.project_id, first.workspace_id, actor.kind, actor.id,
        `Client update ready to draft in magic@ (not sent): ${deliverableTitle}.`,
        JSON.stringify({
          task_id: first.task_id, deliverable_id: deliverableId, version: publishedVersion, work_request_id: requestId, work_item_ids: ids,
          suggested_update: {
            to: request?.client_email ?? null, subject, body, thread_id: request?.source_thread_id ?? null,
            source_message_id: request?.source_message_id ?? null, space_slug: space?.slug ?? null,
          },
        }),
        input.now,
      ],
    );
  }
  return { released: ids, hidden, deliverableId, publishedVersion, notice: mode };
}

export type OwnReleaseResult =
  | { ok: true; deliverableId: string; publishedVersion: number }
  | { ok: false; status: 403 | 404 | 409; reasonCode: string; message: string };

/**
 * The lead releases its own held round onto the client shelf.
 * Pieces stay unapproved. Mail goes out only when the client already uses automatic updates.
 */
export async function releaseOwnRound(
  sql: Sql,
  input: { id: string; agent: AgentPrincipal; now: number },
): Promise<OwnReleaseResult> {
  const row = await sql.get<{
    id: string;
    agent_id: string;
    organization_id: string | null;
    workspace_id: string | null;
    project_id: string | null;
    title: string;
    state: string;
    batch_id: string | null;
    retracted_at: number | null;
    released_at: number | null;
    deliverable_id: string | null;
    deliverable_version: number | null;
  }>(
    `SELECT id, agent_id, organization_id, workspace_id, project_id, title, state, batch_id, retracted_at, released_at,
            deliverable_id, deliverable_version
     FROM agent_work_items WHERE id = ?`,
    [input.id],
  );
  if (!row || row.state !== "filed" || row.retracted_at != null || !row.organization_id) {
    return { ok: false, status: 404, reasonCode: "not_found", message: "No such filing." };
  }
  const assignment = assignmentFor(input.agent, row.organization_id);
  if (!assignment || row.agent_id !== input.agent.agentId) {
    return { ok: false, status: 404, reasonCode: "not_found", message: "No such filing." };
  }
  if (assignment.role !== "lead") {
    return { ok: false, status: 403, reasonCode: "forbidden", message: "Only the lead can release a round." };
  }
  const policy = await sql.get<{ mode: string }>("SELECT mode FROM social_agent_policies WHERE organization_id = ?", [row.organization_id]);
  const mode = policy?.mode === "observe" || policy?.mode === "draft" || policy?.mode === "schedule_approved" || policy?.mode === "managed" ? policy.mode : "draft";
  if (mode !== "schedule_approved" && mode !== "managed") {
    return { ok: false, status: 403, reasonCode: "policy_mode", message: "This client still waits for a person to release the round." };
  }
  const batch = row.batch_id
    ? await sql.get<{ held_at: number | null; released_at: number | null }>("SELECT held_at, released_at FROM batches WHERE id = ?", [row.batch_id])
    : undefined;
  const held = Boolean(batch && batch.held_at != null && batch.released_at == null && row.released_at == null);
  if (!held || !row.deliverable_id || row.deliverable_version == null) {
    return { ok: false, status: 409, reasonCode: "not_held", message: "That round is not held." };
  }
  const deliverableId = row.deliverable_id;
  const publishedVersion = row.deliverable_version;
  const others = row.batch_id
    ? await sql.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM agent_work_items
         WHERE batch_id = ? AND id != ? AND state = 'filed' AND released_at IS NULL AND retracted_at IS NULL`,
        [row.batch_id, row.id],
      )
    : undefined;
  const writes: { statement: string; params: unknown[] }[] = [
    {
      statement: "UPDATE agent_work_items SET released_at = ?, updated_at = ? WHERE id = ?",
      params: [input.now, input.now, row.id],
    },
  ];
  if (row.batch_id && (others?.n ?? 0) === 0) {
    writes.push({
      statement: "UPDATE batches SET released_at = ? WHERE id = ? AND released_at IS NULL",
      params: [input.now, row.batch_id],
    });
  }
  writes.push(
    {
      statement: `UPDATE deliverables SET published_version = ?, version = MAX(version, ?), published_at = ?, status = 'in_review', updated_at = ? WHERE id = ?`,
      params: [publishedVersion, publishedVersion, input.now, input.now, deliverableId],
    },
    {
      statement: `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
        VALUES (?, ?, ?, ?, 'deliverable_published', 'agent', ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        row.organization_id,
        row.project_id,
        row.workspace_id,
        input.agent.agentId,
        `${row.title} (v${publishedVersion}) is released to the client space.`,
        JSON.stringify({ deliverable_id: deliverableId, version: publishedVersion, work_item_id: row.id, approved: false }),
        input.now,
      ],
    },
  );
  await sql.batch(writes);
  const org = await sql.get<{ client_update_mode: string | null }>("SELECT client_update_mode FROM organizations WHERE id = ?", [row.organization_id]);
  if (org?.client_update_mode === "auto") {
    const sent = await sql.get<{ deliverable_id: string }>("SELECT deliverable_id FROM deliverable_notices WHERE deliverable_id = ? AND version = ?", [deliverableId, publishedVersion]);
    if (!sent) {
      await sql.run("INSERT INTO deliverable_notices (deliverable_id, version, sent_at) VALUES (?, ?, ?)", [deliverableId, publishedVersion, input.now]);
      await queueProductEvent(sql, { kind: "deliverable.published", deliverableId, version: publishedVersion, title: row.title }, input.now);
    }
  }
  return { ok: true, deliverableId, publishedVersion };
}

// ---------- Withdraw ----------

export type WithdrawResult =
  | { ok: true; workItemId: string; batchId: string | null; wasReleased: boolean }
  | { ok: false; status: 403 | 404 | 409; message: string };

/**
 * Withdraws one filing. An agent (its own, or the lead for any on its client) only while it is held: the batch is
 * discarded and its deliverable items dropped. Client Services may also withdraw a released filing, or one filed before
 * the hold shipped: the batch is hidden from the client (staff still see the record).
 */
export async function withdrawFiling(
  sql: Sql,
  input: { id: string; by: { kind: "agent"; agent: AgentPrincipal } | { kind: "client_services" }; reason: string | null; now: number },
): Promise<WithdrawResult> {
  const row = await sql.get<{
    id: string; agent_id: string; organization_id: string | null; workspace_id: string | null; project_id: string | null; task_id: string | null;
    state: string; title: string; batch_id: string | null; retracted_at: number | null; released_at: number | null; deliverable_id: string | null;
    deliverable_version: number | null;
  }>(
    `SELECT id, agent_id, organization_id, workspace_id, project_id, task_id, state, title, batch_id, retracted_at, released_at, deliverable_id,
            deliverable_version FROM agent_work_items WHERE id = ?`,
    [input.id],
  );
  if (!row || row.state !== "filed" || !row.organization_id) return { ok: false, status: 404, message: "No such filing." };
  const batch = row.batch_id
    ? await sql.get<{ held_at: number | null; released_at: number | null }>("SELECT held_at, released_at FROM batches WHERE id = ?", [row.batch_id])
    : undefined;
  const held = Boolean(batch && batch.held_at != null && batch.released_at == null && row.released_at == null);
  const actorKind = input.by.kind === "agent" ? "agent" : "system";
  let actorId = "client-services";
  if (input.by.kind === "agent") {
    const agent = input.by.agent;
    const on = agent.assignments.find((assignment) => assignment.organizationId === row.organization_id);
    if (!on) return { ok: false, status: 404, message: "No such filing." };
    if (row.agent_id !== agent.agentId && on.role !== "lead") return { ok: false, status: 403, message: "Another agent filed that. Ask the lead agent." };
    if (row.retracted_at != null) return { ok: true, workItemId: row.id, batchId: row.batch_id, wasReleased: false };
    if (!held) {
      return {
        ok: false,
        status: 409,
        message: "That filing is already visible to the client (released, or filed before the hold). File a corrected version with supersedes, or ask Client Services to withdraw it.",
      };
    }
    actorId = agent.agentId;
  } else {
    if (row.retracted_at != null) return { ok: true, workItemId: row.id, batchId: row.batch_id, wasReleased: !held };
  }
  const reason = input.reason?.trim().slice(0, 1000) || null;
  const writes: Write[] = [
    { statement: "UPDATE agent_work_items SET retracted_at = ?, retract_reason = ?, updated_at = ? WHERE id = ?", params: [input.now, reason, input.now, row.id] },
  ];
  if (row.batch_id) {
    writes.push(held
      ? { statement: "UPDATE batches SET hidden_at = COALESCE(hidden_at, ?), discarded_at = COALESCE(discarded_at, ?) WHERE id = ?", params: [input.now, input.now, row.batch_id] }
      : { statement: "UPDATE batches SET hidden_at = COALESCE(hidden_at, ?) WHERE id = ?", params: [input.now, row.batch_id] });
  }
  if (held && row.deliverable_id) {
    writes.push({ statement: "DELETE FROM deliverable_items WHERE work_item_id = ? AND deliverable_id = ?", params: [row.id, row.deliverable_id] });
  }
  writes.push(activity({
    organizationId: row.organization_id, projectId: row.project_id, workspaceId: row.workspace_id, kind: "client_agent.work_withdrawn",
    actorKind, actorId, body: `Withdrew "${row.title}"${held ? " (held, never shown to the client)" : " (hidden from the client)"}.${reason ? ` ${reason}` : ""}`,
    data: { work_item_id: row.id, batch_id: row.batch_id, task_id: row.task_id, was_released: !held, reason }, now: input.now,
  }));
  await sql.batch(writes);
  // The deliverable's open version falls back when the withdrawn filing was its only one.
  if (held && row.deliverable_id && row.deliverable_version != null) {
    const left = await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_items WHERE deliverable_id = ? AND version = ?", [row.deliverable_id, row.deliverable_version]);
    const deliverable = await sql.get<{ version: number; published_version: number | null }>("SELECT version, published_version FROM deliverables WHERE id = ?", [row.deliverable_id]);
    if (!left?.n && deliverable && deliverable.version === row.deliverable_version && row.deliverable_version > 1) {
      const back = await sql.get<{ v: number | null }>("SELECT MAX(version) AS v FROM deliverable_items WHERE deliverable_id = ?", [row.deliverable_id]);
      const version = Math.max(Number(back?.v ?? 1), deliverable.published_version ?? 1);
      await sql.run("UPDATE deliverables SET version = ?, status = CASE WHEN published_version = ? THEN 'in_review' ELSE status END, updated_at = ? WHERE id = ?", [version, version, input.now, row.deliverable_id]);
    }
  }
  return { ok: true, workItemId: row.id, batchId: row.batch_id, wasReleased: !held };
}

// ---------- Listing for Client Services ----------

export type FilingRow = {
  id: string; agent_id: string; title: string; kind: string; organization_id: string; task_id: string | null; batch_id: string | null;
  space_slug: string | null; filed_at: string | null; visibility: "held" | "released" | "superseded" | "withdrawn" | "published";
  superseded_by: string | null; deliverable_id: string | null; deliverable_version: number | null; work_request_id: string | null; paths: string[];
};

/**
 * Filings of one client (or all), newest first. loose: only held filings on no card, which no review will release:
 * ask the agent to file them again on a card with supersedes, or withdraw them.
 */
export async function listFilings(
  sql: Sql,
  input: { organizationId?: string | null; loose?: boolean; taskId?: string | null; limit?: number },
): Promise<FilingRow[]> {
  const rows = await sql.all<{
    id: string; agent_id: string; title: string; kind: string; organization_id: string; task_id: string | null; batch_id: string | null;
    space_slug: string | null; filed_at: number | null; held_at: number | null; released_at: number | null; retracted_at: number | null;
    superseded_by: string | null; deliverable_id: string | null; deliverable_version: number | null; work_request_id: string | null; paths_json: string;
  }>(
    `SELECT i.id, i.agent_id, i.title, i.kind, i.organization_id, i.task_id, i.batch_id, w.slug AS space_slug, i.filed_at, b.held_at,
            i.released_at, i.retracted_at, i.superseded_by, i.deliverable_id, i.deliverable_version, i.work_request_id, i.paths_json
     FROM agent_work_items i LEFT JOIN batches b ON b.id = i.batch_id LEFT JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.state = 'filed' AND (? IS NULL OR i.organization_id = ?) AND (? IS NULL OR i.task_id = ?)
       AND (? = 0 OR (i.task_id IS NULL AND b.held_at IS NOT NULL AND i.released_at IS NULL AND i.retracted_at IS NULL AND i.superseded_by IS NULL))
     ORDER BY i.filed_at DESC LIMIT ?`,
    [
      input.organizationId ?? null, input.organizationId ?? null, input.taskId ?? null, input.taskId ?? null, input.loose ? 1 : 0,
      Math.min(Math.max(input.limit ?? 100, 1), 200),
    ],
  );
  return rows.map((row) => ({
    id: row.id, agent_id: row.agent_id, title: row.title, kind: row.kind, organization_id: row.organization_id, task_id: row.task_id,
    batch_id: row.batch_id, space_slug: row.space_slug, filed_at: row.filed_at == null ? null : new Date(row.filed_at).toISOString(),
    visibility: row.retracted_at != null ? "withdrawn" : row.superseded_by ? "superseded" : row.released_at != null ? "released" : row.held_at != null ? "held" : "published",
    superseded_by: row.superseded_by, deliverable_id: row.deliverable_id, deliverable_version: row.deliverable_version,
    work_request_id: row.work_request_id, paths: (() => {
      try {
        const value = JSON.parse(row.paths_json) as unknown;
        return Array.isArray(value) ? value.filter((path): path is string => typeof path === "string") : [];
      } catch {
        return [];
      }
    })(),
  }));
}

// ---------- Mark delivered (Client Services) ----------

export type MarkDeliveredResult =
  | { ok: true; deliverableId: string; already: boolean; version: number | null }
  | { ok: false; status: 404 | 409; message: string };

/**
 * Client Services marks a published deliverable as delivered (approved) without a client update: for work that was
 * finished before it was filed and went out as in_review. Only a deliverable that is in_review with a published
 * version and no held filing waiting. Approved already is a no-op. Posts no notice and sends no email.
 */
export async function markDelivered(
  sql: Sql,
  input: { deliverableId: string; reason: string | null; now: number },
): Promise<MarkDeliveredResult> {
  const row = await sql.get<{ id: string; title: string; status: string; published_version: number | null; organization_id: string; project_id: string | null; workspace_id: string }>(
    "SELECT id, title, status, published_version, organization_id, project_id, workspace_id FROM deliverables WHERE id = ?",
    [input.deliverableId],
  );
  if (!row) return { ok: false, status: 404, message: "No such deliverable." };
  if (row.status === "approved") return { ok: true, deliverableId: row.id, already: true, version: row.published_version };
  if (row.status !== "in_review" || row.published_version == null) {
    return { ok: false, status: 409, message: `Only a published deliverable waiting for a look can be marked delivered (this one is ${row.status}${row.published_version == null ? ", never published" : ""}).` };
  }
  const held = await sql.get<{ id: string }>(
    `SELECT id FROM agent_work_items WHERE deliverable_id = ? AND state = 'filed' AND released_at IS NULL AND retracted_at IS NULL AND superseded_by IS NULL LIMIT 1`,
    [row.id],
  );
  if (held) return { ok: false, status: 409, message: "A newer filing is still held for review. Approve or withdraw it first." };
  await sql.batch([
    { statement: "UPDATE deliverables SET status = 'approved', updated_at = ? WHERE id = ? AND status = 'in_review'", params: [input.now, row.id] },
    {
      statement: "UPDATE deliverable_items SET status = 'approved' WHERE deliverable_id = ? AND version = ? AND status = 'pending'",
      params: [row.id, row.published_version],
    },
    activity({
      organizationId: row.organization_id, projectId: row.project_id, workspaceId: row.workspace_id, kind: "deliverable_marked_delivered",
      actorKind: "system", actorId: "client-services",
      body: `${row.title} (v${row.published_version}) marked delivered by Client Services (no client update).${input.reason ? ` ${input.reason}` : ""}`,
      data: { deliverable_id: row.id, version: row.published_version, reason: input.reason }, now: input.now,
    }),
  ]);
  return { ok: true, deliverableId: row.id, already: false, version: row.published_version };
}
