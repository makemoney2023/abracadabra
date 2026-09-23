import { NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { requireOpsSession } from "@/lib/ops/auth";

const bodySchema = z.object({
  objective: z.string().min(8).max(2000),
});

export async function POST(request: Request) {
  const session = await requireOpsSession();
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await inngest.send({
    name: "prospect/requested",
    data: {
      objective: parsed.data.objective,
      requestedBy: session.user.id,
    },
  });

  return NextResponse.json(
    {
      accepted: true,
      message: "Prospecting started — leads will appear in the inbox as scans complete.",
    },
    { status: 202 },
  );
}
