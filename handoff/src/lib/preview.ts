import type { Caller } from "@/lib/authz";
import { can } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { openObjectStore } from "@/lib/store/objects";

export type PreviewKind = "image" | "pdf" | "text" | "none";

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const TEXT = new Set(["txt", "md", "csv", "json", "log"]);
const PREVIEWABLE = new Set(["uploaded", "scanning", "clean", "held"]);

export function fileExtension(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Pictures, PDFs, and plain text can be shown. HTML and SVG stay closed. */
export function previewKind(name: string): PreviewKind {
  const extension = fileExtension(name);
  if (IMAGE.has(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (TEXT.has(extension)) return "text";
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
};

async function previewRow(sql: Sql, fileId: string): Promise<PreviewRow | undefined> {
  return sql.get<PreviewRow>(
    `SELECT f.id, f.workspace_id, f.relative_path, f.status, f.object_key, f.object_deleted_at,
            b.discarded_at, b.deleted_at
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

/** Session preview. Download stays closed until a file is clean. */
export async function readPreviewFile(input: {
  sql: Sql;
  caller: Caller;
  fileId: string;
}): Promise<{ ok: true; file: PreviewFile } | { ok: false; status: number }> {
  const row = await previewRow(input.sql, input.fileId);
  if (!row || row.object_deleted_at !== null || row.discarded_at !== null || row.deleted_at !== null) {
    return { ok: false, status: 404 };
  }
  if (!can(input.caller, "file.download", { workspaceId: row.workspace_id })) {
    return { ok: false, status: 404 };
  }
  if (!previewableStatus(row.status) || previewKind(row.relative_path) === "none") {
    return { ok: false, status: 404 };
  }
  const bytes = await openObjectStore().read(row.object_key);
  if (!bytes) return { ok: false, status: 404 };
  return {
    ok: true,
    file: {
      name: row.relative_path,
      status: row.status,
      kind: previewKind(row.relative_path),
      bytes,
      contentType: previewContentType(row.relative_path),
      disposition: inlineDisposition(row.relative_path),
    },
  };
}
