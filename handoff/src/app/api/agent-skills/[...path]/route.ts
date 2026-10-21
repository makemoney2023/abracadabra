import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { readAgentSkill } from "@/lib/agent-skills";
import { agentForToken } from "@/lib/agent-work-filing";
import { cfEnv } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";
import { logAgentSkillEvents } from "@/lib/skill-usage";

export const dynamic = "force-dynamic";

/**
 * One granted SKILL.md, e.g. /api/agent-skills/community/marketingskills/copywriting/SKILL.md. Bearer agent token.
 * ?task_id= ties the read to a card in the usage log.
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { path } = await context.params;
  const skillPath = path.join("/");
  const result = await readAgentSkill(sql, cfEnv().SKILLS as SkillBucket | undefined, agent, skillPath);
  const taskId = new URL(request.url).searchParams.get("task_id");
  await logAgentSkillEvents(sql, agent, { taskId, source: "agent-skills", now: Date.now() }, [
    { event: "read", path: result.ok ? result.path : skillPath, status: result.ok ? 200 : result.status, libraryVersion: result.ok ? result.version : null },
  ]);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result, { headers: { etag: `"${result.version}"` } });
}
