import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkDb, scanByToken } from "@/lib/paywall/scan-context";
import { recordScanUnlock } from "@/lib/scan/d1-store";
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
  const db = await checkDb();
  if (!db) {
    return NextResponse.json({ error: "Scan store unavailable" }, { status: 503 });
  }

  let scan: Awaited<ReturnType<typeof scanByToken>>;
  try {
    scan = await scanByToken(db, token);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load scan", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Unique (scan_id, email): a repeat unlock is a no-op. Nothing is emailed.
  try {
    await recordScanUnlock(db, scan.id, email);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to unlock scan", message: err instanceof Error ? err.message : "unknown" },
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
