import { z } from "zod";
import type { Sql } from "@/db/sql";
import { can, type Caller } from "@/lib/authz";
import { REFUSED, type StoreResult } from "@/lib/store/result";

const staffEmail = z.string().trim().email();

export function parseAllowlist(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/** The first sign-in from HANDOFF_SUPER_ADMIN_EMAILS becomes super-admin while staff is empty. */
export async function ensureBootstrapSuperAdmin(
  sql: Sql,
  email: string,
  userId: string,
  now: number,
  allowlist: readonly string[],
): Promise<void> {
  const row = await sql.get<{ n: number }>("SELECT count(*) AS n FROM staff");
  if ((row?.n ?? 0) > 0) return;
  if (!allowlist.includes(email)) return;
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES (?, ?, 1, ?, NULL)`,
    [userId, email, now],
  );
}

export async function isLiveSuperAdmin(sql: Sql, caller: Caller): Promise<boolean> {
  if (!can(caller, "workspace.create") || !caller.userId) return false;
  const row = await sql.get<{ ok: number }>(
    "SELECT 1 AS ok FROM staff WHERE user_id = ? AND is_super_admin = 1 AND revoked_at IS NULL",
    [caller.userId],
  );
  return row?.ok === 1;
}

/** A super-admin adds an operator. The new row is staff, not another super-admin. */
export async function addStaff(input: {
  sql: Sql;
  caller: Caller;
  email: string;
  now: number;
}): Promise<StoreResult<{ userId: string }>> {
  if (!(await isLiveSuperAdmin(input.sql, input.caller))) {
    return { ok: false, message: REFUSED };
  }
  const parsed = staffEmail.safeParse(input.email);
  if (!parsed.success) return { ok: false, message: "Enter a staff email." };
  const email = parsed.data.toLowerCase();
  const existingStaff = await input.sql.get<{ user_id: string }>(
    "SELECT user_id FROM staff WHERE email = ? AND revoked_at IS NULL",
    [email],
  );
  if (existingStaff) return { ok: true, value: { userId: existingStaff.user_id } };

  const existingUser = await input.sql.get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  const userId = existingUser?.id ?? crypto.randomUUID();
  if (!existingUser) {
    await input.sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
      userId,
      email,
      input.now,
    ]);
  }
  await input.sql.run(
    "INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES (?, ?, 0, ?, NULL)",
    [userId, email, input.now],
  );
  return { ok: true, value: { userId } };
}

export async function liveStaff(sql: Sql): Promise<{ userId: string; email: string }[]> {
  const rows = await sql.all<{ user_id: string; email: string }>(
    "SELECT user_id, email FROM staff WHERE revoked_at IS NULL ORDER BY email",
  );
  return rows.map((row) => ({ userId: row.user_id, email: row.email }));
}
