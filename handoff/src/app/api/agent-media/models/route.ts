import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken } from "@/lib/agent-work-filing";
import { publicMediaModels } from "@/lib/agent-media";

export const dynamic = "force-dynamic";

/** The stills and clips this agent may ask HQ to generate. Bearer is the agent's caw_ token. */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent || agent.assignments.length === 0) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ models: publicMediaModels() });
}
