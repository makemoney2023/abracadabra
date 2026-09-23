import { NextResponse } from "next/server";
import { z } from "zod";
import { applyPublicOptIn } from "@/lib/scan/opt-in";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

const optInSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(200).optional(),
});

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

  const parsed = optInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: scan, error: scanError } = await admin
    .from("scans")
    .select("id, domain, origin")
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

  try {
    const result = await applyPublicOptIn(admin, {
      scanId: scan.id,
      domain: scan.domain,
      origin: scan.origin,
      email: parsed.data.email.trim().toLowerCase(),
      name: parsed.data.name,
    });
    return NextResponse.json({
      ok: true,
      leadId: result.leadId,
      queueCreated: result.queueCreated,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Opt-in failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}
