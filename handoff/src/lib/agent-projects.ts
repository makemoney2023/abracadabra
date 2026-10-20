import type { Sql } from "@/db/sql";
import { isLeadOn } from "@/lib/agent-board";
import { resolveClientRef, type AgentPrincipal } from "@/lib/agent-work-filing";
import { planProjectSpace } from "@/lib/project-space";

/**
 * Projects for client agents and Client Services. A client can have several projects; each project files into its own
 * Space. Leads open a new project for a new piece of client work; hires and other agents read the list.
 */

const OPEN_STATUSES = ["planned", "active", "waiting_on_client"];
/** Open projects one client may have before a lead has to close one (staff can still add more). */
export const MAX_OPEN_PROJECTS = 20;

export type ProjectListRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  name: string;
  status: string;
  open: boolean;
  description: string | null;
  space: { id: string; slug: string } | null;
  /** Cards on this project that are not done. */
  open_cards: number;
  created_at: string;
};

export type ProjectsError = { ok: false; status: 400 | 403 | 404 | 409; message: string };

/** Projects of these clients, open first, newest first. Each carries its active Space (oldest when several). */
export async function listClientProjects(sql: Sql, organizationIds: string[], opts: { includeClosed?: boolean } = {}): Promise<ProjectListRow[]> {
  if (organizationIds.length === 0) return [];
  const marks = organizationIds.map(() => "?").join(", ");
  const rows = await sql.all<{
    id: string; organization_id: string; organization_name: string; name: string; status: string; description: string | null;
    space_id: string | null; space_slug: string | null; open_cards: number; created_at: number;
  }>(
    `SELECT p.id, p.organization_id, o.name AS organization_name, p.name, p.status, p.description, p.created_at,
            (SELECT w.id FROM workspaces w WHERE w.project_id = p.id AND w.status = 'active' ORDER BY w.opened_at LIMIT 1) AS space_id,
            (SELECT w.slug FROM workspaces w WHERE w.project_id = p.id AND w.status = 'active' ORDER BY w.opened_at LIMIT 1) AS space_slug,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_cards
     FROM projects p JOIN organizations o ON o.id = p.organization_id
     WHERE p.organization_id IN (${marks}) AND o.archived_at IS NULL
       AND (? = 1 OR p.status IN ('planned', 'active', 'waiting_on_client'))
     ORDER BY o.name, CASE WHEN p.status IN ('planned', 'active', 'waiting_on_client') THEN 0 ELSE 1 END, p.created_at DESC
     LIMIT 500`,
    [...organizationIds, opts.includeClosed ? 1 : 0],
  );
  return rows.map((row) => ({
    id: row.id,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    name: row.name,
    status: row.status,
    open: OPEN_STATUSES.includes(row.status),
    description: row.description,
    space: row.space_id && row.space_slug ? { id: row.space_id, slug: row.space_slug } : null,
    open_cards: Number(row.open_cards ?? 0),
    created_at: new Date(row.created_at).toISOString(),
  }));
}

/** GET /api/agent-projects: projects of the clients this agent is assigned to now. client narrows to one. */
export async function listAgentProjects(
  sql: Sql,
  agent: AgentPrincipal,
  query: { client?: unknown; includeClosed?: boolean },
): Promise<{ ok: true; projects: ProjectListRow[] } | ProjectsError> {
  let orgs = agent.assignments.map((row) => row.organizationId);
  if (query.client) {
    const client = await resolveClientRef(sql, query.client);
    if (!client.ok || !orgs.includes(client.organizationId)) return { ok: false, status: 403, message: "This agent is not assigned to that client." };
    orgs = [client.organizationId];
  }
  return { ok: true, projects: await listClientProjects(sql, orgs, { includeClosed: query.includeClosed }) };
}

/**
 * POST /api/agent-projects: the client's lead agent opens a project, with its own Space (or the client's one loose
 * Space). A name the client already has (any case) returns that project, created: false. Hires get 403.
 */
export async function createAgentProject(
  sql: Sql,
  agent: AgentPrincipal,
  input: { client?: unknown; name: string; description?: string | null; now: number },
): Promise<{ ok: true; created: boolean; project: ProjectListRow } | ProjectsError> {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 200);
  if (!name) return { ok: false, status: 400, message: "name is required." };
  let organizationId: string | null = null;
  if (input.client) {
    const client = await resolveClientRef(sql, input.client);
    if (!client.ok || !agent.assignments.some((row) => row.organizationId === client.organizationId)) {
      return { ok: false, status: 403, message: "This agent is not assigned to that client." };
    }
    organizationId = client.organizationId;
  } else {
    if (agent.assignments.length !== 1) return { ok: false, status: 400, message: "Name the client." };
    organizationId = agent.assignments[0].organizationId;
  }
  if (!isLeadOn(agent, organizationId)) return { ok: false, status: 403, message: "Only the client's lead agent opens projects." };

  const existing = await sql.get<{ id: string }>(
    "SELECT id FROM projects WHERE organization_id = ? AND lower(name) = lower(?) ORDER BY created_at LIMIT 1",
    [organizationId, name],
  );
  if (existing) {
    const [project] = (await listClientProjects(sql, [organizationId], { includeClosed: true })).filter((row) => row.id === existing.id);
    return { ok: true, created: false, project };
  }
  const open = await sql.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM projects WHERE organization_id = ? AND status IN ('planned', 'active', 'waiting_on_client')",
    [organizationId],
  );
  if (Number(open?.n ?? 0) >= MAX_OPEN_PROJECTS) {
    return { ok: false, status: 409, message: `This client already has ${MAX_OPEN_PROJECTS} open projects. Ask Client Services to close one first.` };
  }
  const description = input.description?.trim().slice(0, 4000) || null;
  const plan = await planProjectSpace(sql, { organizationId, name, description, status: "active", now: input.now });
  const activity = {
    statement: `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
                VALUES (?, ?, ?, ?, 'client_agent.board', 'agent', ?, ?, ?, ?)`,
    params: [
      crypto.randomUUID(),
      organizationId,
      plan.projectId,
      plan.workspaceId,
      agent.agentId,
      `${agent.label}: Opened project "${name}"${plan.createdSpace ? " with a new space" : ""}.`.slice(0, 2000),
      JSON.stringify({ action: "create_project", project_id: plan.projectId, project_name: name, workspace_id: plan.workspaceId, created_space: plan.createdSpace, agent_id: agent.agentId }),
      input.now,
    ],
  };
  await sql.batch([...plan.writes, activity]);
  const [project] = (await listClientProjects(sql, [organizationId], { includeClosed: true })).filter((row) => row.id === plan.projectId);
  return { ok: true, created: true, project };
}
