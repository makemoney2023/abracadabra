import { NextResponse } from "next/server";
import { z } from "zod";
import { createAssessment } from "@/lib/assessment/actions";
import { allowAssessmentCreate, clientIp, hashIp } from "@/lib/assessment/ip-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  utm: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: Request) {
  let body: unknown = {};
  const text = await request.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const ipHash = hashIp(clientIp(request));
  if (!allowAssessmentCreate(ipHash)) {
    return NextResponse.json(
      { error: "Rate limit exceeded", message: "Maximum 20 checks per address per day" },
      { status: 429 },
    );
  }
  try {
    const created = await createAssessment(createAdminClient(), { utm: parsed.data.utm, ipHash });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Check create failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
