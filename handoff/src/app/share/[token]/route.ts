import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { LIMITS } from "@/lib/policy/limits";
import { openUploadShare } from "@/lib/share-link";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const url = new URL(request.url);
  const home = new URL("/?notice=share", url.origin);
  try {
    const sql = await openHandoffDb();
    await migrate(sql);
    const opened = await openUploadShare(sql, token, Date.now());
    if (!opened) return NextResponse.redirect(home);
    const next = opened.requestId
      ? `/w/${opened.slug}/drop?request=${opened.requestId}`
      : `/w/${opened.slug}/drop`;
    const response = NextResponse.redirect(new URL(next, url.origin));
    response.cookies.set({
      name: SESSION_COOKIE,
      value: opened.sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LIMITS.sessionTtlMs / 1000,
    });
    return response;
  } catch {
    return NextResponse.redirect(home);
  }
}
