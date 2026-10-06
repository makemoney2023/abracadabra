import { filesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import { can, type Caller } from "@/lib/authz";
import { markRequestReceived, queueProductEvent } from "@/lib/notifications";
import { LIMITS } from "@/lib/policy/limits";

const NOT_FOUND = "Not found.";
const REFUSED = "You cannot do that.";
const NOT_HELD = "That file is not held.";
const REASON_REQUIRED = "A reason is required.";
const REASON_LONG = "A reason is at most 2,000 characters.";

export type HeldFile = {
  id: string;
  relativePath: string;
  scanReason: string | null;
  workspaceName: string;
  workspaceSlug: string;
};

type HeldRow = {
  id: string;
  relative_path: string;
  scan_reason: string | null;
  display_name: string;
  slug: string;
};

type FileRow = {
  id: string;
  workspace_id: string;
  relative_path: string;
  status: string;
};

/** Held files a caller can see, across workspaces. */
export async function listHeldFiles(sql: Sql, caller: Caller): Promise<HeldFile[]> {
  const visible = await filesFor(sql, caller);
  const ids = visible.filter((row) => row.status === "held").map((row) => row.id);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await sql.all<HeldRow>(
    `SELECT f.id, f.relative_path, f.scan_reason, w.display_name, w.slug
     FROM files f
     JOIN workspaces w ON w.id = f.workspace_id
     WHERE f.id IN (${placeholders}) AND f.status = 'held'
     ORDER BY w.slug, f.relative_path`,
    ids,
  );
  return rows.map((row) => ({
    id: row.id,
    relativePath: row.relative_path,
    scanReason: row.scan_reason,
    workspaceName: row.display_name,
    workspaceSlug: row.slug,
  }));
}

/** A super-admin releases a held file to clean or rejects it. Both require a written reason. */
export async function reviewHeldFile(input: {
  sql: Sql;
  caller: Caller;
  fileId: string;
  action: "release" | "reject";
  reason: string;
  now: number;
}): Promise<{ ok: true; status: "clean" | "rejected" } | { ok: false; status: number; message: string }> {
  const visible = await filesFor(input.sql, input.caller);
  const seen = visible.find((row) => row.id === input.fileId);
  if (!seen) return { ok: false, status: 404, message: NOT_FOUND };
  if (!can(input.caller, "file.release", { workspaceId: seen.workspace_id })) {
    return { ok: false, status: 403, message: REFUSED };
  }
  const reason = input.reason.trim();
  if (!reason) return { ok: false, status: 422, message: REASON_REQUIRED };
  if (reason.length > LIMITS.maxNoteChars) return { ok: false, status: 422, message: REASON_LONG };
  const file = await input.sql.get<FileRow>(
    "SELECT id, workspace_id, relative_path, status FROM files WHERE id = ?",
    [input.fileId],
  );
  if (!file || file.status !== "held") return { ok: false, status: 409, message: NOT_HELD };
  const next = input.action === "release" ? "clean" : "rejected";
  const auditAction = input.action === "release" ? "file.released" : "file.rejected_from_held";
  await input.sql.run(
    `UPDATE files SET status = ?, scan_reason = ?, scanned_at = ? WHERE id = ? AND status = 'held'`,
    [next, reason, input.now, file.id],
  );
  await input.sql.run(
    `INSERT INTO audit_events (
      id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata
    ) VALUES (?, ?, ?, ?, 'file', ?, ?, ?)`,
    [
      crypto.randomUUID(),
      file.workspace_id,
      input.caller.userId,
      auditAction,
      file.id,
      input.now,
      JSON.stringify({ relativePath: file.relative_path, reason }),
    ],
  );
  await queueProductEvent(
    input.sql,
    {
      kind: "file.reviewed",
      fileId: file.id,
      status: input.action === "release" ? "released" : "rejected",
    },
    input.now,
  );
  if (input.action === "release") await markRequestReceived(input.sql, file.id, input.now);
  return { ok: true, status: next };
}
