import { NextResponse } from "next/server";
import { createAssessment } from "@/lib/assessment/actions";
import { allowAssessmentCreate, clientIp, hashIp } from "@/lib/assessment/ip-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const utm: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key.startsWith("utm_")) utm[key] = value;
  }
  const ipHash = hashIp(clientIp(request));
  if (!allowAssessmentCreate(ipHash)) {
    return NextResponse.json(
      { error: "Rate limit exceeded", message: "Maximum 20 checks per address per day" },
      { status: 429 },
    );
  }
  const created = await createAssessment(createAdminClient(), { utm, ipHash });
  return NextResponse.redirect(new URL(`/check/${created.token}`, request.url), 303);
}
