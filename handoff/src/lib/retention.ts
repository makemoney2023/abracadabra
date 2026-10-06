import { workspacesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import { can, type Caller } from "@/lib/authz";
import { signFileLink } from "@/lib/downloads";
import { queueProductEvent } from "@/lib/notifications";
import { LIMITS } from "@/lib/policy/limits";
import type { ObjectStore } from "@/lib/store/objects";

const NOT_FOUND = "We couldn't find that.";
const REFUSED = "You can't do that.";
const INACTIVE = "This space is closed.";
const STILL_ACTIVE = "This space is still open.";
const ALREADY_PURGED = "This space has already been deleted.";
const REASON_REQUIRED = "Please tell us why.";
const REASON_LONG = "Your reason is too long. Keep it under 2,000 characters.";
const LINKS_OFF = "File links aren't set up yet.";
const DAY_MS = 24 * 60 * 60 * 1000;

export type WorkspaceExportFile = {
  relativePath: string;
  sizeBytes: number;
  sha256: string | null;
  status: string;
  url?: string;
};

export type WorkspaceExportDocument = {
  slug: string;
  workspaceId: string;
  batches: Array<{
    batchId: string;
    label: string | null;
    files: WorkspaceExportFile[];
  }>;
};

type WorkspaceGate = {
  id: string;
  status: string;
  retention_days: number;
  purge_after: number | null;
  purged_at: number | null;
};

/** Archives a visible workspace and emails owners and operators with the purge date. */
export async function archiveWorkspace(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  now: number;
}): Promise<{ ok: true; purgeAfter: number } | { ok: false; status: number; message: string }> {
  const seen = await visibleWorkspace(input.sql, input.caller, input.workspaceId);
  if (!seen) return { ok: false, status: 404, message: NOT_FOUND };
  if (!can(input.caller, "workspace.archive", { workspaceId: seen.id })) {
    return { ok: false, status: 403, message: REFUSED };
  }
  const row = await loadGate(input.sql, seen.id);
  if (!row) return { ok: false, status: 404, message: NOT_FOUND };
  if (row.status !== "active") return { ok: false, status: 409, message: INACTIVE };
  const purgeAfter = input.now + row.retention_days * DAY_MS;
  await input.sql.run(
    `UPDATE workspaces
     SET status = 'archived', archived_at = ?, purge_after = ?
     WHERE id = ? AND status = 'active'`,
    [input.now, purgeAfter, row.id],
  );
  await input.sql.run(
    `INSERT INTO audit_events (id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata)
     VALUES (?, ?, ?, 'workspace.archived', 'workspace', ?, ?, ?)`,
    [
      crypto.randomUUID(),
      row.id,
      input.caller.userId,
      row.id,
      input.now,
      JSON.stringify({ purgeAfter, retentionDays: row.retention_days }),
    ],
  );
  await queueProductEvent(input.sql, { kind: "workspace.archived", workspaceId: row.id }, input.now);
  return { ok: true, purgeAfter };
}

/** One JSON document for every batch. Clean files get a 24-hour link. */
export async function exportWorkspace(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  origin: string;
  now: number;
}): Promise<{ ok: true; document: WorkspaceExportDocument } | { ok: false; status: number; message: string }> {
  const seen = await visibleWorkspace(input.sql, input.caller, input.workspaceId);
  if (!seen) return { ok: false, status: 404, message: NOT_FOUND };
  if (!can(input.caller, "workspace.export", { workspaceId: seen.id }) || !input.caller.userId) {
    return { ok: false, status: 403, message: REFUSED };
  }
  const secret = process.env.HANDOFF_SIGNING_SECRET?.trim() ?? "";
  if (!secret) return { ok: false, status: 503, message: LINKS_OFF };
  const workspace = await input.sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [seen.id]);
  if (!workspace) return { ok: false, status: 404, message: NOT_FOUND };
  const batches = await input.sql.all<{ id: string; label: string | null }>(
    `SELECT id, label FROM batches
     WHERE workspace_id = ? AND deleted_at IS NULL
     ORDER BY created_at, id`,
    [seen.id],
  );
  const exp = Math.floor(input.now / 1000) + LIMITS.workspaceExportTtlSeconds;
  const document: WorkspaceExportDocument = { slug: workspace.slug, workspaceId: seen.id, batches: [] };
  let fileCount = 0;
  let cleanCount = 0;
  for (const batch of batches) {
    const rows = await input.sql.all<{
      id: string;
      relative_path: string;
      size_bytes: number;
      sha256: string | null;
      status: string;
    }>(
      `SELECT id, relative_path, size_bytes, sha256, status
       FROM files WHERE batch_id = ? AND workspace_id = ?
       ORDER BY relative_path`,
      [batch.id, seen.id],
    );
    const files: WorkspaceExportFile[] = [];
    for (const row of rows) {
      const file: WorkspaceExportFile = {
        relativePath: row.relative_path,
        sizeBytes: row.size_bytes,
        sha256: row.sha256,
        status: row.status,
      };
      if (row.status === "clean") {
        file.url = await signFileLink(input.origin, row.id, exp, secret);
        cleanCount += 1;
      }
      files.push(file);
      fileCount += 1;
    }
    document.batches.push({ batchId: batch.id, label: batch.label, files });
  }
  await input.sql.run(
    `INSERT INTO audit_events (id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata)
     VALUES (?, ?, ?, 'workspace.exported', 'workspace', ?, ?, ?)`,
    [
      crypto.randomUUID(),
      seen.id,
      input.caller.userId,
      seen.id,
      input.now,
      JSON.stringify({ batchCount: batches.length, fileCount, cleanCount }),
    ],
  );
  return { ok: true, document };
}

/** Deletes workspace objects and engagement rows. An active workspace is refused. */
export async function purgeWorkspace(input: {
  sql: Sql;
  caller: Caller | null;
  store: ObjectStore;
  workspaceId: string;
  reason: string | null;
  now: number;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (input.caller) {
    const seen = await visibleWorkspace(input.sql, input.caller, input.workspaceId);
    if (!seen) return { ok: false, status: 404, message: NOT_FOUND };
    if (!can(input.caller, "workspace.purge", { workspaceId: seen.id })) {
      return { ok: false, status: 403, message: REFUSED };
    }
  }
  const row = await loadGate(input.sql, input.workspaceId);
  if (!row) return { ok: false, status: 404, message: NOT_FOUND };
  if (row.status === "active") return { ok: false, status: 409, message: STILL_ACTIVE };
  if (row.status === "purged" || row.purged_at !== null) {
    return { ok: false, status: 409, message: ALREADY_PURGED };
  }
  if (row.status !== "archived") return { ok: false, status: 409, message: STILL_ACTIVE };
  const due = row.purge_after !== null && row.purge_after <= input.now;
  const reason = (input.reason ?? "").trim();
  if (!due) {
    if (!input.caller) return { ok: false, status: 409, message: STILL_ACTIVE };
    if (!reason) return { ok: false, status: 422, message: REASON_REQUIRED };
  }
  if (reason.length > LIMITS.maxNoteChars) return { ok: false, status: 422, message: REASON_LONG };
  await deleteWorkspaceContents(input.sql, input.store, row.id, input.now, input.caller?.userId ?? null, reason);
  return { ok: true };
}

/** Emails owners and operators when purge is inside the seven-day lead, including the boundary. */
export async function queuePurgeReminders(sql: Sql, now: number): Promise<number> {
  const rows = await sql.all<{ id: string }>(
    `SELECT id FROM workspaces
     WHERE status = 'archived'
       AND purged_at IS NULL
       AND purge_after IS NOT NULL
       AND purge_after > ?
       AND purge_after <= ?`,
    [now, now + LIMITS.purgeReminderLeadMs],
  );
  let queued = 0;
  for (const row of rows) {
    const before = await countEvent(sql, row.id);
    await queueProductEvent(sql, { kind: "workspace.purge_scheduled", workspaceId: row.id }, now);
    queued += (await countEvent(sql, row.id)) - before;
  }
  return queued;
}

async function visibleWorkspace(sql: Sql, caller: Caller, workspaceId: string) {
  const visible = await workspacesFor(sql, caller);
  return visible.find((row) => row.id === workspaceId);
}

async function loadGate(sql: Sql, workspaceId: string): Promise<WorkspaceGate | undefined> {
  return sql.get<WorkspaceGate>(
    "SELECT id, status, retention_days, purge_after, purged_at FROM workspaces WHERE id = ?",
    [workspaceId],
  );
}

async function countEvent(sql: Sql, workspaceId: string): Promise<number> {
  const row = await sql.get<{ n: number }>(
    "SELECT count(*) AS n FROM notifications WHERE workspace_id = ? AND event = 'workspace.purge_scheduled'",
    [workspaceId],
  );
  return Number(row?.n ?? 0);
}

async function deleteWorkspaceContents(
  sql: Sql,
  store: ObjectStore,
  workspaceId: string,
  now: number,
  actorUserId: string | null,
  reason: string,
): Promise<void> {
  const files = await sql.all<{ object_key: string; size_bytes: number; object_deleted_at: number | null }>(
    "SELECT object_key, size_bytes, object_deleted_at FROM files WHERE workspace_id = ?",
    [workspaceId],
  );
  let bytes = 0;
  for (const file of files) {
    if (file.object_deleted_at !== null) continue;
    await store.remove(file.object_key);
    bytes += file.size_bytes;
  }
  const fileCount = await countTable(sql, "files", workspaceId);
  const batchCount = await countTable(sql, "batches", workspaceId);
  const requestCount = await countTable(sql, "requests", workspaceId);
  const inviteCount = await countTable(sql, "invites", workspaceId);
  const membershipCount = await countTable(sql, "memberships", workspaceId);
  await sql.run("DELETE FROM files WHERE workspace_id = ?", [workspaceId]);
  await sql.run("DELETE FROM batches WHERE workspace_id = ?", [workspaceId]);
  await sql.run("DELETE FROM requests WHERE workspace_id = ?", [workspaceId]);
  await sql.run("DELETE FROM invites WHERE workspace_id = ?", [workspaceId]);
  await sql.run("DELETE FROM memberships WHERE workspace_id = ?", [workspaceId]);
  await sql.run(
    "UPDATE workspaces SET status = 'purged', purged_at = ? WHERE id = ? AND purged_at IS NULL",
    [now, workspaceId],
  );
  const metadata: Record<string, string | number> = {
    fileCount,
    batchCount,
    requestCount,
    inviteCount,
    membershipCount,
    bytes,
  };
  if (reason) metadata.reason = reason;
  await sql.run(
    `INSERT INTO audit_events (id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata)
     VALUES (?, ?, ?, 'workspace.purged', 'workspace', ?, ?, ?)`,
    [crypto.randomUUID(), workspaceId, actorUserId, workspaceId, now, JSON.stringify(metadata)],
  );
}

async function countTable(sql: Sql, table: "files" | "batches" | "requests" | "invites" | "memberships", workspaceId: string) {
  const row = await sql.get<{ n: number }>(`SELECT count(*) AS n FROM ${table} WHERE workspace_id = ?`, [workspaceId]);
  return Number(row?.n ?? 0);
}
