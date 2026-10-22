import type { Caller } from "@/lib/authz";
import { can } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { flagEnabled, workerEnv } from "@/lib/worker-env";

const PBKDF2_ITERATIONS = 310_000;
const WINDOW_MS = 15 * 60 * 1000;
const SESSION_MS = 30 * 60 * 1000;

export function libraryViewLinksEnabled(value?: string): boolean {
  return flagEnabled("LIBRARY_VIEW_LINKS", value);
}

function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function b64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

async function randomToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToB64(bytes);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return diff === 0;
}

async function passcodeHash(passcode: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(bits))}`;
}

async function passcodeMatches(passcode: string, stored: string): Promise<boolean> {
  const [algorithm, iterations, salt, hash] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterations || !salt || !hash) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64ToBytes(salt) as BufferSource, iterations: Number(iterations) }, key, 256);
  return sameBytes(new Uint8Array(bits), b64ToBytes(hash));
}

async function ipHash(ip: string, pepper = workerEnv("HANDOFF_SHARE_HASH_PEPPER"), production = process.env.NODE_ENV === "production"): Promise<string> {
  if (!pepper) {
    if (production) throw new Error("missing_pepper");
    pepper = "development-only";
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Buffer.from(signature).toString("hex");
}

export function viewUnlockCookie(token: string): { name: "library_view"; value: string; httpOnly: true; secure: true; sameSite: "lax"; maxAge: number } {
  return { name: "library_view", value: token, httpOnly: true, secure: true, sameSite: "lax", maxAge: SESSION_MS / 1000 };
}

async function visibleItem(sql: Sql, workspaceId: string, kind: string, id: string, version: number): Promise<boolean> {
  if (kind === "deliverable_item") {
    const row = await sql.get<{ ok: number }>(
      `SELECT 1 AS ok FROM deliverable_items i
       JOIN deliverables d ON d.id = i.deliverable_id
       WHERE d.workspace_id = ? AND i.id = ? AND i.version = ? AND d.published_version = i.version
         AND NOT EXISTS (
           SELECT 1 FROM agent_work_items hw
           WHERE hw.deliverable_id = d.id AND hw.deliverable_version = i.version AND hw.state = 'filed'
             AND hw.released_at IS NULL AND hw.retracted_at IS NULL AND hw.superseded_by IS NULL
         )`,
      [workspaceId, id, version],
    );
    return Boolean(row);
  }
  if (kind === "file") {
    const row = await sql.get<{ ok: number }>(
      `SELECT 1 AS ok FROM files f JOIN batches b ON b.id = f.batch_id
       WHERE f.workspace_id = ? AND f.id = ? AND f.status = 'clean' AND b.deleted_at IS NULL
         AND (b.held_at IS NULL OR b.released_at IS NOT NULL) AND b.hidden_at IS NULL`,
      [workspaceId, id],
    );
    return Boolean(row) && version === 0;
  }
  if (kind === "built_work") {
    const row = await sql.get<{ ok: number }>(
      `SELECT 1 AS ok FROM built_work bw
       JOIN batches b ON b.id = bw.batch_id
       WHERE bw.workspace_id = ? AND bw.id = ? AND (b.held_at IS NULL OR b.released_at IS NOT NULL) AND b.hidden_at IS NULL`,
      [workspaceId, id],
    );
    return Boolean(row) && version === 0;
  }
  return false;
}

export async function createViewLink(
  sql: Sql,
  caller: Caller,
  input: {
    workspaceId: string;
    title?: string | null;
    expiresAt?: number | null;
    passcode?: string | null;
    allowDownloads?: boolean;
    showExternalLinks?: boolean;
    items: { resourceKind: "deliverable_item" | "built_work" | "file"; resourceId: string; resourceVersion: number }[];
  },
  now: number,
  origin: string,
): Promise<{ ok: true; url: string; id: string } | { ok: false; error: "disabled" | "forbidden" | "missing" | "invalid" }> {
  if (!libraryViewLinksEnabled()) return { ok: false, error: "disabled" };
  if (!can(caller, "view_link.manage", { workspaceId: input.workspaceId })) return { ok: false, error: "forbidden" };
  const workspace = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM workspaces WHERE id = ?", [input.workspaceId]);
  if (!workspace?.organization_id || input.items.length === 0) return { ok: false, error: "missing" };
  for (const item of input.items) {
    if (!(await visibleItem(sql, input.workspaceId, item.resourceKind, item.resourceId, item.resourceVersion))) return { ok: false, error: "invalid" };
  }
  const token = await randomToken();
  const id = crypto.randomUUID();
  const passcode = input.passcode ? await passcodeHash(input.passcode) : null;
  await sql.batch([
    {
      statement: `INSERT INTO library_shares (
         id, organization_id, workspace_id, token_hash, title, expires_at, passcode_hash, allow_downloads,
         show_external_links, created_by_kind, created_by_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, workspace.organization_id, input.workspaceId, await sha256(token), input.title ?? null, input.expiresAt ?? null, passcode, input.allowDownloads ? 1 : 0, input.showExternalLinks === false ? 0 : 1, caller.staff ? "staff" : "client", caller.userId, now, now],
    },
    ...input.items.map((item, index) => ({
      statement: `INSERT INTO library_share_items (
         id, share_id, public_id, resource_kind, resource_id, resource_version, sort
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), id, crypto.randomUUID(), item.resourceKind, item.resourceId, item.resourceVersion, index],
    })),
    {
      statement: `INSERT INTO library_share_events (id, share_id, kind, at) VALUES (?, ?, 'created', ?)`,
      params: [crypto.randomUUID(), id, now],
    },
  ]);
  return { ok: true, url: `${origin}/view/${token}`, id };
}

export async function listViewLinks(sql: Sql, caller: Caller, workspaceId: string): Promise<{ ok: true; shares: { id: string; title: string | null; expiresAt: number | null; revokedAt: number | null }[] } | { ok: false; error: "forbidden" }> {
  if (!can(caller, "view_link.manage", { workspaceId })) return { ok: false, error: "forbidden" };
  const shares = await sql.all<{ id: string; title: string | null; expires_at: number | null; revoked_at: number | null }>(
    "SELECT id, title, expires_at, revoked_at FROM library_shares WHERE workspace_id = ? ORDER BY created_at DESC",
    [workspaceId],
  );
  return { ok: true, shares: shares.map((share) => ({ id: share.id, title: share.title, expiresAt: share.expires_at, revokedAt: share.revoked_at })) };
}

export async function revokeViewLink(sql: Sql, caller: Caller, workspaceId: string, shareId: string, now: number): Promise<{ ok: true } | { ok: false; error: "forbidden" | "missing" }> {
  if (!can(caller, "view_link.manage", { workspaceId })) return { ok: false, error: "forbidden" };
  const share = await sql.get<{ id: string }>("SELECT id FROM library_shares WHERE id = ? AND workspace_id = ?", [shareId, workspaceId]);
  if (!share) return { ok: false, error: "missing" };
  await sql.batch([
    { statement: "UPDATE library_shares SET revoked_at = ?, updated_at = ? WHERE id = ?", params: [now, now, shareId] },
    { statement: "INSERT INTO library_share_events (id, share_id, kind, at) VALUES (?, ?, 'revoked', ?)", params: [crypto.randomUUID(), shareId, now] },
  ]);
  return { ok: true };
}

type ShareRow = { id: string; workspace_id: string; expires_at: number | null; revoked_at: number | null; passcode_hash: string | null; allow_downloads: number; show_external_links: number; title: string | null };

async function shareByToken(sql: Sql, token: string): Promise<ShareRow | undefined> {
  return sql.get<ShareRow>(
    "SELECT id, workspace_id, expires_at, revoked_at, passcode_hash, allow_downloads, show_external_links, title FROM library_shares WHERE token_hash = ?",
    [await sha256(token)],
  );
}

function available(share: ShareRow, now: number): boolean {
  return share.revoked_at == null && (share.expires_at == null || share.expires_at > now);
}

export async function openViewLink(sql: Sql, token: string, now: number, sessionToken?: string | null): Promise<{ ok: true; view: { title: string; downloads: boolean; items: { publicId: string; title: string; externalUrl: string | null; kind: string }[] } } | { ok: false; error: "unavailable" | "locked" }> {
  if (!libraryViewLinksEnabled()) return { ok: false, error: "unavailable" };
  const share = await shareByToken(sql, token);
  if (!share || !available(share, now)) return { ok: false, error: "unavailable" };
  if (share.passcode_hash) {
    const sessionOk = sessionToken ? await validSession(sql, share.id, sessionToken, now) : false;
    if (!sessionOk) return { ok: false, error: "locked" };
  }
  const items = await sql.all<{ public_id: string; resource_kind: string; resource_id: string; resource_version: number }>(
    "SELECT public_id, resource_kind, resource_id, resource_version FROM library_share_items WHERE share_id = ? ORDER BY sort",
    [share.id],
  );
  const visible = [];
  for (const item of items) {
    if (!(await visibleItem(sql, share.workspace_id, item.resource_kind, item.resource_id, item.resource_version))) continue;
    const title = await itemTitle(sql, item.resource_kind, item.resource_id);
    const external = share.show_external_links ? await itemUrl(sql, item.resource_kind, item.resource_id, item.resource_version) : null;
    visible.push({ publicId: item.public_id, title, externalUrl: external, kind: item.resource_kind });
  }
  if (visible.length === 0) return { ok: false, error: "unavailable" };
  await sql.run("INSERT INTO library_share_events (id, share_id, kind, at) VALUES (?, ?, 'opened', ?)", [crypto.randomUUID(), share.id, now]);
  return { ok: true, view: { title: share.title ?? "Finished work", downloads: share.allow_downloads === 1, items: visible } };
}

async function itemTitle(sql: Sql, kind: string, id: string): Promise<string> {
  if (kind === "deliverable_item") return (await sql.get<{ title: string }>("SELECT title FROM deliverable_items WHERE id = ?", [id]))?.title ?? "Finished work";
  if (kind === "built_work") return (await sql.get<{ title: string }>("SELECT title FROM built_work WHERE id = ?", [id]))?.title ?? "Website";
  return (await sql.get<{ relative_path: string }>("SELECT relative_path FROM files WHERE id = ?", [id]))?.relative_path.split("/").pop() ?? "File";
}

async function itemUrl(sql: Sql, kind: string, id: string, version: number): Promise<string | null> {
  if (kind === "deliverable_item") {
    const row = await sql.get<{ canonical_url: string | null; link_url: string | null }>(
      `SELECT m.canonical_url, i.link_url FROM deliverable_items i
       LEFT JOIN deliverable_artifact_metadata m ON m.item_id = i.id AND m.version = i.version
       WHERE i.id = ? AND i.version = ?`,
      [id, version],
    );
    return row?.canonical_url ?? row?.link_url ?? null;
  }
  if (kind === "built_work") return (await sql.get<{ live_url: string | null }>("SELECT live_url FROM built_work WHERE id = ?", [id]))?.live_url ?? null;
  return null;
}

async function validSession(sql: Sql, shareId: string, token: string, now: number): Promise<boolean> {
  const row = await sql.get<{ share_id: string; expires_at: number }>("SELECT share_id, expires_at FROM library_share_unlock_sessions WHERE token_hash = ?", [await sha256(token)]);
  return Boolean(row && row.share_id === shareId && row.expires_at > now);
}

export async function unlockViewLink(sql: Sql, token: string, passcode: string, ip: string, now: number): Promise<{ ok: true; cookie: ReturnType<typeof viewUnlockCookie> } | { ok: false; status: 404 | 429 }> {
  if (!libraryViewLinksEnabled()) return { ok: false, status: 404 };
  let hashedIp: string;
  try {
    hashedIp = await ipHash(ip);
  } catch {
    return { ok: false, status: 404 };
  }
  const share = await shareByToken(sql, token);
  if (!share || !available(share, now) || !share.passcode_hash) return { ok: false, status: 404 };
  const attempt = await sql.get<{ count: number; window_start: number; blocked_until: number | null }>(
    "SELECT count, window_start, blocked_until FROM library_share_unlock_attempts WHERE share_id = ? AND ip_hash = ?",
    [share.id, hashedIp],
  );
  if (attempt?.blocked_until && attempt.blocked_until > now) return { ok: false, status: 429 };
  const freshWindow = !attempt || now - attempt.window_start > WINDOW_MS;
  if (!(await passcodeMatches(passcode, share.passcode_hash))) {
    const count = freshWindow ? 1 : (attempt?.count ?? 0) + 1;
    const blockedUntil = count >= 5 ? now + WINDOW_MS : null;
    await sql.run(
      `INSERT INTO library_share_unlock_attempts (share_id, ip_hash, count, window_start, blocked_until)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (share_id, ip_hash) DO UPDATE SET count = excluded.count, window_start = excluded.window_start, blocked_until = excluded.blocked_until`,
      [share.id, hashedIp, count, freshWindow ? now : attempt?.window_start ?? now, blockedUntil],
    );
    return { ok: false, status: blockedUntil ? 429 : 404 };
  }
  await sql.run("DELETE FROM library_share_unlock_attempts WHERE share_id = ? AND ip_hash = ?", [share.id, hashedIp]);
  const session = await randomToken();
  await sql.run(
    "INSERT INTO library_share_unlock_sessions (id, share_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [crypto.randomUUID(), share.id, await sha256(session), now, now + SESSION_MS],
  );
  return { ok: true, cookie: viewUnlockCookie(session) };
}

export async function viewDownload(sql: Sql, token: string, publicId: string, now: number, sessionToken?: string | null): Promise<{ ok: true; fileId: string; shareId: string; filename: string } | { ok: false; status: 404 }> {
  if (!libraryViewLinksEnabled()) return { ok: false, status: 404 };
  const share = await shareByToken(sql, token);
  if (!share || !available(share, now) || share.allow_downloads !== 1) return { ok: false, status: 404 };
  if (share.passcode_hash) {
    const sessionOk = sessionToken ? await validSession(sql, share.id, sessionToken, now) : false;
    if (!sessionOk) return { ok: false, status: 404 };
  }
  const item = await sql.get<{ resource_id: string; resource_kind: string; resource_version: number }>(
    "SELECT resource_id, resource_kind, resource_version FROM library_share_items WHERE share_id = ? AND public_id = ?",
    [share.id, publicId],
  );
  if (!item || item.resource_kind !== "file") return { ok: false, status: 404 };
  if (!(await visibleItem(sql, share.workspace_id, "file", item.resource_id, item.resource_version))) return { ok: false, status: 404 };
  const file = await sql.get<{ relative_path: string }>("SELECT relative_path FROM files WHERE id = ?", [item.resource_id]);
  return { ok: true, fileId: item.resource_id, shareId: share.id, filename: file?.relative_path.split("/").pop() || "download" };
}

export function viewUnlockSetCookie(cookie: ReturnType<typeof viewUnlockCookie>): string {
  return `${cookie.name}=${encodeURIComponent(cookie.value)}; HttpOnly; Secure; SameSite=Lax; Max-Age=${cookie.maxAge}; Path=/view`;
}

export const LIBRARY_PUBLIC_HEADERS: Record<string, string> = {
  "x-robots-tag": "noindex, nofollow",
  "content-security-policy": "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
};
