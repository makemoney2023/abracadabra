import type { Caller } from "@/lib/authz";
import { validateManifest } from "@/lib/batches";
import { workspacesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import { LIMITS, isFileTag, type FileTag } from "@/lib/policy/limits";
import type { PolicyProfile } from "@/lib/policy/profiles";
import { z } from "zod";

const REFUSED = "You cannot do that.";
const INACTIVE = "That workspace is no longer active.";
const REQUEST_CLOSED = "That request is not open.";
const HOUR_MS = 60 * 60 * 1000;

const fileEntry = z
  .object({
    relativePath: z.string(),
    sizeBytes: z.number(),
    contentType: z.string(),
    tag: z.string().optional(),
  })
  .strict();

const batchBody = z
  .object({
    files: z.array(fileEntry),
    requestId: z.string().nullable().optional(),
    label: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

export type CreatedFile = {
  id: string;
  relativePath: string;
  objectKey: string;
  status: "pending";
};

export type CreateBatchResult =
  | { ok: true; status: 201; batchId: string; files: CreatedFile[] }
  | { ok: false; status: number; message: string; index?: number };

function profileOf(value: string): PolicyProfile | null {
  if (value === "standard" || value === "software") return value;
  return null;
}

/** HND-018 through HND-023. The body carries paths and sizes, never file bytes. */
export async function createBatch(input: {
  sql: Sql;
  caller: Caller;
  slug: string;
  now: number;
  body: unknown;
}): Promise<CreateBatchResult> {
  const workspace = (await workspacesFor(input.sql, input.caller)).find((row) => row.slug === input.slug);
  if (!workspace || !input.caller.userId) return { ok: false, status: 404, message: "Not found." };

  const staff = await input.sql.get<{ ok: number }>(
    "SELECT 1 AS ok FROM staff WHERE user_id = ? AND revoked_at IS NULL",
    [input.caller.userId],
  );
  const member = await input.sql.get<{ ok: number }>(
    `SELECT 1 AS ok FROM memberships
     WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL`,
    [workspace.id, input.caller.userId],
  );
  if (staff || input.caller.staff !== null || !member) {
    return { ok: false, status: 403, message: REFUSED };
  }
  if (workspace.status !== "active") return { ok: false, status: 409, message: INACTIVE };

  const started = await input.sql.get<{ n: number }>(
    "SELECT count(*) AS n FROM batches WHERE workspace_id = ? AND created_at > ?",
    [workspace.id, input.now - HOUR_MS],
  );
  if ((started?.n ?? 0) >= LIMITS.batchesPerWorkspacePerHour) {
    return { ok: false, status: 429, message: "Batch limit reached for this hour." };
  }

  const parsed = batchBody.safeParse(input.body);
  if (!parsed.success || parsed.data.files.length === 0) {
    return { ok: false, status: 400, message: REFUSED };
  }
  const note = parsed.data.note?.trim() ?? "";
  if (note.length > LIMITS.maxNoteChars) {
    return { ok: false, status: 422, message: "A note is at most 2,000 characters." };
  }
  const label = parsed.data.label?.trim() || null;
  const requestId = parsed.data.requestId?.trim() || null;

  let suggested: FileTag | null = null;
  if (requestId) {
    const request = await input.sql.get<{ status: string; suggested_tag: string | null }>(
      "SELECT status, suggested_tag FROM requests WHERE id = ? AND workspace_id = ?",
      [requestId, workspace.id],
    );
    if (!request || request.status !== "open") {
      return { ok: false, status: 422, message: REQUEST_CLOSED };
    }
    suggested = request.suggested_tag && isFileTag(request.suggested_tag) ? request.suggested_tag : null;
  }

  const used = await input.sql.get<{ n: number }>(
    `SELECT coalesce(sum(f.size_bytes), 0) AS n
     FROM files f
     JOIN batches b ON b.id = f.batch_id
     WHERE f.workspace_id = ? AND f.object_deleted_at IS NULL AND b.deleted_at IS NULL`,
    [workspace.id],
  );
  const profile = profileOf(workspace.policy_profile);
  if (!profile) return { ok: false, status: 422, message: REFUSED };

  const manifest = validateManifest({
    files: parsed.data.files,
    profile,
    workspaceUsedBytes: used?.n ?? 0,
    workspaceQuotaBytes: workspace.quota_bytes,
  });
  if (!manifest.ok) {
    return { ok: false, status: 422, message: manifest.reason, index: manifest.index };
  }

  const batchId = crypto.randomUUID();
  const files: CreatedFile[] = manifest.files.map((file) => {
    const id = crypto.randomUUID();
    return {
      id,
      relativePath: file.relativePath,
      objectKey: `${workspace.id}/${batchId}/${id}`,
      status: "pending",
    };
  });

  await input.sql.exec("BEGIN");
  try {
    await input.sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        batchId,
        workspace.id,
        requestId,
        input.caller.userId,
        label,
        note.length > 0 ? note : null,
        input.now,
        input.now,
      ],
    );
    for (const [index, file] of files.entries()) {
      const source = manifest.files[index];
      if (!source) throw new Error("manifest entry missing");
      const tag = source.tag ?? suggested ?? "other";
      await input.sql.run(
        `INSERT INTO files (
          id, batch_id, workspace_id, relative_path, extension, declared_content_type,
          size_bytes, object_key, tag, status, scan_attempts, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
        [
          file.id,
          batchId,
          workspace.id,
          source.relativePath,
          source.extension,
          source.contentType,
          source.sizeBytes,
          file.objectKey,
          tag,
          input.now,
        ],
      );
    }
    await input.sql.run(
      `INSERT INTO audit_events (
        id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata
      ) VALUES (?, ?, ?, 'batch.created', 'batch', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        workspace.id,
        input.caller.userId,
        batchId,
        input.now,
        JSON.stringify({ fileCount: files.length, totalBytes: manifest.totalBytes }),
      ],
    );
    await input.sql.exec("COMMIT");
  } catch (error) {
    await input.sql.exec("ROLLBACK");
    throw error;
  }

  return { ok: true, status: 201, batchId, files };
}
