import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { readAgentMedia, type MediaAi } from "@/lib/agent-media";
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

/** Poll a clip. HQ asks the model again. The answer never includes a provider URL. */
export async function GET(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  const { mediaId } = await context.params;
  const result = await readAgentMedia({
    sql,
    store: openObjectStore(),
    agent,
    mediaId,
    now: Date.now(),
    ai: agent && agent.assignments.length > 0 ? await mediaAi() : null,
    fetchImpl: fetch,
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result.view, { status: result.status });
}
