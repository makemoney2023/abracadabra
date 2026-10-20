import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { listClientProjects } from "@/lib/agent-projects";
import { resolveClientRef } from "@/lib/agent-work-filing";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/**
 * Client Services reads clients' projects, so a handoff to the lead agent (or a work request's project_id) can name
 * the right one. Bearer CLIENT_SERVICES_TOKEN. ?client= (organization id, domain, or space slug) narrows to one client;
 * without it, every client that has a live agent. ?closed=1 also lists done and archived projects.
 * Each client comes with its live agents (id, label, role).
 */
export async function GET(request: Request) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const sql = await openHandoffDb();
  await migrate(sql);
  const url = new URL(request.url);
  let orgs: string[];
  const client = url.searchParams.get("client")?.trim();
  if (client) {
    const ref = client.includes(".") ? { domain: client } : /^[0-9a-f-]{36}$/.test(client) ? { organization_id: client } : { space_slug: client };
    const found = await resolveClientRef(sql, ref);
    if (!found.ok) return NextResponse.json({ error: found.message }, { status: found.status });
    orgs = [found.organizationId];
  } else {
    const rows = await sql.all<{ organization_id: string }>(
      `SELECT DISTINCT a.organization_id FROM agent_assignments a JOIN client_agents c ON c.id = a.agent_id
       WHERE a.ended_at IS NULL AND c.revoked_at IS NULL`,
    );
    orgs = rows.map((row) => row.organization_id);
  }
  const projects = await listClientProjects(sql, orgs, { includeClosed: url.searchParams.get("closed") === "1" });
  const agents = orgs.length
    ? await sql.all<{ organization_id: string; id: string; label: string; role: string }>(
        `SELECT a.organization_id, c.id, c.label, a.role FROM agent_assignments a JOIN client_agents c ON c.id = a.agent_id
         WHERE a.ended_at IS NULL AND c.revoked_at IS NULL AND a.organization_id IN (${orgs.map(() => "?").join(", ")})
         ORDER BY CASE a.role WHEN 'lead' THEN 0 ELSE 1 END, a.assigned_at`,
        orgs,
      )
    : [];
  const clients = orgs.map((id) => ({
    organization_id: id,
    agents: agents.filter((row) => row.organization_id === id).map(({ id: agentId, label, role }) => ({ id: agentId, label, role })),
  }));
  return NextResponse.json({ projects, clients });
}
