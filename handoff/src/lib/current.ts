import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
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
  return { sql, caller: await currentCaller(sql) };
}

export async function requireSuperAdminPage(): Promise<{ sql: Sql; caller: Caller }> {
  const session = await openSession();
  if (!(await isLiveSuperAdmin(session.sql, session.caller))) notFound();
  return session;
}
