import { createHash } from "node:crypto";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { verifyHqChatToken } from "./hq-chat-token";

const SESSION_COOKIE = "handoff_session";

export type StaffRequestResult = { ok: true; caller: Caller } | { ok: false; status: 401 | 403 };

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cookieValue(header: string | null, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function callerFor(userId: string, superAdmin: boolean): Caller {
  return { userId, staff: { superAdmin }, operatorOf: [], memberships: [] };
}

async function staffCaller(sql: Sql, userId: string): Promise<StaffRequestResult> {
  const staff = await sql.get<{ is_super_admin: number; revoked_at: number | null }>(
    "SELECT is_super_admin, revoked_at FROM staff WHERE user_id = ?",
    [userId],
  );
  if (!staff || staff.revoked_at !== null) return { ok: false, status: 403 };
  return { ok: true, caller: callerFor(userId, staff.is_super_admin === 1) };
}

/** Bearer chat token or the staff session cookie. Revoked staff cannot act. */
export async function staffFromRequest(sql: Sql, request: Request, now: number): Promise<StaffRequestResult> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (bearer) {
    const secret = process.env.HQ_CHAT_SECRET ?? "";
    const identity = secret ? verifyHqChatToken(bearer, secret, now) : null;
    if (!identity) return { ok: false, status: 401 };
    return staffCaller(sql, identity.userId);
  }
  const raw = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!raw) return { ok: false, status: 401 };
  const row = await sql.get<{ user_id: string }>(
    `SELECT user_id FROM sessions
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
    [sha256Hex(raw), now],
  );
  if (!row) return { ok: false, status: 401 };
  return staffCaller(sql, row.user_id);
}
