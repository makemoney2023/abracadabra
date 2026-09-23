import { NextResponse } from "next/server";
import { z } from "zod";
import { patchAssessmentAnswer, readAssessment } from "@/lib/assessment/actions";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

const patchSchema = z.object({
  stepId: z.string().min(1),
  answer: z.unknown(),
});

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  try {
    const payload = await readAssessment(createAdminClient(), token);
    if (!payload) return NextResponse.json({ error: "Check not found" }, { status: 404 });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load check", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { token } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await patchAssessmentAnswer(createAdminClient(), token, parsed.data.stepId, parsed.data.answer);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save answer", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
