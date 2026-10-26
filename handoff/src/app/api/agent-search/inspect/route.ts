import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { openSearchDb } from "@/db/open-search";
import { agentForToken } from "@/lib/agent-work-filing";
import { clientRef } from "@/lib/search/agent-search-api";
import { requestInspection } from "@/lib/search/agent-inspect";

export const dynamic = "force-dynamic";

/**
 * Ask HQ to re-check URLs with URL Inspection. Bearer agent token. Body: { urls: [...] (1-20), client?, property? }.
 * No live Google call: asked URLs go first in the next daily inspection pass, inside the property's inspect_budget.
 * At most 20 asks per property per UTC day. 200 with queued and rejected (not_in_property, invalid, duplicate,
 * daily_limit). 400 bad body or inactive property, 403 not this agent's client, 404 property not on this client.
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
  const result = await requestInspection(sql, await openSearchDb(), agent, {
    client: clientRef(body?.client ?? body?.org),
    propertyId: typeof body?.property === "string" ? body.property : null,
    urls: body?.urls,
    now: Date.now(),
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
