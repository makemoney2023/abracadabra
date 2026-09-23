import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unlockCookieName, unlockEmailSchema } from "@/lib/scan/unlock";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = unlockEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const admin = createAdminClient();

  const { data: scan, error: scanError } = await admin
    .from("scans")
    .select("id, domain")
    .eq("public_token", token)
    .maybeSingle();

  if (scanError) {
    return NextResponse.json(
      { error: "Failed to load scan", message: scanError.message },
      { status: 500 },
    );
  }
  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const { error: unlockError } = await admin.from("scan_unlocks").insert({
    scan_id: scan.id,
    email,
  });

  // Unique (scan_id, email) — treat duplicate unlock as success.
  if (unlockError && unlockError.code !== "23505") {
    return NextResponse.json(
      { error: "Failed to unlock scan", message: unlockError.message },
      { status: 500 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(unlockCookieName(token), "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ unlocked: true });
}
