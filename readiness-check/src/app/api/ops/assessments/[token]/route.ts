import { NextResponse } from "next/server";
import { opsAssessment } from "@/lib/assessment/actions";
import { requireOpsSession } from "@/lib/ops/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireOpsSession();
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }
  const { token } = await context.params;
  try {
    const record = await opsAssessment(createAdminClient(), token);
    if (!record) return NextResponse.json({ error: "Check not found" }, { status: 404 });
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load check", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
