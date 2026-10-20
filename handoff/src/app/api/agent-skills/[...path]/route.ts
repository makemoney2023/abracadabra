import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { readAgentSkill } from "@/lib/agent-skills";
import { agentForToken } from "@/lib/agent-work-filing";
import { cfEnv } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";

export const dynamic = "force-dynamic";

/** One granted SKILL.md, e.g. /api/agent-skills/community/marketingskills/copywriting/SKILL.md. Bearer agent token. */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { path } = await context.params;
  const result = await readAgentSkill(sql, cfEnv().SKILLS as SkillBucket | undefined, agent, path.join("/"));
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result, { headers: { etag: `"${result.version}"` } });
}
