import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { optInAssessment } from "@/lib/assessment/actions";
import { unlockCookieName } from "@/lib/scan/unlock";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

const schema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await optInAssessment(createAdminClient(), token, {
      email: parsed.data.email.trim().toLowerCase(),
      name: parsed.data.name,
    });
    if (result.status === 200 && result.scanToken) {
      const cookieStore = await cookies();
      cookieStore.set(unlockCookieName(result.scanToken), "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        secure: process.env.NODE_ENV === "production",
      });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Opt-in failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
