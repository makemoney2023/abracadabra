"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { isHqHost } from "@/lib/host";
import { LIMITS } from "@/lib/policy/limits";
import { signInWithPassword } from "@/lib/password-login";
import { SESSION_COOKIE } from "@/lib/session";

export async function signIn(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    const sql = await openHandoffDb();
    await migrate(sql);
    const opened = await signInWithPassword({
      sql,
      username,
      password,
      now: Date.now(),
    });
    if (!opened.ok) redirect(`/login?notice=${opened.reason}`);
    const jar = await cookies();
    jar.set({
      name: SESSION_COOKIE,
      value: opened.sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LIMITS.sessionTtlMs / 1000,
    });
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/login?notice=open");
  }
  const host = (await headers()).get("host") ?? "";
  redirect(isHqHost(host) ? "/spaces" : "/");
}
