import { batchesFor, filesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import { can, type Caller } from "@/lib/authz";
import { isFileTag, LIMITS } from "@/lib/policy/limits";
import { localObjectBytesEnabled, openObjectStore } from "@/lib/store/objects";

export type HashFile = {
  id: string;
  sha256: string | null;
  status: string;
  createdAt: number;
  scannedAt: number | null;
};

type FileRow = {
  id: string;
  batch_id: string;
  workspace_id: string;
  relative_path: string;
  size_bytes: number;
  object_key: string;
  tag: string;
  status: string;
  sha256: string | null;
  created_at: number;
  scanned_at: number | null;
};

type BatchRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  label: string | null;
  discarded_at: number | null;
  deleted_at: number | null;
};

export type BatchScreenFile = {
  id: string;
  relativePath: string;
  sizeBytes: number;
  tag: string;
  status: string;
  sha256: string | null;
  duplicate: boolean;
};

const NOT_FOUND = "Not found.";
const NOT_READY = "That file is not ready to download.";
const LINKS_OFF = "File links are not configured.";
const STORAGE_OFF = "File storage is not configured.";
const REFUSED = "You cannot do that.";
const CLEAN_BLOCKS = "A clean file is already in this batch.";

function stamp(file: HashFile): number {
  return file.scannedAt ?? file.createdAt;
}

/** A later file is marked when an earlier clean file in the same set shares its hash. */
export function duplicateFileIds(files: HashFile[]): Set<string> {
  const marked = new Set<string>();
  for (const file of files) {
    if (!file.sha256) continue;
    const when = stamp(file);
    const earlier = files.some(
      (other) =>
        other.id !== file.id &&
        other.status === "clean" &&
        other.sha256 === file.sha256 &&
        stamp(other) < when,
    );
    if (earlier) marked.add(file.id);
  }
  return marked;
}

export function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function signingSecret(): string {
  return process.env.HANDOFF_SIGNING_SECRET?.trim() ?? "";
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function signFileLink(
  origin: string,
  fileId: string,
  exp: number,
  secret: string,
): Promise<string> {
  const sig = await hmacHex(secret, `${fileId}.${exp}`);
  const url = new URL(`/api/files/${fileId}/content`, origin);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function attachmentDisposition(relativePath: string): string {
  const base = relativePath.split("/").pop() || "download";
  const safe = base.replace(/[\r\n"\\]/g, "_");
  return `attachment; filename="${safe}"`;
}

async function visibleFile(
  sql: Sql,
  caller: Caller,
  batchId: string,
  fileId: string,
): Promise<FileRow | undefined> {
  const visible = await filesFor(sql, caller);
  if (!visible.some((row) => row.id === fileId)) return undefined;
  const row = await sql.get<FileRow>("SELECT * FROM files WHERE id = ? AND batch_id = ?", [
    fileId,
    batchId,
  ]);
  return row ?? undefined;
}

async function audit(
  sql: Sql,
  workspaceId: string,
  actorUserId: string | null,
  action: string,
  subjectType: string,
  subjectId: string,
  at: number,
  metadata: Record<string, string | number>,
): Promise<void> {
  await sql.run(
    `INSERT INTO audit_events (
      id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      workspaceId,
      actorUserId,
      action,
      subjectType,
      subjectId,
      at,
      JSON.stringify(metadata),
    ],
  );
}

export async function issueDownload(input: {
  sql: Sql;
  caller: Caller;
  batchId: string;
  fileId: string;
  origin: string;
  now: number;
}): Promise<{ ok: true; url: string } | { ok: false; status: number; message: string }> {
  const row = await visibleFile(input.sql, input.caller, input.batchId, input.fileId);
  if (!row || !can(input.caller, "file.download", { workspaceId: row.workspace_id })) {
    return { ok: false, status: 404, message: NOT_FOUND };
  }
  if (row.status !== "clean") return { ok: false, status: 409, message: NOT_READY };
  const secret = signingSecret();
  if (!secret) return { ok: false, status: 503, message: LINKS_OFF };
  const exp = Math.floor(input.now / 1000) + LIMITS.downloadTtlSeconds;
  const url = await signFileLink(input.origin, row.id, exp, secret);
  await audit(input.sql, row.workspace_id, input.caller.userId, "file.downloaded", "file", row.id, input.now, {
    relativePath: row.relative_path,
    sizeBytes: row.size_bytes,
    tag: row.tag,
  });
  return { ok: true, url };
}

export async function readSignedFile(input: {
  sql: Sql;
  fileId: string;
  exp: string;
  sig: string;
  now: number;
}): Promise<
  { ok: true; bytes: Uint8Array; disposition: string } | { ok: false; status: number; message: string }
> {
  const secret = signingSecret();
  if (!secret) return { ok: false, status: 503, message: LINKS_OFF };
  const expiry = Number(input.exp);
  if (!Number.isInteger(expiry) || input.sig.length === 0) {
    return { ok: false, status: 401, message: "That link is not valid." };
  }
  const expected = await hmacHex(secret, `${input.fileId}.${expiry}`);
  if (!safeEqual(expected, input.sig)) {
    return { ok: false, status: 401, message: "That link is not valid." };
  }
  if (expiry <= Math.floor(input.now / 1000)) {
    return { ok: false, status: 401, message: "That link has expired." };
  }
  if (!localObjectBytesEnabled()) return { ok: false, status: 503, message: STORAGE_OFF };
  const row = await input.sql.get<FileRow>("SELECT * FROM files WHERE id = ?", [input.fileId]);
  if (!row || row.status !== "clean") return { ok: false, status: 404, message: NOT_FOUND };
  const bytes = await openObjectStore().read(row.object_key);
  if (!bytes) return { ok: false, status: 404, message: NOT_FOUND };
  return { ok: true, bytes, disposition: attachmentDisposition(row.relative_path) };
}

async function visibleBatch(sql: Sql, caller: Caller, batchId: string): Promise<BatchRow | undefined> {
  const visible = await batchesFor(sql, caller);
  if (!visible.some((row) => row.id === batchId)) return undefined;
  const row = await sql.get<BatchRow>("SELECT * FROM batches WHERE id = ?", [batchId]);
  return row ?? undefined;
}

export async function discardBatch(input: {
  sql: Sql;
  caller: Caller;
  batchId: string;
  now: number;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const batch = await visibleBatch(input.sql, input.caller, input.batchId);
  if (!batch || batch.deleted_at !== null) return { ok: false, status: 404, message: NOT_FOUND };
  const files = await input.sql.all<{ status: string }>(
    "SELECT status FROM files WHERE batch_id = ? AND workspace_id = ?",
    [batch.id, batch.workspace_id],
  );
  if (files.some((file) => file.status === "clean")) {
    return { ok: false, status: 409, message: CLEAN_BLOCKS };
  }
  if (
    !can(input.caller, "batch.discard", {
      workspaceId: batch.workspace_id,
      batchCreatedBy: batch.created_by,
    })
  ) {
    return { ok: false, status: 403, message: REFUSED };
  }
  if (batch.discarded_at === null) {
    await input.sql.run("UPDATE batches SET discarded_at = ? WHERE id = ? AND discarded_at IS NULL", [
      input.now,
      batch.id,
    ]);
    await audit(
      input.sql,
      batch.workspace_id,
      input.caller.userId,
      "batch.discarded",
      "batch",
      batch.id,
      input.now,
      { label: batch.label ?? "" },
    );
  }
  return { ok: true };
}

export async function retagFile(input: {
  sql: Sql;
  caller: Caller;
  batchId: string;
  fileId: string;
  tag: string;
  now: number;
}): Promise<{ ok: true; tag: string } | { ok: false; status: number; message: string }> {
  const row = await visibleFile(input.sql, input.caller, input.batchId, input.fileId);
  if (!row) return { ok: false, status: 404, message: NOT_FOUND };
  if (!can(input.caller, "file.tag", { workspaceId: row.workspace_id })) {
    return { ok: false, status: 403, message: REFUSED };
  }
  if (!isFileTag(input.tag)) return { ok: false, status: 422, message: "Choose a tag." };
  if (row.tag !== input.tag) {
    await input.sql.run("UPDATE files SET tag = ? WHERE id = ?", [input.tag, row.id]);
    await audit(input.sql, row.workspace_id, input.caller.userId, "file.tagged", "file", row.id, input.now, {
      from: row.tag,
      to: input.tag,
    });
  }
  return { ok: true, tag: input.tag };
}

export async function loadBatchScreen(
  sql: Sql,
  caller: Caller,
  batchId: string,
): Promise<
  | {
      label: string | null;
      discarded: boolean;
      canTag: boolean;
      canDiscard: boolean;
      files: BatchScreenFile[];
    }
  | undefined
> {
  const batch = await visibleBatch(sql, caller, batchId);
  if (!batch || batch.deleted_at !== null) return undefined;
  const rows = await sql.all<FileRow>(
    "SELECT * FROM files WHERE batch_id = ? AND workspace_id = ? ORDER BY relative_path",
    [batch.id, batch.workspace_id],
  );
  const workspaceFiles = await sql.all<FileRow>(
    "SELECT id, sha256, status, created_at, scanned_at FROM files WHERE workspace_id = ?",
    [batch.workspace_id],
  );
  const marked = duplicateFileIds(
    workspaceFiles.map((row) => ({
      id: row.id,
      sha256: row.sha256,
      status: row.status,
      createdAt: row.created_at,
      scannedAt: row.scanned_at,
    })),
  );
  return {
    label: batch.label,
    discarded: batch.discarded_at !== null,
    canTag: can(caller, "file.tag", { workspaceId: batch.workspace_id }),
    canDiscard: can(caller, "batch.discard", {
      workspaceId: batch.workspace_id,
      batchCreatedBy: batch.created_by,
    }),
    files: rows.map((row) => ({
      id: row.id,
      relativePath: row.relative_path,
      sizeBytes: row.size_bytes,
      tag: row.tag,
      status: row.status,
      sha256: row.sha256,
      duplicate: marked.has(row.id),
    })),
  };
}

export async function batchesOnWorkspace(
  sql: Sql,
  caller: Caller,
  workspaceId: string,
): Promise<{ id: string; label: string | null }[]> {
  const visible = await batchesFor(sql, caller, workspaceId);
  if (visible.length === 0) return [];
  const ids = visible.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  return sql.all<{ id: string; label: string | null }>(
    `SELECT id, label FROM batches
     WHERE id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    ids,
  );
}
