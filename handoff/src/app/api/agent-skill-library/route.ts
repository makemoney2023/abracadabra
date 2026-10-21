import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken } from "@/lib/agent-work-filing";
import { cfEnv } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";
import { browseLibrary } from "@/lib/skill-packs";
import { logAgentSkillEvents } from "@/lib/skill-usage";

export const dynamic = "force-dynamic";

/**
 * The full skill library for any registered agent, granted or not: every pack with its skill count and description.
 * ?q= (words) and ?pack= (a pack prefix) also list matching skills. org/ is never shown. Bearer agent token.
 * ?task_id= ties the lookup to a card in the usage log (skill_events); it changes nothing in the answer.
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const q = params.get("q");
  const pack = params.get("pack");
  const result = await browseLibrary(cfEnv().SKILLS as SkillBucket | undefined, { q, pack });
  const searched = Boolean(q?.trim() || pack?.trim());
  await logAgentSkillEvents(sql, agent, { taskId: params.get("task_id"), source: "agent-skill-library", now: Date.now() }, [
    {
      event: searched ? "search" : "list",
      prefix: pack?.trim() || null,
      query: [q?.trim() ? `q=${q.trim()}` : "", pack?.trim() ? `pack=${pack.trim()}` : ""].filter(Boolean).join(" ") || null,
      resultCount: result.ok ? (searched ? (result.skills?.length ?? 0) : result.packs.length) : null,
      status: result.ok ? 200 : result.status,
      libraryVersion: result.ok ? result.library_version : null,
    },
  ]);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
