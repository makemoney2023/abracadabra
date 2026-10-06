import type { Sql } from "@/db/sql";
import { renderProductEmail, type ProductMailPayload } from "@/lib/email-templates";
import type { OutboundMail } from "@/lib/session";

export type ProductEvent =
  | { kind: "batch.ready"; batchId: string }
  | { kind: "file.flagged"; fileId: string; status: "rejected" | "held" }
  | { kind: "file.reviewed"; fileId: string; status: "released" | "rejected" }
  | { kind: "batch.window_failed"; batchId: string }
  | { kind: "request.digest"; workspaceId: string; weekStart: number }
  | { kind: "workspace.archived"; workspaceId: string }
  | { kind: "workspace.purge_scheduled"; workspaceId: string };

type WorkspaceRow = {
  id: string;
  display_name: string;
  slug: string;
  request_digest: number;
  purge_after: number | null;
};

type BatchRow = WorkspaceRow & {
  batch_id: string;
  label: string | null;
  title: string | null;
  created_by: string;
};

type FileRow = BatchRow & {
  file_id: string;
  scan_reason: string | null;
};

/** The first clean file in a named request marks that request received. Later calls keep the original time. */
export async function markRequestReceived(sql: Sql, fileId: string, now: number): Promise<void> {
  await sql.run(
    `UPDATE requests
     SET status = 'received', received_at = ?
     WHERE id = (
       SELECT batches.request_id
       FROM files
       JOIN batches ON batches.id = files.batch_id
       WHERE files.id = ?
         AND files.status = 'clean'
         AND batches.request_id IS NOT NULL
     )
     AND status = 'open'
     AND received_at IS NULL`,
    [now, fileId],
  );
}

/** Inserts one unsent row per recipient. A repeated key is ignored. */
export async function queueProductEvent(sql: Sql, event: ProductEvent, now: number): Promise<void> {
  void now;
  switch (event.kind) {
    case "batch.ready": {
      const batch = await loadBatch(sql, event.batchId);
      if (!batch) return;
      const count = await countWhere(sql, "SELECT count(*) AS n FROM files WHERE batch_id = ? AND status = 'clean'", [
        event.batchId,
      ]);
      await enqueueMany(sql, await operators(sql, batch.id), {
        workspaceId: batch.id,
        event: "batch.ready",
        key: (email) => `batch.ready:${event.batchId}:${email}`,
        payload: payloadFor(batch, { batchId: event.batchId, count }),
      });
      return;
    }
    case "file.flagged": {
      const file = await loadFile(sql, event.fileId);
      if (!file) return;
      const stored = event.status === "held" ? "file.held" : "file.rejected";
      const people = unique([...(await operators(sql, file.id)), await uploaderEmail(sql, file.batch_id)]);
      const count = await countWhere(sql, "SELECT count(*) AS n FROM files WHERE batch_id = ?", [file.batch_id]);
      await enqueueMany(sql, people, {
        workspaceId: file.id,
        event: stored,
        key: (email) => `${stored}:${event.fileId}:${email}`,
        payload: payloadFor(file, { batchId: file.batch_id, finding: file.scan_reason, count }),
      });
      return;
    }
    case "file.reviewed": {
      const file = await loadFile(sql, event.fileId);
      if (!file) return;
      const stored = event.status === "released" ? "file.released" : "file.rejected_from_held";
      await enqueueMany(sql, [await uploaderEmail(sql, file.batch_id)], {
        workspaceId: file.id,
        event: stored,
        key: (email) => `${stored}:${event.fileId}:${email}`,
        payload: payloadFor(file, { batchId: file.batch_id, finding: file.scan_reason }),
      });
      return;
    }
    case "batch.window_failed": {
      const batch = await loadBatch(sql, event.batchId);
      if (!batch) return;
      const count = await countWhere(
        sql,
        "SELECT count(*) AS n FROM files WHERE batch_id = ? AND status = 'failed'",
        [event.batchId],
      );
      await enqueueMany(sql, [await uploaderEmail(sql, event.batchId)], {
        workspaceId: batch.id,
        event: "batch.window_failed",
        key: (email) => `batch.window_failed:${event.batchId}:${email}`,
        payload: payloadFor(batch, { batchId: event.batchId, count }),
      });
      return;
    }
    case "request.digest": {
      const workspace = await loadWorkspace(sql, event.workspaceId);
      if (!workspace || workspace.request_digest !== 1) return;
      const count = await countWhere(
        sql,
        "SELECT count(*) AS n FROM requests WHERE workspace_id = ? AND status = 'open'",
        [event.workspaceId],
      );
      await enqueueMany(sql, await owners(sql, event.workspaceId), {
        workspaceId: event.workspaceId,
        event: "request.digest",
        key: (email) => `request.digest:${event.workspaceId}:${event.weekStart}:${email}`,
        payload: payloadFor(workspace, { count }),
      });
      return;
    }
    case "workspace.archived":
    case "workspace.purge_scheduled": {
      const workspace = await loadWorkspace(sql, event.workspaceId);
      if (!workspace) return;
      const people = unique([
        ...(await operators(sql, event.workspaceId)),
        ...(await owners(sql, event.workspaceId)),
      ]);
      await enqueueMany(sql, people, {
        workspaceId: event.workspaceId,
        event: event.kind,
        key: (email) => `${event.kind}:${event.workspaceId}:${email}`,
        payload: payloadFor(workspace, { purgeOn: purgeDate(workspace.purge_after) }),
      });
      return;
    }
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

/** Sends unsent rows. A refused message increments attempts and stays unsent. */
export async function deliverNotifications(
  sql: Sql,
  send: (mail: OutboundMail) => Promise<void>,
  now: number,
  origin: string,
): Promise<void> {
  const from = process.env.HANDOFF_FROM_EMAIL?.trim() ?? "";
  const rows = await sql.all<{ id: string; event: string; recipient_email: string; payload: string }>(
    `SELECT id, event, recipient_email, payload
     FROM notifications
     WHERE sent_at IS NULL
     ORDER BY idempotency_key`,
  );
  for (const row of rows) {
    try {
      if (from.length === 0) throw new Error("mail is not configured");
      const payload = JSON.parse(row.payload) as ProductMailPayload;
      await send(
        renderProductEmail({
          from,
          to: row.recipient_email,
          event: row.event,
          payload,
          origin,
        }),
      );
      await sql.run("UPDATE notifications SET sent_at = ? WHERE id = ? AND sent_at IS NULL", [now, row.id]);
    } catch {
      await sql.run("UPDATE notifications SET attempts = attempts + 1 WHERE id = ? AND sent_at IS NULL", [row.id]);
    }
  }
}

function payloadFor(
  workspace: { display_name: string; slug: string; title?: string | null; label?: string | null },
  extra: Partial<ProductMailPayload>,
): ProductMailPayload {
  return {
    displayName: workspace.display_name,
    slug: workspace.slug,
    title: workspace.title ?? null,
    label: workspace.label ?? null,
    ...extra,
  };
}

async function enqueueMany(
  sql: Sql,
  emails: Array<string | null>,
  input: {
    workspaceId: string;
    event: string;
    key: (email: string) => string;
    payload: ProductMailPayload;
  },
): Promise<void> {
  const payload = JSON.stringify(input.payload);
  for (const email of unique(emails)) {
    await sql.run(
      `INSERT OR IGNORE INTO notifications (
        id, workspace_id, event, recipient_email, idempotency_key, payload, sent_at, attempts
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`,
      [crypto.randomUUID(), input.workspaceId, input.event, email, input.key(email), payload],
    );
  }
}

function unique(emails: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const email of emails) {
    if (!email) continue;
    seen.add(email.toLowerCase());
  }
  return [...seen];
}

async function operators(sql: Sql, workspaceId: string): Promise<string[]> {
  const rows = await sql.all<{ email: string }>(
    `SELECT users.email AS email
     FROM workspace_operators
     JOIN users ON users.id = workspace_operators.user_id
     WHERE workspace_operators.workspace_id = ? AND workspace_operators.removed_at IS NULL`,
    [workspaceId],
  );
  return rows.map((row) => row.email);
}

async function owners(sql: Sql, workspaceId: string): Promise<string[]> {
  const rows = await sql.all<{ email: string }>(
    `SELECT email FROM memberships
     WHERE workspace_id = ? AND role = 'client_owner' AND revoked_at IS NULL`,
    [workspaceId],
  );
  return rows.map((row) => row.email);
}

async function uploaderEmail(sql: Sql, batchId: string): Promise<string | null> {
  const row = await sql.get<{ email: string }>(
    `SELECT users.email AS email
     FROM batches
     JOIN users ON users.id = batches.created_by
     WHERE batches.id = ?`,
    [batchId],
  );
  return row?.email ?? null;
}

function purgeDate(value: number | null): string | undefined {
  if (value === null) return undefined;
  return new Date(value).toISOString().slice(0, 10);
}

async function loadWorkspace(sql: Sql, workspaceId: string): Promise<WorkspaceRow | null> {
  return (
    (await sql.get<WorkspaceRow>(
      "SELECT id, display_name, slug, request_digest, purge_after FROM workspaces WHERE id = ?",
      [workspaceId],
    )) ?? null
  );
}

async function loadBatch(sql: Sql, batchId: string): Promise<BatchRow | null> {
  return (
    (await sql.get<BatchRow>(
      `SELECT workspaces.id, workspaces.display_name, workspaces.slug, workspaces.request_digest,
              batches.id AS batch_id, batches.label, batches.created_by, requests.title
       FROM batches
       JOIN workspaces ON workspaces.id = batches.workspace_id
       LEFT JOIN requests ON requests.id = batches.request_id
       WHERE batches.id = ?`,
      [batchId],
    )) ?? null
  );
}

async function loadFile(sql: Sql, fileId: string): Promise<FileRow | null> {
  return (
    (await sql.get<FileRow>(
      `SELECT workspaces.id, workspaces.display_name, workspaces.slug, workspaces.request_digest,
              batches.id AS batch_id, batches.label, batches.created_by, requests.title,
              files.id AS file_id, files.scan_reason
       FROM files
       JOIN batches ON batches.id = files.batch_id
       JOIN workspaces ON workspaces.id = files.workspace_id
       LEFT JOIN requests ON requests.id = batches.request_id
       WHERE files.id = ?`,
      [fileId],
    )) ?? null
  );
}

async function countWhere(sql: Sql, query: string, params: unknown[]): Promise<number> {
  const row = await sql.get<{ n: number }>(query, params);
  return Number(row?.n ?? 0);
}
