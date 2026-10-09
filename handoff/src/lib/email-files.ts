import { slugFromName } from "../db/crm";
import type { Sql } from "../db/sql";
import { validateManifest } from "./batches";
import type { EmailAttachment } from "./client-channel";
import { LIMITS } from "./policy/limits";
import { inspectFileName, type PolicyProfile } from "./policy/profiles";
import type { ObjectStore } from "./store/objects";

const LABEL = "From email";
const ACTOR = "email";
const MAX_BYTES = 25 * 1024 * 1024;

export type StoredEmailFiles = {
  batchId: string | null;
  stored: string[];
  refused: string[];
};

function profileOf(value: string): PolicyProfile | null {
  if (value === "standard" || value === "software") return value;
  return null;
}

/** A single path segment. A missing or hostile name is refused rather than rewritten into a type we accept. */
export function emailFileName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.replace(/^\.+/, "") ?? "";
  return base.replace(/[^\w. -]/g, "_").trim().slice(0, 200);
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  let next = `${stem}-${n}${ext}`;
  while (used.has(next)) {
    n += 1;
    next = `${stem}-${n}${ext}`;
  }
  used.add(next);
  return next;
}

async function freeSlug(sql: Sql, base: string): Promise<string> {
  let candidate = base;
  for (let n = 2; n < 50; n += 1) {
    const taken = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE slug = ?", [candidate]);
    if (!taken) return candidate;
    candidate = `${base}-${n}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/** A lead with no space gets one standard workspace. The organization stays a lead. */
async function ensureLeadSpace(
  sql: Sql,
  organizationId: string,
  now: number,
): Promise<{ id: string; policy_profile: string; quota_bytes: number } | null> {
  const org = await sql.get<{ kind: string; name: string; owner_user_id: string | null }>(
    "SELECT kind, name, owner_user_id FROM organizations WHERE id = ?",
    [organizationId],
  );
  if (!org || org.kind !== "lead") return null;
  const workspaceId = crypto.randomUUID();
  const slug = await freeSlug(sql, slugFromName(org.name));
  const staff = org.owner_user_id
    ? await sql.get<{ user_id: string }>(
        "SELECT user_id FROM staff WHERE user_id = ? AND revoked_at IS NULL",
        [org.owner_user_id],
      )
    : undefined;
  await sql.exec("BEGIN");
  try {
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
         quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id
       ) VALUES (?, ?, ?, ?, NULL, ?, 'standard', ?, ?, 0, 'active', ?, ?, NULL)`,
      [
        workspaceId,
        slug,
        org.name,
        org.name,
        org.name,
        LIMITS.defaultQuotaBytes,
        LIMITS.defaultRetentionDays,
        now,
        organizationId,
      ],
    );
    await sql.run(
      `INSERT INTO requests (
         id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
       ) VALUES (?, ?, 1, 'Files', NULL, 'other', NULL, 'open', NULL, NULL)`,
      [crypto.randomUUID(), workspaceId],
    );
    if (staff) {
      await sql.run(
        `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [crypto.randomUUID(), workspaceId, staff.user_id, staff.user_id, now],
      );
    }
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { id: workspaceId, policy_profile: "standard", quota_bytes: LIMITS.defaultQuotaBytes };
}

async function note(sql: Sql, organizationId: string, body: string, now: number): Promise<void> {
  await sql.run(
    `INSERT INTO activities (
      id, organization_id, kind, actor_kind, actor_id, body, created_at
    ) VALUES (?, ?, 'agent.note', 'agent', 'client-desk', ?, ?)`,
    [crypto.randomUUID(), organizationId, body, now],
  );
}

/** Saves email files into the client's oldest active space and leaves them waiting for the scan. */
export async function storeEmailAttachments(input: {
  sql: Sql;
  store: ObjectStore;
  organizationId: string;
  files: EmailAttachment[];
  now: number;
}): Promise<StoredEmailFiles> {
  if (input.files.length === 0) return { batchId: null, stored: [], refused: [] };
  const space = await input.sql.get<{ id: string; policy_profile: string; quota_bytes: number }>(
    `SELECT id, policy_profile, quota_bytes FROM workspaces
     WHERE organization_id = ? AND status = 'active'
     ORDER BY opened_at ASC LIMIT 1`,
    [input.organizationId],
  );
  const room =
    space ?? (await ensureLeadSpace(input.sql, input.organizationId, input.now));
  const profile = room ? profileOf(room.policy_profile) : null;
  if (!room || !profile) {
    await note(input.sql, input.organizationId, "An email attachment arrived and this client has no file space.", input.now);
    return { batchId: null, stored: [], refused: input.files.map((file) => file.filename || "attachment") };
  }

  const usedNames = new Set<string>();
  const accepted: { name: string; extension: string; contentType: string; bytes: Uint8Array }[] = [];
  const refused: string[] = [];
  for (const file of input.files) {
    const rawName = emailFileName(file.filename);
    if (!rawName || file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_BYTES) {
      refused.push(file.filename || "attachment");
      continue;
    }
    const name = uniqueName(rawName, usedNames);
    const inspected = inspectFileName(name, profile);
    if (!inspected.ok) {
      refused.push(name);
      continue;
    }
    accepted.push({
      name,
      extension: inspected.extension,
      contentType: file.mimeType || "application/octet-stream",
      bytes: file.bytes,
    });
  }
  if (accepted.length === 0) {
    await note(input.sql, input.organizationId, `An email attachment was refused: ${refused.join(", ")}.`, input.now);
    return { batchId: null, stored: [], refused };
  }

  const used = await input.sql.get<{ n: number }>(
    `SELECT coalesce(sum(f.size_bytes), 0) AS n
     FROM files f
     JOIN batches b ON b.id = f.batch_id
     WHERE f.workspace_id = ? AND f.object_deleted_at IS NULL AND b.deleted_at IS NULL`,
    [room.id],
  );
  const manifest = validateManifest({
    files: accepted.map((file) => ({
      relativePath: file.name,
      sizeBytes: file.bytes.byteLength,
      contentType: file.contentType,
      tag: "other",
    })),
    profile,
    workspaceUsedBytes: used?.n ?? 0,
    workspaceQuotaBytes: room.quota_bytes,
  });
  if (!manifest.ok) {
    await note(input.sql, input.organizationId, "An email attachment did not fit in the client's space.", input.now);
    return { batchId: null, stored: [], refused: [...refused, ...accepted.map((file) => file.name)] };
  }

  const batchId = crypto.randomUUID();
  const rows = accepted.map((file) => ({ ...file, id: crypto.randomUUID() }));
  await input.sql.exec("BEGIN");
  try {
    await input.sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, NULL, NULL)`,
      [batchId, room.id, ACTOR, LABEL, input.now, input.now],
    );
    for (const file of rows) {
      await input.sql.run(
        `INSERT INTO files (
          id, batch_id, workspace_id, relative_path, extension, declared_content_type,
          size_bytes, object_key, tag, status, scan_attempts, created_at, uploaded_at, next_scan_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'other', 'uploaded', 0, ?, ?, ?)`,
        [
          file.id,
          batchId,
          room.id,
          file.name,
          file.extension,
          file.contentType,
          file.bytes.byteLength,
          `${room.id}/${batchId}/${file.id}`,
          input.now,
          input.now,
          input.now,
        ],
      );
    }
    await input.sql.exec("COMMIT");
  } catch (error) {
    await input.sql.exec("ROLLBACK");
    throw error;
  }

  const stored: string[] = [];
  for (const file of rows) {
    const key = `${room.id}/${batchId}/${file.id}`;
    try {
      await input.store.put(key, file.bytes);
      stored.push(file.name);
    } catch {
      await input.sql.run("UPDATE files SET status = 'failed', scan_reason = ? WHERE id = ?", ["The file did not save.", file.id]);
      refused.push(file.name);
    }
  }
  return { batchId, stored, refused };
}
