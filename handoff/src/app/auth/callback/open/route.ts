import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { LIMITS } from "@/lib/policy/limits";
import { consumeMagicLink, safeNextPath, SESSION_COOKIE } from "@/lib/session";
import { parseAllowlist } from "@/lib/store/staff";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  void request;
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const home = new URL("/", url.origin);
  try {
    const form = await request.formData();
    const token = String(form.get("token") ?? "");
    const nextValue = form.get("next");
    const sql = await openHandoffDb();
    await migrate(sql);
    const session = await consumeMagicLink({
      sql,
      token,
      now: Date.now(),
      allowlist: parseAllowlist(process.env.HANDOFF_SUPER_ADMIN_EMAILS),
    });
    if (!session) {
      home.searchParams.set("notice", "link");
      return NextResponse.redirect(home);
    }
    const next = safeNextPath(typeof nextValue === "string" ? nextValue : null);
    const response = NextResponse.redirect(next ? new URL(next, url.origin) : home);
    response.cookies.set({
      name: SESSION_COOKIE,
      value: session.sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LIMITS.sessionTtlMs / 1000,
    });
    return response;
  } catch {
    home.searchParams.set("notice", "link");
    return NextResponse.redirect(home);
  }
}
