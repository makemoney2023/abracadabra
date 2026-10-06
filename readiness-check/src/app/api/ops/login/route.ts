import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OPS_COOKIE, OPS_MAX_AGE_SECONDS, passwordsMatch, signOpsCookie } from "@/lib/ops/session";

export async function POST(request: Request) {
  const expected = process.env.CHECK_OPS_PASSWORD ?? "";
  if (!expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password =
    body && typeof body === "object" && "password" in body && typeof body.password === "string"
      ? body.password
      : "";
  if (!password || !(await passwordsMatch(password, expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await signOpsCookie(expected);
  const cookieStore = await cookies();
  cookieStore.set(OPS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: OPS_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true });
}
