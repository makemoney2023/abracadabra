import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { generateAgentMedia, type MediaAi } from "@/lib/agent-media";
import { agentForToken } from "@/lib/agent-work-filing";
import { openObjectStore } from "@/lib/store/objects";

export const dynamic = "force-dynamic";

async function mediaAi(): Promise<MediaAi | null> {
  try {
    const env = (await getCloudflareContext({ async: true })).env as { AI?: MediaAi };
    return env.AI ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate a still or a clip for an open card. Bearer is the agent's caw_ token.
 * Body: { external_id, task_id, model, prompt, client?, image_media_id?, aspect_ratio?, duration_seconds? }
 * A clip that is still rendering returns state "running". Poll GET /api/agent-media/:id.
 */
export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await generateAgentMedia({
    sql,
    store: openObjectStore(),
    agent,
    body,
    now: Date.now(),
    ai: agent && agent.assignments.length > 0 ? await mediaAi() : null,
    fetchImpl: fetch,
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result.view, { status: result.status });
}
