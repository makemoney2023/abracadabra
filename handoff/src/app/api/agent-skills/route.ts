import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { listAgentSkills } from "@/lib/agent-skills";
import { agentForToken } from "@/lib/agent-work-filing";
import { cfEnv } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";
import { logAgentSkillEvents } from "@/lib/skill-usage";

export const dynamic = "force-dynamic";

/**
 * Skills this agent may read: its grants, its clients' grants, and packs attached to open cards of its clients.
 * Bearer agent token. ?q= filters by words; ?task_id= keeps only that card's attached packs (grants stay).
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const q = params.get("q");
  const taskId = params.get("task_id");
  const result = await listAgentSkills(sql, cfEnv().SKILLS as SkillBucket | undefined, agent, q, taskId);
  await logAgentSkillEvents(sql, agent, { taskId, source: "agent-skills", now: Date.now() }, [
    {
      event: q?.trim() ? "search" : "list",
      query: q?.trim() ? `q=${q.trim()}` : null,
      resultCount: result.ok ? result.skills.length : null,
      status: result.ok ? 200 : result.status,
      libraryVersion: result.ok ? result.library_version : null,
    },
  ]);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
