import { NextResponse } from "next/server";
import { completeAssessment } from "@/lib/assessment/actions";
import { questionnaireAdmin } from "@/lib/assessment/d1-admin";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  try {
    const result = await completeAssessment(await questionnaireAdmin(), token);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to score check", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
