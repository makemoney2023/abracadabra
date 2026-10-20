import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken } from "@/lib/agent-work-filing";
import { cfEnv } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";
import { readLibrarySkill } from "@/lib/skill-packs";

export const dynamic = "force-dynamic";

/**
 * Any SKILL.md in the library, e.g. /api/agent-skill-library/community/marketingskills/copywriting/SKILL.md, with no
 * grant needed. org/ paths are 404. Bearer agent token.
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { path } = await context.params;
  const result = await readLibrarySkill(cfEnv().SKILLS as SkillBucket | undefined, path.join("/"));
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result, { headers: { etag: `"${result.version}"` } });
}
