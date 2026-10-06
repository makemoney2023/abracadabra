import type { Sql } from "@/db/sql";
import { openPreviewSession } from "@/lib/preview-session";

export const ADMIN_USERNAME = "admin";

const MIN_PASSWORD_LENGTH = 8;

export type PasswordSignIn =
  | { ok: true; sessionToken: string; slug: string }
  | { ok: false; reason: "wrong" | "unconfigured" };

/** The admin password lives in HANDOFF_ADMIN_PASSWORD. A short or empty value is not a login. */
export function configuredAdminPassword(): string | null {
  const value = process.env.HANDOFF_ADMIN_PASSWORD?.trim() ?? "";
  if (value.length < MIN_PASSWORD_LENGTH) return null;
  return value;
}

async function sameSecret(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let diff = leftBytes.length === rightBytes.length ? 0 : 1;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
}

/** Signs in the studio admin. A wrong password does not create a session. */
export async function signInWithPassword(input: {
  sql: Sql;
  username: string;
  password: string;
  now: number;
  expectedPassword?: string | null;
}): Promise<PasswordSignIn> {
  const passed = input.expectedPassword === undefined ? configuredAdminPassword() : input.expectedPassword;
  const trimmed = passed?.trim() ?? "";
  const expected = trimmed.length >= MIN_PASSWORD_LENGTH ? trimmed : null;
  if (!expected) return { ok: false, reason: "unconfigured" };

  const username = input.username.trim().toLowerCase();
  const passwordOk = await sameSecret(input.password, expected);
  if (username !== ADMIN_USERNAME || !passwordOk) return { ok: false, reason: "wrong" };

  const opened = await openPreviewSession({ sql: input.sql, now: input.now });
  return { ok: true, sessionToken: opened.sessionToken, slug: opened.slug };
}
