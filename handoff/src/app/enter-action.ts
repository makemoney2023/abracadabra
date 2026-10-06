"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { LIMITS } from "@/lib/policy/limits";
import { openPreviewSession } from "@/lib/preview-session";
import { SESSION_COOKIE } from "@/lib/session";

export async function enterPreview(formData: FormData): Promise<void> {
  void formData;
  let slug = "";
  try {
    const sql = await openHandoffDb();
    await migrate(sql);
    const opened = await openPreviewSession({ sql, now: Date.now() });
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
    slug = opened.slug;
  } catch {
    redirect("/?notice=open");
  }
  redirect(`/w/${slug}`);
}
