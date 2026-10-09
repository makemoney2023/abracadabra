"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { fail, type ActionResult } from "@/lib/action-result";
import { isHqHost } from "@/lib/host";
import { LIMITS } from "@/lib/policy/limits";
import { signInWithPassword } from "@/lib/password-login";
import { SESSION_COOKIE } from "@/lib/session";

export async function signIn(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!username.trim()) return fail("Enter a username.", "username");
  if (!password) return fail("Enter a password.", "password");
  try {
    const sql = await openHandoffDb();
    await migrate(sql);
    const opened = await signInWithPassword({
      sql,
      username,
      password,
      now: Date.now(),
    });
    if (!opened.ok) {
      if (opened.reason === "unconfigured") return fail("Sign-in is not set up yet.");
      return fail("That username or password is wrong.", "password");
    }
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
    return fail("We could not sign you in. Please try again soon.");
  }
  const host = (await headers()).get("host") ?? "";
  redirect(isHqHost(host) ? "/spaces" : "/");
}
