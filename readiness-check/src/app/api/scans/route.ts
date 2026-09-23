import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeDomain } from "@/lib/domain";
import { countRecentPublicScans } from "@/lib/rate-limit";
import { createPublicScan } from "@/lib/scan/create";
import { createAdminClient } from "@/lib/supabase/admin";

const createScanSchema = z.object({
  url: z.string().min(1),
  source: z.literal("public").optional().default("public"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let domain: string;
  let origin: string;
  try {
    ({ domain, origin } = normalizeDomain(parsed.data.url));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid domain" },
      { status: 400 },
    );
  }

  const source = parsed.data.source ?? "public";

  try {
    const admin = createAdminClient();

    if (source === "public") {
      const limit = await countRecentPublicScans(domain, admin);
      if (!limit.allowed) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            message: "Maximum 3 public scans per domain per 24 hours",
            count: limit.count,
          },
          { status: 429 },
        );
      }
    }

    const scan = await createPublicScan(admin, { domain, origin, source });

    return NextResponse.json(
      {
        token: scan.token,
        id: scan.id,
        status: scan.status,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: "Scan create failed", message }, { status: 500 });
  }
}
