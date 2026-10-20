import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken } from "@/lib/agent-work-filing";
import { cfEnv } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";
import { browseLibrary } from "@/lib/skill-packs";

export const dynamic = "force-dynamic";

/**
 * The full skill library for any registered agent, granted or not: every pack with its skill count and description.
 * ?q= (words) and ?pack= (a pack prefix) also list matching skills. org/ is never shown. Bearer agent token.
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const result = await browseLibrary(cfEnv().SKILLS as SkillBucket | undefined, { q: params.get("q"), pack: params.get("pack") });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
