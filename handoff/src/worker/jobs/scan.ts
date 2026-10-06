import { createHash } from "node:crypto";
import type { Sql } from "@/db/sql";
import { decideScan, type ClamdResult, type ScanDecision } from "@/lib/scan";
import type { ObjectStore } from "@/lib/store/objects";

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new ArrayBuffer(bytes.byteLength);
  const owned = new Uint8Array(copy);
  owned.set(bytes);
  return owned;
}

export type ClaimedFile = {
  id: string;
  batchId: string;
  workspaceId: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  objectKey: string;
  tag: string;
  scanAttempts: number;
};

type FileRow = {
  id: string;
  batch_id: string;
  workspace_id: string;
  relative_path: string;
  extension: string;
  size_bytes: number;
  object_key: string;
  tag: string;
  scan_attempts: number;
};

function locked(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /database is locked|SQLITE_BUSY/i.test(message);
}

function present(row: FileRow): ClaimedFile {
  return {
    id: row.id,
    batchId: row.batch_id,
    workspaceId: row.workspace_id,
    relativePath: row.relative_path,
    extension: row.extension,
    sizeBytes: row.size_bytes,
    objectKey: row.object_key,
    tag: row.tag,
    scanAttempts: row.scan_attempts,
  };
}

/** One UPDATE so D1 does not need SQL BEGIN. A second worker updates zero rows. */
export async function claimUploadedFile(sql: Sql, now: number): Promise<ClaimedFile | null> {
  try {
    const updated = await sql.get<FileRow>(
      `UPDATE files SET status = 'scanning', scan_attempts = scan_attempts + 1
       WHERE id = (
         SELECT id FROM files
         WHERE status = 'uploaded' AND (next_scan_at IS NULL OR next_scan_at <= ?)
         ORDER BY COALESCE(uploaded_at, created_at)
         LIMIT 1
       ) AND status = 'uploaded'
       RETURNING id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, scan_attempts`,
      [now],
    );
    return updated ? present(updated) : null;
  } catch (error) {
    if (locked(error)) return null;
    throw error;
  }
}

async function audit(
  sql: Sql,
  file: ClaimedFile,
  action: string,
  at: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  await sql.run(
    `INSERT INTO audit_events (
      id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata
    ) VALUES (?, ?, NULL, ?, 'file', ?, ?, ?)`,
    [crypto.randomUUID(), file.workspaceId, action, file.id, at, JSON.stringify(metadata)],
  );
}

/** One storage read feeds the hash, the header, and the clamd stream. */
export async function scanClaimedFile(input: {
  sql: Sql;
  store: ObjectStore;
  file: ClaimedFile;
  now: number;
  allowUnscanned: boolean;
  scanBytes: (bytes: Uint8Array) => Promise<ClamdResult>;
}): Promise<ScanDecision> {
  const bytes = await input.store.read(input.file.objectKey);
  let clamd: ClamdResult;
  let sha256: string | null = null;
  let header = new Uint8Array();
  if (!bytes) {
    clamd = { kind: "error", detail: "That file hasn't finished uploading yet." };
  } else {
    const owned = copyBytes(bytes);
    sha256 = createHash("sha256").update(owned).digest("hex");
    header = owned.subarray(0, 16);
    clamd = await input.scanBytes(owned);
  }
  const decision = decideScan({
    extension: input.file.extension,
    header,
    clamd,
    attempts: input.file.scanAttempts,
    allowUnscanned: input.allowUnscanned,
  });
  const reason = "reason" in decision ? decision.reason : clamd.kind === "error" ? clamd.detail : null;
  const metadata: Record<string, unknown> = {
    relativePath: input.file.relativePath,
    sizeBytes: input.file.sizeBytes,
    tag: input.file.tag,
    sha256,
  };
  if (reason) metadata.reason = reason;

  if (decision.status === "retry") {
    await input.sql.run(
      `UPDATE files
       SET status = 'uploaded', sha256 = ?, scan_reason = ?, next_scan_at = ?
       WHERE id = ? AND status = 'scanning'`,
      [sha256, reason, input.now + decision.delaySeconds * 1000, input.file.id],
    );
  } else {
    await input.sql.run(
      `UPDATE files
       SET status = ?, sha256 = ?, scan_reason = ?, scanned_at = ?, next_scan_at = NULL
       WHERE id = ? AND status = 'scanning'`,
      [decision.status, sha256, reason, input.now, input.file.id],
    );
  }
  await audit(input.sql, input.file, "file.scanned", input.now, metadata);
  if (decision.status === "held") {
    await audit(input.sql, input.file, "file.held", input.now, metadata);
  }
  return decision;
}
