import { batchesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import { can, type Caller } from "@/lib/authz";
import { signFileLink } from "@/lib/downloads";
import { LIMITS } from "@/lib/policy/limits";

const HOUR_MS = 60 * 60 * 1000;
const NOT_FOUND = "We couldn't find that.";
const REFUSED = "You can't do that.";
const LIMITED = "You've made as many exports as you can this hour. Try again later.";
const LINKS_OFF = "File links aren't set up yet.";

export type ExportFile = {
  relativePath: string;
  sizeBytes: number;
  sha256: string | null;
  status: string;
  url?: string;
};

export type ExportDocument = {
  slug: string;
  batchId: string;
  label: string | null;
  files: ExportFile[];
};

type FileRow = {
  id: string;
  relative_path: string;
  size_bytes: number;
  status: string;
  sha256: string | null;
};

export async function exportBatch(input: {
  sql: Sql;
  caller: Caller;
  batchId: string;
  origin: string;
  now: number;
}): Promise<{ ok: true; document: ExportDocument } | { ok: false; status: number; message: string }> {
  const visible = await batchesFor(input.sql, input.caller);
  if (!visible.some((row) => row.id === input.batchId)) {
    return { ok: false, status: 404, message: NOT_FOUND };
  }
  const batch = await input.sql.get<{
    id: string;
    workspace_id: string;
    label: string | null;
    deleted_at: number | null;
  }>("SELECT id, workspace_id, label, deleted_at FROM batches WHERE id = ?", [input.batchId]);
  if (!batch || batch.deleted_at !== null || !input.caller.userId) {
    return { ok: false, status: 404, message: NOT_FOUND };
  }
  if (!can(input.caller, "batch.export", { workspaceId: batch.workspace_id })) {
    return { ok: false, status: 403, message: REFUSED };
  }
  const started = await input.sql.get<{ n: number }>(
    `SELECT count(*) AS n FROM audit_events
     WHERE action = 'batch.exported' AND actor_user_id = ? AND at > ?`,
    [input.caller.userId, input.now - HOUR_MS],
  );
  if ((started?.n ?? 0) >= LIMITS.exportsPerOperatorPerHour) {
    return { ok: false, status: 429, message: LIMITED };
  }
  const secret = process.env.HANDOFF_SIGNING_SECRET?.trim() ?? "";
  if (!secret) return { ok: false, status: 503, message: LINKS_OFF };
  const workspace = await input.sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [
    batch.workspace_id,
  ]);
  if (!workspace) return { ok: false, status: 404, message: NOT_FOUND };
  const rows = await input.sql.all<FileRow>(
    `SELECT id, relative_path, size_bytes, status, sha256
     FROM files WHERE batch_id = ? AND workspace_id = ?
     ORDER BY relative_path`,
    [batch.id, batch.workspace_id],
  );
  const exp = Math.floor(input.now / 1000) + LIMITS.exportTtlSeconds;
  const files: ExportFile[] = [];
  let cleanCount = 0;
  for (const row of rows) {
    const file: ExportFile = {
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
  }
  await input.sql.run(
    `INSERT INTO audit_events (
      id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata
    ) VALUES (?, ?, ?, 'batch.exported', 'batch', ?, ?, ?)`,
    [
      crypto.randomUUID(),
      batch.workspace_id,
      input.caller.userId,
      batch.id,
      input.now,
      JSON.stringify({ label: batch.label ?? "", fileCount: files.length, cleanCount }),
    ],
  );
  return {
    ok: true,
    document: {
      slug: workspace.slug,
      batchId: batch.id,
      label: batch.label,
      files,
    },
  };
}
