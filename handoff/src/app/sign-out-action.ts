"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { revokeSession, SESSION_COOKIE } from "@/lib/session";

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  if (token) {
    const sql = await openHandoffDb();
    await migrate(sql);
    await revokeSession(sql, token, Date.now());
  }
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
