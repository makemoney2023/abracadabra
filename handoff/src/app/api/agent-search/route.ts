import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { openSearchDb } from "@/db/open-search";
import { agentForToken } from "@/lib/agent-work-filing";
import { agentSearchRead } from "@/lib/search/agent-search-api";

export const dynamic = "force-dynamic";

/**
 * A client's Search Console data for HQ agents. Bearer agent token; read-only.
 * ?client= (org id, domain, or space slug; optional when the agent has one client) &property= (one property id)
 * &range=7d|28d|90d|16m (default 28d).
 * Per property: status, state (ok | empty | pending | unavailable + reason), last sync, data_through, totals with the
 * change vs the previous period, top 10 queries and pages, and opportunities (low_ctr, striking_distance, query_drop,
 * page_drop, site_drop), plus the latest search.data_updated event and how to turn an opportunity into a card.
 * 401 no token, 403 not this agent's client, 404 property not on this client, 400 bad range.
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const result = await agentSearchRead(sql, await openSearchDb(), agent, {
    client: params.get("client") ?? params.get("org"),
    property: params.get("property"),
    params,
    now: Date.now(),
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result.result);
}
