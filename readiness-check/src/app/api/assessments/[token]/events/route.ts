import { NextResponse } from "next/server";
import { z } from "zod";
import { recordClientEvent } from "@/lib/assessment/actions";
import { questionnaireAdmin } from "@/lib/assessment/d1-admin";

type RouteContext = { params: Promise<{ token: string }> };

const schema = z.object({
  kind: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
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
    const result = await recordClientEvent(await questionnaireAdmin(), token, parsed.data.kind, parsed.data.data);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to record event", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
