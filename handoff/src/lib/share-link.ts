import type { Sql } from "@/db/sql";
import { DEFAULT_CLIENT_ORIGIN, isHqHost } from "@/lib/host";
import { LIMITS } from "@/lib/policy/limits";

const SHARE_TOKEN = /^[0-9a-f]{64}$/;

function randomHex(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function guestEmail(workspaceId: string): string {
  return `share+${workspaceId}@handoff.local`;
}

function hostName(value: string): string {
  const raw = value.trim();
  try {
    if (raw.includes("://")) return new URL(raw).hostname;
  } catch {
    return "";
  }
  return raw.toLowerCase().replace(/:\d+$/, "");
}

function isWorkersDev(value: string): boolean {
  return hostName(value).endsWith(".workers.dev");
}

/** Absolute page for a share token. Staff hosts and workers.dev never become the link. */
export function sharePageUrl(
  token: string,
  source: { origin?: string; host?: string | null; proto?: string | null },
): string {
  const path = `/share/${token}`;
  const configured = source.origin?.trim().replace(/\/$/, "") ?? "";
  if (configured && !isWorkersDev(configured)) return `${configured}${path}`;
  const host = source.host?.trim() ?? "";
  if (host && !isWorkersDev(host) && !isHqHost(host)) {
    return `${source.proto || "https"}://${host}${path}`;
  }
  return `${DEFAULT_CLIENT_ORIGIN}${path}`;
}

/** Returns the same upload link for a space, creating it the first time. */
export async function ensureUploadShare(sql: Sql, workspaceId: string, now = Date.now()): Promise<string> {
  const existing = await sql.get<{ token: string }>(
    "SELECT token FROM upload_shares WHERE workspace_id = ?",
    [workspaceId],
  );
  if (existing?.token) return existing.token;
  const token = randomHex();
  await sql.run("INSERT INTO upload_shares (workspace_id, token, created_at) VALUES (?, ?, ?)", [
    workspaceId,
    token,
    now,
  ]);
  return token;
}

/** Signs the visitor in as a member who can upload. Returns null when the link is no good. */
export async function openUploadShare(
  sql: Sql,
  token: string,
  now: number,
): Promise<{ sessionToken: string; userId: string; slug: string; requestId: string | null } | null> {
  if (!SHARE_TOKEN.test(token)) return null;
  const share = await sql.get<{ workspace_id: string; slug: string; status: string }>(
    `SELECT s.workspace_id, w.slug, w.status
     FROM upload_shares s
     JOIN workspaces w ON w.id = s.workspace_id
     WHERE s.token = ?`,
    [token],
  );
  if (!share || share.status !== "active") return null;

  const email = guestEmail(share.workspace_id);
  const existing = await sql.get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  const userId = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [userId, email, now]);
  }
  await sql.run("UPDATE staff SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", [
    now,
    userId,
  ]);

  const member = await sql.get<{ id: string }>(
    `SELECT id FROM memberships
     WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL`,
    [share.workspace_id, userId],
  );
  if (!member) {
    await sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES (?, ?, ?, ?, 'client_member', ?, NULL)`,
      [crypto.randomUUID(), share.workspace_id, userId, email, now],
    );
  }

  const request = await sql.get<{ id: string }>(
    `SELECT id FROM requests
     WHERE workspace_id = ? AND status = 'open'
     ORDER BY position
     LIMIT 1`,
    [share.workspace_id],
  );

  const sessionToken = randomHex();
  await sql.run(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [crypto.randomUUID(), userId, await sha256Hex(sessionToken), now, now + LIMITS.sessionTtlMs],
  );
  return {
    sessionToken,
    userId,
    slug: share.slug,
    requestId: request?.id ?? null,
  };
}
