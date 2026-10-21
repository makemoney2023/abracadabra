import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { listFilings } from "@/lib/agent-filing-review";
import { resolveClientRef } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/**
 * Agent filings with their visibility (held, released, superseded, withdrawn, published = filed before the hold).
 * Bearer CLIENT_SERVICES_TOKEN. ?client= (id, domain, or space slug) &task_id= &loose=1 (held on no card) &limit=
 */
export async function GET(request: Request) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const sql = await openHandoffDb();
  await migrate(sql);
  const url = new URL(request.url);
  let organizationId: string | null = null;
  const client = url.searchParams.get("client")?.trim();
  if (client) {
    const ref = client.includes(".") ? { domain: client } : /^[0-9a-f-]{36}$/.test(client) ? { organization_id: client } : { space_slug: client };
    const found = await resolveClientRef(sql, ref);
    if (!found.ok) return NextResponse.json({ error: found.message }, { status: found.status });
    organizationId = found.organizationId;
  }
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const filings = await listFilings(sql, {
    organizationId,
    taskId: url.searchParams.get("task_id")?.trim() || null,
    loose: url.searchParams.get("loose") === "1",
    limit: Number.isFinite(limit) ? limit : 100,
  });
  return NextResponse.json({ filings });
}
