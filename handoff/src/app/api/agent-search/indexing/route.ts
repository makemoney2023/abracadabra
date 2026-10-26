import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { openSearchDb } from "@/db/open-search";
import { agentForToken } from "@/lib/agent-work-filing";
import { agentSearchIndexing } from "@/lib/search/agent-search-api";

export const dynamic = "force-dynamic";

/**
 * Stored URL Inspection results and sitemaps for HQ agents. Bearer agent token; read-only; never calls Google
 * (inspection runs inside the daily sync within the property's inspect_budget).
 * ?client= &property= &url= (exact, adds its coverage history) | &url_prefix= &verdict=PASS|NEUTRAL|FAIL|...
 * &canonical_mismatch=1 &limit=1-1000 (default 100) &cursor=
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const result = await agentSearchIndexing(sql, await openSearchDb(), agent, { params: new URL(request.url).searchParams, now: Date.now() });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result.result);
}
