import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { openSearchDb } from "@/db/open-search";
import { agentForToken } from "@/lib/agent-work-filing";
import { agentSearchRows } from "@/lib/search/agent-search-api";

export const dynamic = "force-dynamic";

/**
 * Row-level Search Console data for HQ agents. Bearer agent token; read-only; never calls Google.
 * ?client= &property= &dimension=query|page|query_page|country|device|country_device
 * &range=7d|28d|90d|16m or &start=YYYY-MM-DD[&end=] ; &compare=previous|none or &compare_start=&compare_end=
 * &page= (exact URL) | &page_prefix= ; &query_contains=a,b (any) &query_words=how,vs (whole words) &query_exclude=brand
 * &query_preset=questions ; &min_impressions= &sort=clicks|impressions|ctr|position &limit=1-1000 (default 100) &cursor=
 * 401 no token, 403 not this agent's client, 404 property not on this client, 400 bad params.
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const result = await agentSearchRows(sql, await openSearchDb(), agent, { params: new URL(request.url).searchParams, now: Date.now() });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result.result);
}
