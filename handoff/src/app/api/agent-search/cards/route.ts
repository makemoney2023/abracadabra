import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { openSearchDb } from "@/db/open-search";
import { agentForToken } from "@/lib/agent-work-filing";
import { parseAgentRange } from "@/lib/search/agent-search";
import { clientRef } from "@/lib/search/agent-search-api";
import { createSearchCard } from "@/lib/search/agent-search-cards";

export const dynamic = "force-dynamic";

/**
 * Turn one Search Console opportunity into a card on the client's HQ board (the existing agent card path). Bearer agent
 * token. Body: { opportunity_id, client?, property?, range?, title?, note?, assignee?, project_id? }.
 * 201 with the task. 400 bad body or range, 403 not this agent's client, 404 opportunity not in the current data,
 * 409 an open card already covers it (task_id), 429 five search cards for this client today (UTC). Nothing is published.
 */
export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  const range = parseAgentRange(str(body?.range));
  if (range === undefined) return NextResponse.json({ error: "range must be 7d, 28d, 90d, or 16m." }, { status: 400 });
  const result = await createSearchCard(sql, await openSearchDb(), agent, {
    client: clientRef(body?.client ?? body?.org),
    opportunityId: str(body?.opportunity_id) ?? "",
    propertyId: str(body?.property),
    range,
    title: str(body?.title),
    note: str(body?.note),
    assignee: str(body?.assignee),
    projectId: str(body?.project_id),
    now: Date.now(),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message, ...(result.task_id ? { task_id: result.task_id } : {}) }, { status: result.status });
  }
  return NextResponse.json(result, { status: 201 });
}
