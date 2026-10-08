import { NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";

const bodySchema = z.object({
  objective: z.string().min(8).max(2000),
});

export async function POST(request: Request) {
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
    data: { objective: parsed.data.objective },
  });

  return NextResponse.json(
    {
      accepted: true,
      message: "Prospecting started. Sites that need us become a lead we follow up on.",
    },
    { status: 202 },
  );
}
