import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { ensureUploadShare } from "@/lib/share-link";

export const PREVIEW_EMAIL = "studio@handoff.local";
export const PREVIEW_SLUG = "strongfoam";
export const PREVIEW_NAME = "Strongfoam";
const LEGACY_PREVIEW_SLUG = "northwind";
const LEGACY_PREVIEW_DISPLAY_NAME = "Northwind Studio";

/** Sends /w/northwind to the renamed space only after that row itself was renamed. */
export function legacyPreviewRedirect(slug: string, renamed: boolean): string | null {
  if (renamed && slug === LEGACY_PREVIEW_SLUG) return `/w/${PREVIEW_SLUG}`;
  return null;
}

/** Old address keeps working after the rename, including on a later visit. */
export async function legacyPreviewPath(sql: Sql, slug: string): Promise<string | null> {
  if (slug !== LEGACY_PREVIEW_SLUG) return null;
  const stillThere = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE slug = ?", [
    LEGACY_PREVIEW_SLUG,
  ]);
  if (stillThere) return null;
  const renamed = await sql.get<{ id: string }>(
    "SELECT id FROM workspaces WHERE slug = ? AND display_name = ?",
    [PREVIEW_SLUG, PREVIEW_NAME],
  );
  if (!renamed) return null;
  return `/w/${PREVIEW_SLUG}`;
}

/** Renames the live Northwind Studio folder. A different folder on that slug stays put. */
export async function renamePreviewLocker(sql: Sql): Promise<boolean> {
  const current = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE slug = ?", [
    PREVIEW_SLUG,
  ]);
  const legacy = await sql.get<{ id: string }>(
    "SELECT id FROM workspaces WHERE slug = ? AND display_name = ?",
    [LEGACY_PREVIEW_SLUG, LEGACY_PREVIEW_DISPLAY_NAME],
  );
  if (legacy && !current) {
    await sql.run("UPDATE workspaces SET slug = ?, name = ?, display_name = ? WHERE id = ?", [
      PREVIEW_SLUG,
      PREVIEW_NAME,
      PREVIEW_NAME,
      legacy.id,
    ]);
    return true;
  }
  if (current) {
    await sql.run(
      "UPDATE workspaces SET name = ?, display_name = ? WHERE id = ? AND display_name = ?",
      [PREVIEW_NAME, PREVIEW_NAME, current.id, LEGACY_PREVIEW_DISPLAY_NAME],
    );
  }
  return false;
}

function randomHex(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The password login is the admin, so Staff tools and new client spaces open. */
export async function ensureStudioAdmin(sql: Sql, now: number): Promise<void> {
  const user = await sql.get<{ id: string }>("SELECT id FROM users WHERE email = ?", [PREVIEW_EMAIL]);
  if (!user) return;
  const staff = await sql.get<{ is_super_admin: number; revoked_at: number | null }>(
    "SELECT is_super_admin, revoked_at FROM staff WHERE user_id = ?",
    [user.id],
  );
  if (!staff) {
    await sql.run(
      `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
       VALUES (?, ?, 1, ?, NULL)
       ON CONFLICT(user_id) DO UPDATE SET is_super_admin = 1, revoked_at = NULL`,
      [user.id, PREVIEW_EMAIL, now],
    );
    return;
  }
  if (staff.is_super_admin === 1 && staff.revoked_at === null) return;
  await sql.run("UPDATE staff SET is_super_admin = 1, revoked_at = NULL WHERE user_id = ?", [user.id]);
}

/** Opens the shared folder in this browser. No magic link is created or sent. */
export async function openPreviewSession(input: {
  sql: Sql;
  now: number;
}): Promise<{ sessionToken: string; userId: string; slug: string }> {
  await renamePreviewLocker(input.sql);

  const existing = await input.sql.get<{ id: string }>("SELECT id FROM users WHERE email = ?", [
    PREVIEW_EMAIL,
  ]);
  const userId = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    await input.sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
      userId,
      PREVIEW_EMAIL,
      input.now,
    ]);
  }

  await ensureStudioAdmin(input.sql, input.now);

  const workspace = await input.sql.get<{ id: string }>(
    "SELECT id FROM workspaces WHERE slug = ?",
    [PREVIEW_SLUG],
  );
  let workspaceId = workspace?.id;
  if (!workspaceId) {
    workspaceId = crypto.randomUUID();
    await input.sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
         quota_bytes, retention_days, request_digest, status, opened_at
       ) VALUES (?, ?, ?, ?, NULL, ?, 'standard', ?, ?, 0, 'active', ?)`,
      [
        workspaceId,
        PREVIEW_SLUG,
        PREVIEW_NAME,
        PREVIEW_NAME,
        "Abracadabra",
        LIMITS.defaultQuotaBytes,
        LIMITS.defaultRetentionDays,
        input.now,
      ],
    );
    await input.sql.run(
      `INSERT INTO requests (
         id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
       ) VALUES (?, ?, 1, 'Files', NULL, 'other', NULL, 'open', NULL, NULL)`,
      [crypto.randomUUID(), workspaceId],
    );
  }

  const member = await input.sql.get<{ id: string; role: string }>(
    `SELECT id, role FROM memberships
     WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL`,
    [workspaceId, userId],
  );
  if (!member) {
    await input.sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES (?, ?, ?, ?, 'client_owner', ?, NULL)`,
      [crypto.randomUUID(), workspaceId, userId, PREVIEW_EMAIL, input.now],
    );
  } else if (member.role !== "client_owner") {
    await input.sql.run("UPDATE memberships SET role = 'client_owner' WHERE id = ?", [member.id]);
  }

  const openRequests = await input.sql.all<{ id: string }>(
    `SELECT id FROM requests
     WHERE workspace_id = ? AND status = 'open'
     ORDER BY position`,
    [workspaceId],
  );
  if (openRequests.length === 0) {
    const next = await input.sql.get<{ position: number }>(
      "SELECT COALESCE(MAX(position), 0) + 1 AS position FROM requests WHERE workspace_id = ?",
      [workspaceId],
    );
    await input.sql.run(
      `INSERT INTO requests (
         id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
       ) VALUES (?, ?, ?, 'Files', NULL, 'other', NULL, 'open', NULL, NULL)`,
      [crypto.randomUUID(), workspaceId, next?.position ?? 1],
    );
  } else {
    for (const extra of openRequests.slice(1)) {
      await input.sql.run(
        "UPDATE requests SET status = 'closed', closed_at = ? WHERE id = ?",
        [input.now, extra.id],
      );
    }
  }

  await ensureUploadShare(input.sql, workspaceId, input.now);

  const sessionToken = randomHex();
  await input.sql.run(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [
      crypto.randomUUID(),
      userId,
      await sha256Hex(sessionToken),
      input.now,
      input.now + LIMITS.sessionTtlMs,
    ],
  );
  return { sessionToken, userId, slug: PREVIEW_SLUG };
}
