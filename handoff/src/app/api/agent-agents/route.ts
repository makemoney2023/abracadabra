import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken } from "@/lib/agent-work-filing";
import { listFunctionAgentsOnClient } from "@/lib/function-agents";
import { normalizeDomain } from "@/db/crm";

export const dynamic = "force-dynamic";

/**
 * The function agents (engineering, SEO, creative, social, ...) available on this agent's clients, with what each one
 * does and when to pick it, so a client lead agent can choose who a card goes to (POST /api/agent-board/tasks with
 * "assignee": "<agent_id>"). Read only. Bearer agent token.
 *
 * ?client=<organization id | domain | space slug> keeps one client (it must be one of the caller's own).
 * Without it, every client the caller is assigned to is listed. Revoked agents and ended assignments are left out.
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const ask = new URL(request.url).searchParams.get("client")?.trim() ?? "";
  let organizationIds = agent.assignments.map((row) => row.organizationId);
  if (ask) {
    const marks = organizationIds.map(() => "?").join(", ");
    const needle = ask.toLowerCase();
    const found = organizationIds.length
      ? await sql.all<{ id: string }>(
          `SELECT o.id FROM organizations o
           WHERE o.id IN (${marks}) AND o.archived_at IS NULL
             AND (o.id = ? OR o.domain = ? OR EXISTS (SELECT 1 FROM workspaces w WHERE w.organization_id = o.id AND w.slug = ? AND w.status = 'active'))`,
          [...organizationIds, ask, normalizeDomain(ask) ?? needle, needle],
        )
      : [];
    if (found.length !== 1) return NextResponse.json({ error: "This agent is not assigned to that client." }, { status: 403 });
    organizationIds = [found[0].id];
  }
  const clients = [];
  for (const organizationId of organizationIds) {
    const org = await sql.get<{ name: string; domain: string | null }>("SELECT name, domain FROM organizations WHERE id = ?", [organizationId]);
    const agents = (await listFunctionAgentsOnClient(sql, organizationId)).filter((row) => row.agentId !== agent.agentId);
    clients.push({
      organization_id: organizationId,
      name: org?.name ?? null,
      domain: org?.domain ?? null,
      agents: agents.map((row) => ({ agent_id: row.agentId, label: row.label, function: row.function, description: row.description })),
    });
  }
  return NextResponse.json({ ok: true, clients });
}
