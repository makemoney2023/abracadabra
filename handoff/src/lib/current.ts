import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { ensureStudioAdmin } from "@/lib/preview-session";
import { getCaller, SESSION_COOKIE } from "@/lib/session";
import { isLiveSuperAdmin } from "@/lib/store/staff";

export async function currentCaller(sql: Sql): Promise<Caller> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  return getCaller(sql, token, Date.now());
}

export async function openSession(): Promise<{ sql: Sql; caller: Caller }> {
  const sql = await openHandoffDb();
  await migrate(sql);
  await ensureStudioAdmin(sql, Date.now());
  return { sql, caller: await currentCaller(sql) };
}

export async function requireSuperAdminPage(): Promise<{ sql: Sql; caller: Caller }> {
  const session = await openSession();
  if (!(await isLiveSuperAdmin(session.sql, session.caller))) redirect("/login");
  return session;
}

/** Operators and super-admins share the template catalog. A caller with no live staff row gets 404. */
export async function requireStaffPage(): Promise<{ sql: Sql; caller: Caller }> {
  const session = await openSession();
  if (!session.caller.userId || !session.caller.staff) notFound();
  const row = await session.sql.get<{ ok: number }>(
    "SELECT 1 AS ok FROM staff WHERE user_id = ? AND revoked_at IS NULL",
    [session.caller.userId],
  );
  if (row?.ok !== 1) notFound();
  return session;
}
