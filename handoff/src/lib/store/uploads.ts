import { isBatchActive } from "@/lib/batches";
import type { Caller } from "@/lib/authz";
import { recordFileUploaded } from "@/db/crm";
import { workspacesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import type { ObjectStore } from "@/lib/store/objects";

const REFUSED = "You can't do that.";
const INACTIVE = "That upload is closed.";
const NOT_OPEN = "That file can't be uploaded right now.";
const NOT_STORED = "That file hasn't finished uploading yet.";
const SIZE_MISMATCH = "The saved file size doesn't match the list.";
const WRITABLE = new Set(["pending", "uploading", "failed"]);

type FileRow = {
  id: string;
  batch_id: string;
  workspace_id: string;
  relative_path: string;
  object_key: string;
  status: string;
  size_bytes: number;
  created_at: number;
  last_activity_at: number;
  discarded_at: number | null;
  deleted_at: number | null;
  uploaded_at: number | null;
  next_scan_at: number | null;
  scan_reason: string | null;
};

async function loadFile(sql: Sql, batchId: string, fileId: string): Promise<FileRow | undefined> {
  return sql.get<FileRow>(
    `SELECT f.id, f.batch_id, f.workspace_id, f.relative_path, f.object_key, f.status, f.size_bytes,
            b.created_at, b.last_activity_at, b.discarded_at, b.deleted_at,
            f.uploaded_at, f.next_scan_at, f.scan_reason
     FROM files f
     JOIN batches b ON b.id = f.batch_id
     WHERE f.id = ? AND f.batch_id = ?`,
    [fileId, batchId],
  );
}

async function memberWrite(sql: Sql, caller: Caller, workspaceId: string): Promise<"ok" | "missing" | "refused"> {
  if (!caller.userId) return "missing";
  const visible = await workspacesFor(sql, caller);
  if (!visible.some((row) => row.id === workspaceId)) return "missing";
  const member = await sql.get<{ ok: number }>(
    "SELECT 1 AS ok FROM memberships WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL",
    [workspaceId, caller.userId],
  );
  return member ? "ok" : "refused";
}

function active(row: FileRow, now: number): boolean {
  if (row.discarded_at !== null || row.deleted_at !== null) return false;
  return isBatchActive(new Date(row.created_at), new Date(row.last_activity_at), new Date(now));
}

export type UploadFile = {
  id: string;
  objectKey: string;
  status: string;
  sizeBytes: number;
  uploadedAt: number | null;
  nextScanAt: number | null;
  scanReason: string | null;
};

function present(row: FileRow): UploadFile {
  return {
    id: row.id,
    objectKey: row.object_key,
    status: row.status,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    nextScanAt: row.next_scan_at,
    scanReason: row.scan_reason,
  };
}

/** HND-026. A grant refreshes the batch window and opens the object for bytes. */
export async function grantUpload(input: {
  sql: Sql;
  caller: Caller;
  batchId: string;
  fileId: string;
  now: number;
}): Promise<{ ok: true; status: 200; file: UploadFile } | { ok: false; status: number; message: string }> {
  const row = await loadFile(input.sql, input.batchId, input.fileId);
  if (!row || row.object_key !== `${row.workspace_id}/${row.batch_id}/${row.id}`) {
    return { ok: false, status: 404, message: "We couldn't find that." };
  }
  const access = await memberWrite(input.sql, input.caller, row.workspace_id);
  if (access === "missing") return { ok: false, status: 404, message: "We couldn't find that." };
  if (access === "refused") return { ok: false, status: 403, message: REFUSED };
  if (!WRITABLE.has(row.status)) return { ok: false, status: 409, message: NOT_OPEN };
  if (!active(row, input.now)) return { ok: false, status: 409, message: INACTIVE };

  await input.sql.exec("BEGIN");
  try {
    await input.sql.run("UPDATE batches SET last_activity_at = ? WHERE id = ?", [input.now, row.batch_id]);
    await input.sql.run(
      "UPDATE files SET status = 'uploading' WHERE id = ? AND status IN ('pending', 'uploading', 'failed')",
      [row.id],
    );
    await input.sql.exec("COMMIT");
  } catch (error) {
    await input.sql.exec("ROLLBACK");
    throw error;
  }
  const next = await loadFile(input.sql, input.batchId, input.fileId);
  if (!next) return { ok: false, status: 404, message: "We couldn't find that." };
  return { ok: true, status: 200, file: present(next) };
}

/** HND-027. Size comes from stored object metadata, not from the request body. */
export async function completeUpload(input: {
  sql: Sql;
  caller: Caller;
  store: ObjectStore;
  batchId: string;
  fileId: string;
  now: number;
}): Promise<{ ok: true; status: 200; file: UploadFile } | { ok: false; status: number; message: string }> {
  const row = await loadFile(input.sql, input.batchId, input.fileId);
  if (!row || row.object_key !== `${row.workspace_id}/${row.batch_id}/${row.id}`) {
    return { ok: false, status: 404, message: "We couldn't find that." };
  }
  const access = await memberWrite(input.sql, input.caller, row.workspace_id);
  if (access === "missing") return { ok: false, status: 404, message: "We couldn't find that." };
  if (access === "refused") return { ok: false, status: 403, message: REFUSED };
  if (row.status === "uploaded") return { ok: true, status: 200, file: present(row) };
  if (!WRITABLE.has(row.status)) return { ok: false, status: 409, message: NOT_OPEN };
  if (!active(row, input.now)) return { ok: false, status: 409, message: INACTIVE };

  const stored = await input.store.stat(row.object_key);
  if (!stored) return { ok: false, status: 409, message: NOT_STORED };
  if (stored.sizeBytes !== row.size_bytes) {
    await input.store.remove(row.object_key);
    await input.sql.run(
      "UPDATE files SET status = 'failed', scan_reason = ? WHERE id = ? AND status IN ('pending', 'uploading', 'failed')",
      [SIZE_MISMATCH, row.id],
    );
    const failed = await loadFile(input.sql, input.batchId, input.fileId);
    if (!failed) return { ok: false, status: 404, message: "We couldn't find that." };
    return { ok: true, status: 200, file: present(failed) };
  }

  await input.sql.exec("BEGIN");
  try {
    await input.sql.run(
      `UPDATE files
       SET status = 'uploaded', uploaded_at = ?, next_scan_at = ?, scan_reason = NULL
       WHERE id = ? AND status IN ('pending', 'uploading', 'failed')`,
      [input.now, input.now, row.id],
    );
    const queued = await input.sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM audit_events WHERE action = 'file.uploaded' AND subject_id = ?",
      [row.id],
    );
    if ((queued?.n ?? 0) === 0) {
      await input.sql.run(
        `INSERT INTO audit_events (
          id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata
        ) VALUES (?, ?, ?, 'file.uploaded', 'file', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          row.workspace_id,
          input.caller.userId,
          row.id,
          input.now,
          JSON.stringify({ objectKey: row.object_key, sizeBytes: row.size_bytes }),
        ],
      );
    }
    await input.sql.run("UPDATE batches SET last_activity_at = ? WHERE id = ?", [input.now, row.batch_id]);
    await recordFileUploaded(input.sql, {
      workspaceId: row.workspace_id,
      fileId: row.id,
      relativePath: row.relative_path,
      actorId: input.caller.userId,
      now: input.now,
    });
    await input.sql.exec("COMMIT");
  } catch (error) {
    await input.sql.exec("ROLLBACK");
    throw error;
  }
  const done = await loadFile(input.sql, input.batchId, input.fileId);
  if (!done) return { ok: false, status: 404, message: "We couldn't find that." };
  return { ok: true, status: 200, file: present(done) };
}
