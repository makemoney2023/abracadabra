import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken, readAgentContextItem } from "@/lib/agent-work-filing";

export const dynamic = "force-dynamic";

/** One filed item with its summary markdown. Only for an agent assigned to that client now. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await context.params;
  const item = await readAgentContextItem(sql, agent, id);
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(item);
}
