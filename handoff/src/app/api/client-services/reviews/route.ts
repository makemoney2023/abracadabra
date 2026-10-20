import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { resolveClientRef } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";
import { listOpenReviews } from "@/lib/task-review";

export const dynamic = "force-dynamic";

/**
 * Client Services reads the cards waiting on its review. Bearer CLIENT_SERVICES_TOKEN.
 * ?client= (organization id, domain, or space slug) narrows to one client. ?limit= up to 200.
 * Each review has the task, client, project, stage, the ask's note and who asked, the client's agents, and the
 * work filed against the task (space paths and links).
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
  const reviews = await listOpenReviews(sql, { organizationId, limit: Number.isFinite(limit) ? limit : 100 });
  return NextResponse.json({ reviews });
}
