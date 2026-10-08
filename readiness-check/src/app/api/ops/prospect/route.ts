import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { CheckBindings } from "@/lib/cloudflare/sql";

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

  const env = (await getCloudflareContext({ async: true })).env as CheckBindings;
  if (!env.SCAN_JOBS) {
    return NextResponse.json({ error: "Prospect queue unavailable" }, { status: 503 });
  }

  try {
    await env.SCAN_JOBS.send({ type: "prospect", objective: parsed.data.objective });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start prospecting";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(
    {
      accepted: true,
      message: "Prospecting started. Sites that need us become a lead we follow up on.",
    },
    { status: 202 },
  );
}
