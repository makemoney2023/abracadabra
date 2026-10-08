import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { InvalidJobError } from "@/lib/jobs/dispatch";
import { runCloudflareJob } from "@/lib/jobs/run-cloudflare";

function tokensMatch(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.byteLength !== b.byteLength || a.byteLength === 0) return false;
  let mismatch = 0;
  for (let i = 0; i < a.byteLength; i += 1) mismatch |= a[i]! ^ b[i]!;
  return mismatch === 0;
}

export async function POST(request: Request) {
  const env = (await getCloudflareContext({ async: true })).env as CheckBindings;
  const expected = env.CLOUDFLARE_API_TOKEN ?? "";
  const provided = request.headers.get("x-job-token") ?? "";
  if (!tokensMatch(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    await runCloudflareJob(body, env);
  } catch (err) {
    if (err instanceof InvalidJobError) {
      return NextResponse.json({ error: "Invalid job" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Job failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
