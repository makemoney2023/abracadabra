import { NextResponse } from "next/server";
import { verifyWake } from "@/lib/agent-wake";

/** A signed note that one swarm run has finished. A bad signature is refused. */
export async function handleSwarmSettled(
  request: Request,
  deps: { secret: string; now: number; settle: (runId: string) => Promise<boolean> },
): Promise<Response> {
  const raw = await request.text();
  const signature = request.headers.get("x-handoff-signature") ?? "";
  if (!deps.secret || !verifyWake(deps.secret, raw, signature, deps.now)) {
    return new Response("Unauthorized", { status: 401 });
  }
  let runId = "";
  try {
    const body = JSON.parse(raw) as { runId?: unknown };
    if (typeof body.runId === "string") runId = body.runId.trim();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!runId) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const settled = await deps.settle(runId);
  return NextResponse.json({ ok: true, settled });
}
