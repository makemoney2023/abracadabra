import type { Sql } from "@/db/sql";

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
