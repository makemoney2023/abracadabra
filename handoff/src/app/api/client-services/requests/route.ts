import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { requestForThread } from "@/lib/agent-filing-review";
import { resolveClientRef } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/**
 * Client Services records the request it hands to a client's lead agent, so the card, the filings and the feed link
 * back to the original email. Bearer CLIENT_SERVICES_TOKEN. Makes no card (the agent does, with work_request_id).
 * Body: { client: { organization_id | domain | space_slug }, subject, thread_id, source_message_id?, client_email?,
 *         brief?, project_id? }. Same thread again returns the same request (200); new: 201.
 */
export async function POST(request: Request) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const str = (key: string, max: number) => (typeof body?.[key] === "string" && (body[key] as string).trim() ? (body[key] as string).trim().slice(0, max) : null);
  const subject = str("subject", 500);
  const threadId = str("thread_id", 500);
  if (!subject || !threadId) return NextResponse.json({ error: "subject and thread_id are required." }, { status: 400 });
  const sql = await openHandoffDb();
  await migrate(sql);
  const client = await resolveClientRef(sql, body.client);
  if (!client.ok) return NextResponse.json({ error: client.message }, { status: client.status });
  let projectId = str("project_id", 100);
  if (projectId) {
    const project = await sql.get<{ id: string }>("SELECT id FROM projects WHERE id = ? AND organization_id = ?", [projectId, client.organizationId]);
    if (!project) return NextResponse.json({ error: "That project is not this client's." }, { status: 400 });
  }
  const space = projectId
    ? await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE project_id = ? AND status = 'active' LIMIT 1", [projectId])
    : undefined;
  const before = await sql.get<{ n: number }>("SELECT count(*) AS n FROM client_work_requests WHERE organization_id = ?", [client.organizationId]);
  const id = await requestForThread(sql, {
    organizationId: client.organizationId,
    threadId,
    subject,
    brief: str("brief", 20000) ?? subject,
    projectId: projectId ?? null,
    workspaceId: space?.id ?? client.spaceId,
    clientEmail: str("client_email", 320)?.toLowerCase() ?? null,
    sourceMessageId: str("source_message_id", 500),
    now: Date.now(),
  });
  const after = await sql.get<{ n: number }>("SELECT count(*) AS n FROM client_work_requests WHERE organization_id = ?", [client.organizationId]);
  projectId = projectId ?? null;
  const created = Number(after?.n ?? 0) > Number(before?.n ?? 0);
  return NextResponse.json(
    { ok: true, work_request_id: id, organization_id: client.organizationId, project_id: projectId, created },
    { status: created ? 201 : 200 },
  );
}
