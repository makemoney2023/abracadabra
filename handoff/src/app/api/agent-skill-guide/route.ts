import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { AGENT_SKILL_GUIDE } from "@/lib/agent-skill-guide";
import { agentForToken } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/**
 * The agent skills guide: discover, pick, load, attach, cite, and mark whether a skill helped. Markdown by default;
 * ?format=json returns { guide }. Bearer: a registered agent token or the Client Services token. Nothing is logged or changed.
 */
export async function GET(request: Request) {
  if (!clientServicesAuthorized(request)) {
    const sql = await openHandoffDb();
    await migrate(sql);
    const agent = await agentForToken(sql, request.headers.get("authorization"));
    if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (new URL(request.url).searchParams.get("format") === "json") return NextResponse.json({ guide: AGENT_SKILL_GUIDE });
  return new NextResponse(AGENT_SKILL_GUIDE, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "private, no-store" } });
}
