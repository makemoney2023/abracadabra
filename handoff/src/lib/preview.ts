import { batchVisibleTo } from "@/lib/held-work";
import type { Caller } from "@/lib/authz";
import { can } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { openObjectStore } from "@/lib/store/objects";
import { videoTypeForName } from "@/lib/video-files";

export type PreviewKind = "image" | "pdf" | "text" | "video" | "none";

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const TEXT = new Set(["txt", "md", "csv", "json", "log"]);
const PREVIEWABLE = new Set(["uploaded", "scanning", "clean", "held"]);

export function fileExtension(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Pictures, PDFs, clips, and plain text can be shown. HTML and SVG stay closed. */
export function previewKind(name: string): PreviewKind {
  const extension = fileExtension(name);
  if (IMAGE.has(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (TEXT.has(extension)) return "text";
  if (videoTypeForName(name)) return "video";
  return "none";
}

/** A file can be looked at once its bytes are stored and it was not blocked. */
export function previewableStatus(status: string): boolean {
  return PREVIEWABLE.has(status);
}

export function previewContentType(name: string): string {
  const extension = fileExtension(name);
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "pdf") return "application/pdf";
  const video = videoTypeForName(name);
  if (video) return video.contentType;
  if (TEXT.has(extension)) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export function inlineDisposition(name: string): string {
  const base = (name.split("/").pop() ?? "file").replace(/[\r\n"]/g, "");
  return `inline; filename="${base || "file"}"`;
}

type PreviewRow = {
  id: string;
  workspace_id: string;
  relative_path: string;
  status: string;
  object_key: string;
  object_deleted_at: number | null;
  discarded_at: number | null;
  deleted_at: number | null;
  held_at: number | null;
  released_at: number | null;
  hidden_at: number | null;
};

async function previewRow(sql: Sql, fileId: string): Promise<PreviewRow | undefined> {
  return sql.get<PreviewRow>(
    `SELECT f.id, f.workspace_id, f.relative_path, f.status, f.object_key, f.object_deleted_at,
            b.discarded_at, b.deleted_at, b.held_at, b.released_at, b.hidden_at
     FROM files f
     JOIN batches b ON b.id = f.batch_id AND b.workspace_id = f.workspace_id
     WHERE f.id = ?`,
    [fileId],
  );
}

export type PreviewFile = {
  name: string;
  status: string;
  kind: PreviewKind;
  bytes: Uint8Array;
  contentType: string;
  disposition: string;
};

/** A previewable file the caller may see, before any bytes are read. Clips are streamed from this, not loaded. */
export type PreviewAccess = {
  name: string;
  status: string;
  kind: PreviewKind;
  key: string;
  contentType: string;
  disposition: string;
};

/** The same checks as a session preview, without reading the object. 404 for anything the caller may not see. */
export async function openPreviewAccess(input: {
  sql: Sql;
  caller: Caller;
  fileId: string;
}): Promise<{ ok: true; file: PreviewAccess } | { ok: false; status: number }> {
  const row = await previewRow(input.sql, input.fileId);
  if (!row || row.object_deleted_at !== null || row.discarded_at !== null || row.deleted_at !== null) {
    return { ok: false, status: 404 };
  }
  if (!can(input.caller, "file.download", { workspaceId: row.workspace_id })) {
    return { ok: false, status: 404 };
  }
  if (!batchVisibleTo(input.caller, row.workspace_id, row)) return { ok: false, status: 404 };
  if (!previewableStatus(row.status) || previewKind(row.relative_path) === "none") {
    return { ok: false, status: 404 };
  }
  return {
    ok: true,
    file: {
      name: row.relative_path,
      status: row.status,
      kind: previewKind(row.relative_path),
      key: row.object_key,
      contentType: previewContentType(row.relative_path),
      disposition: inlineDisposition(row.relative_path),
    },
  };
}

/** Session preview. Download stays closed until a file is clean. Clips use openPreviewAccess and stream instead. */
export async function readPreviewFile(input: {
  sql: Sql;
  caller: Caller;
  fileId: string;
}): Promise<{ ok: true; file: PreviewFile } | { ok: false; status: number }> {
  const access = await openPreviewAccess(input);
  if (!access.ok) return access;
  if (access.file.kind === "video") return { ok: false, status: 404 };
  const bytes = await openObjectStore().read(access.file.key);
  if (!bytes) return { ok: false, status: 404 };
  const { key, ...rest } = access.file;
  void key;
  return { ok: true, file: { ...rest, bytes } };
}
