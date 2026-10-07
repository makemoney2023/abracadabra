import { getTableName } from "drizzle-orm";
import { z } from "zod";
import { magicLinks, sessions, users } from "@/db/schema";
import type { Sql } from "@/db/sql";
import type { Caller, MembershipRole } from "@/lib/authz";
import { LIMITS } from "@/lib/policy/limits";
import { signedOutCaller } from "@/db/records";
import { ensureBootstrapSuperAdmin } from "@/lib/store/staff";

const USERS = getTableName(users);
const MAGIC_LINKS = getTableName(magicLinks);
const SESSIONS = getTableName(sessions);

const emailAddress = z.string().trim().email();

export const SIGN_IN_MESSAGE = "If we know this email, we sent you a link to sign in.";
export const SESSION_COOKIE = "handoff_session";

export type OutboundMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

export function normalizeEmail(value: string): string | null {
  const parsed = emailAddress.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.toLowerCase();
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

const INVITE_NEXT = /^\/invites\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Only an invite page may be the page a magic link opens after sign-in. */
export function safeNextPath(value: string | null): string | null {
  if (!value || !INVITE_NEXT.test(value)) return null;
  return value;
}

function magicLinkText(url: string): string {
  const minutes = Math.round(LIMITS.magicLinkTtlMs / 60_000);
  return [
    "Use this link to open Handoff. Then press the button on the page:",
    url,
    "",
    `The link stops working in ${minutes} minutes. If you did not ask for it, just ignore this email.`,
  ].join("\n");
}

async function canRequestLink(
  sql: Sql,
  email: string,
  now: number,
  allowlist: readonly string[],
): Promise<boolean> {
  if (allowlist.includes(email)) {
    const staff = await sql.get<{ n: number }>("SELECT count(*) AS n FROM staff");
    if ((staff?.n ?? 0) === 0) return true;
  }
  const row = await sql.get<{ ok: number }>(
    `SELECT 1 AS ok FROM staff WHERE email = ? AND revoked_at IS NULL
     UNION
     SELECT 1 FROM memberships WHERE email = ? AND revoked_at IS NULL
     UNION
     SELECT 1 FROM invites i
     JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.email = ? AND i.revoked_at IS NULL AND i.expires_at > ? AND w.status = 'active'
     LIMIT 1`,
    [email, email, email, now],
  );
  return row?.ok === 1;
}

export async function requestMagicLink(input: {
  sql: Sql;
  email: string;
  now: number;
  origin: string;
  from: string;
  allowlist: readonly string[];
  returnTo?: string;
  send: (message: OutboundMail) => Promise<void>;
}): Promise<{ message: string }> {
  const email = normalizeEmail(input.email);
  if (!email) return { message: "Type the email your invite was sent to." };
  const allowed = await canRequestLink(input.sql, email, input.now, input.allowlist);
  if (!allowed) return { message: SIGN_IN_MESSAGE };

  const windowStart = input.now - 60 * 60 * 1000;
  const recent = await input.sql.get<{ n: number }>(
    `SELECT count(*) AS n FROM ${MAGIC_LINKS} WHERE email = ? AND created_at > ?`,
    [email, windowStart],
  );
  if ((recent?.n ?? 0) >= LIMITS.magicLinksPerEmailPerHour) {
    return { message: SIGN_IN_MESSAGE };
  }
  if (input.from.trim().length === 0) {
    throw new Error("mail is not configured");
  }

  const token = randomHex();
  const id = crypto.randomUUID();
  await input.sql.run(
    `INSERT INTO ${MAGIC_LINKS} (id, email, token_hash, created_at, expires_at, consumed_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [id, email, await sha256Hex(token), input.now, input.now + LIMITS.magicLinkTtlMs],
  );
  const origin = input.origin.replace(/\/$/, "");
  const next = safeNextPath(input.returnTo ?? null);
  const url = `${origin}/auth/callback?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  try {
    await input.send({
      from: input.from,
      to: email,
      subject: "Sign in to Handoff",
      text: magicLinkText(url),
    });
  } catch (error) {
    await input.sql.run(`DELETE FROM ${MAGIC_LINKS} WHERE id = ?`, [id]);
    throw error;
  }
  return { message: SIGN_IN_MESSAGE };
}

export async function consumeMagicLink(input: {
  sql: Sql;
  token: string;
  now: number;
  allowlist: readonly string[];
}): Promise<{ sessionToken: string; userId: string } | null> {
  const tokenHash = await sha256Hex(input.token);
  const link = await input.sql.get<{ id: string; email: string }>(
    `SELECT id, email FROM ${MAGIC_LINKS}
     WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
    [tokenHash, input.now],
  );
  if (!link) return null;
  await input.sql.run(
    `UPDATE ${MAGIC_LINKS} SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
    [input.now, link.id],
  );
  const consumed = await input.sql.get<{ consumed_at: number }>(
    `SELECT consumed_at FROM ${MAGIC_LINKS} WHERE id = ?`,
    [link.id],
  );
  if (consumed?.consumed_at !== input.now) return null;

  const existing = await input.sql.get<{ id: string }>(
    `SELECT id FROM ${USERS} WHERE email = ?`,
    [link.email],
  );
  const userId = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    await input.sql.run(`INSERT INTO ${USERS} (id, email, created_at) VALUES (?, ?, ?)`, [
      userId,
      link.email,
      input.now,
    ]);
  }
  await ensureBootstrapSuperAdmin(input.sql, link.email, userId, input.now, input.allowlist);

  const sessionToken = randomHex();
  await input.sql.run(
    `INSERT INTO ${SESSIONS} (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [
      crypto.randomUUID(),
      userId,
      await sha256Hex(sessionToken),
      input.now,
      input.now + LIMITS.sessionTtlMs,
    ],
  );
  return { sessionToken, userId };
}

type CallerRow = {
  user_id: string;
  is_super_admin: number | null;
  operator_of: string | null;
  memberships: string | null;
};

export async function getCaller(sql: Sql, sessionToken: string, now: number): Promise<Caller> {
  if (sessionToken.length === 0) return signedOutCaller;
  const row = await sql.get<CallerRow>(
    `SELECT
       u.id AS user_id,
       s.is_super_admin AS is_super_admin,
       (
         SELECT group_concat(o.workspace_id)
         FROM workspace_operators o
         WHERE o.user_id = u.id AND o.removed_at IS NULL
       ) AS operator_of,
       (
         SELECT group_concat(m.workspace_id || ':' || m.role)
         FROM memberships m
         WHERE m.user_id = u.id AND m.revoked_at IS NULL
       ) AS memberships
     FROM ${SESSIONS} sess
     JOIN ${USERS} u ON u.id = sess.user_id
     LEFT JOIN staff s ON s.user_id = u.id AND s.revoked_at IS NULL
     WHERE sess.token_hash = ? AND sess.revoked_at IS NULL AND sess.expires_at > ?`,
    [await sha256Hex(sessionToken), now],
  );
  if (!row) return signedOutCaller;
  const memberships = (row.memberships ?? "")
    .split(",")
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separator = entry.indexOf(":");
      return {
        workspaceId: entry.slice(0, separator),
        role: entry.slice(separator + 1) as MembershipRole,
      };
    });
  return {
    userId: row.user_id,
    staff: row.is_super_admin === null ? null : { superAdmin: row.is_super_admin === 1 },
    operatorOf: (row.operator_of ?? "").split(",").filter((id) => id.length > 0),
    memberships,
  };
}
