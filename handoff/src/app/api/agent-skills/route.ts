import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { listAgentSkills } from "@/lib/agent-skills";
import { agentForToken } from "@/lib/agent-work-filing";
import { cfEnv } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";

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
  const result = await listAgentSkills(sql, cfEnv().SKILLS as SkillBucket | undefined, agent, params.get("q"), params.get("task_id"));
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
