import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { LIMITS } from "@/lib/policy/limits";
import { consumeMagicLink, SESSION_COOKIE } from "@/lib/session";
import { parseAllowlist } from "@/lib/store/staff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const home = new URL("/", url.origin);
  try {
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
    const response = NextResponse.redirect(home);
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
