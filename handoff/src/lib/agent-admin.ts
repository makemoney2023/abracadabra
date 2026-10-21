import { objectStorageEnabled, openObjectStore } from "@/lib/store/objects";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { grantSkills, revokeSkills } from "@/lib/agent-skills";
import {
  discardUnfiledWork,
  endAssignment,
  fileUnfiledWork,
  registerClientAgent,
  revokeClientAgent,
  type UnfiledReason,
} from "@/lib/agent-work-filing";
import { parseLibraryManifest, type LibraryManifest, type SkillBucket } from "@/lib/skill-library";
import { loadCatalog, packsFrom } from "@/lib/skill-packs";
import type { ObjectStore } from "@/lib/store/objects";
import { isLiveSuperAdmin } from "@/lib/store/staff";
import { handOverWaitingTasks } from "@/lib/agent-dispatch";
import { legacyStartsAllowed } from "@/lib/agent-mode";

/**
 * Staff side of client agents: the unfiled inbox, the agents list, and the client "Agent work" panel.
 * Any live staff member can file or discard unfiled work, assign agents, and manage skill grants.
 * Minting, rotating, or revoking a token is admin only, because a token is a credential.
 */

export type StaffGate = { ok: true; actor: string } | { ok: false; error: string };

const NOT_STAFF = "Only HQ staff can do that.";
const NOT_ADMIN = "Only an HQ admin can issue, rotate, or revoke agent tokens.";

export async function liveStaff(sql: Sql, caller: Caller): Promise<StaffGate> {
  if (!caller.staff || !caller.userId) return { ok: false, error: NOT_STAFF };
  const row = await sql.get<{ ok: number }>("SELECT 1 AS ok FROM staff WHERE user_id = ? AND revoked_at IS NULL", [caller.userId]);
  return row?.ok === 1 ? { ok: true, actor: caller.userId } : { ok: false, error: NOT_STAFF };
}

async function liveAdmin(sql: Sql, caller: Caller): Promise<StaffGate> {
  const staff = await liveStaff(sql, caller);
  if (!staff.ok) return staff;
  return (await isLiveSuperAdmin(sql, caller)) ? staff : { ok: false, error: NOT_ADMIN };
}

export const UNFILED_REASON_LABEL: Record<UnfiledReason | "stuck", string> = {
  agent_not_assigned: "The agent isn't assigned to any client.",
  ambiguous_client: "The agent serves several clients and didn't say which.",
  client_mismatch: "The client it named isn't one it's assigned to.",
  project_not_open: "The project it named isn't open.",
  task_not_in_client: "The task it named belongs to another client.",
  no_space: "The client has no active space.",
  ambiguous_space: "The client has several spaces and it didn't say which.",
  space_rejected: "The space refused the files.",
  stuck: "Filing started but didn't finish.",
};

export function unfiledReasonLabel(reason: string | null, state: string): string {
  if (state === "received") return UNFILED_REASON_LABEL.stuck;
  return (reason && UNFILED_REASON_LABEL[reason as UnfiledReason]) || "It couldn't be filed.";
}

const STUCK_MS = 5 * 60 * 1000;

/** Sidebar badge: unfiled items plus filings stuck over five minutes. */
export async function unfiledCount(sql: Sql, now: number): Promise<number> {
  const row = await sql.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM agent_work_items WHERE state = 'unfiled' OR (state = 'received' AND created_at < ?)",
    [now - STUCK_MS],
  );
  return Number(row?.n ?? 0);
}

export type UnfiledRow = {
  id: string;
  agentId: string;
  agentLabel: string;
  title: string;
  kind: string;
  summary: string | null;
  state: string;
  reason: string;
  reasonCode: string | null;
  createdAt: number;
  suggestion: { organizationId: string; name: string; why: string } | null;
  domainHint: string | null;
  spaceHint: string | null;
  taskId: string | null;
  taskTitle: string | null;
};

export type FilingChoices = {
  clients: {
    id: string;
    name: string;
    domain: string | null;
    spaces: { id: string; name: string; slug: string; projectId: string | null }[];
    projects: { id: string; name: string }[];
    tasks: { id: string; title: string; projectId: string | null }[];
  }[];
};

type Payload = { client?: { domain?: string | null; spaceSlug?: string | null; organizationId?: string | null }; taskId?: string | null; summary?: string | null };

/** The unfiled inbox. The suggestion is only a hint (a domain match, or the agent's only client); staff decide. */
export async function listUnfiledForStaff(sql: Sql, caller: Caller, now: number): Promise<UnfiledRow[]> {
  if (!(await liveStaff(sql, caller)).ok) return [];
  const rows = await sql.all<{
    id: string; agent_id: string; agent_label: string; title: string; kind: string; summary: string | null; state: string;
    unfiled_reason: string | null; created_at: number; suggested_organization_id: string | null; suggested_name: string | null; payload_json: string | null;
  }>(
    `SELECT i.id, i.agent_id, a.label AS agent_label, i.title, i.kind, i.summary, i.state, i.unfiled_reason, i.created_at,
            i.suggested_organization_id, s.name AS suggested_name, i.payload_json
     FROM agent_work_items i
     JOIN client_agents a ON a.id = i.agent_id
     LEFT JOIN organizations s ON s.id = i.suggested_organization_id AND s.archived_at IS NULL
     WHERE i.state = 'unfiled' OR (i.state = 'received' AND i.created_at < ?)
     ORDER BY i.created_at LIMIT 200`,
    [now - STUCK_MS],
  );
  const out: UnfiledRow[] = [];
  for (const row of rows) {
    let payload: Payload = {};
    try {
      payload = row.payload_json ? (JSON.parse(row.payload_json) as Payload) : {};
    } catch {
      payload = {};
    }
    const domainHint = payload.client?.domain ?? null;
    let suggestion: UnfiledRow["suggestion"] = null;
    if (row.suggested_organization_id && row.suggested_name) {
      suggestion = { organizationId: row.suggested_organization_id, name: row.suggested_name, why: domainHint ? `Domain ${domainHint}` : "Matched by HQ" };
    } else {
      const only = await sql.all<{ id: string; name: string }>(
        `SELECT o.id, o.name FROM agent_assignments a JOIN organizations o ON o.id = a.organization_id
         WHERE a.agent_id = ? AND a.ended_at IS NULL AND o.archived_at IS NULL LIMIT 2`,
        [row.agent_id],
      );
      if (only.length === 1) suggestion = { organizationId: only[0].id, name: only[0].name, why: "The agent's only client" };
    }
    const task = payload.taskId
      ? await sql.get<{ id: string; title: string }>("SELECT id, title FROM tasks WHERE id = ?", [payload.taskId])
      : undefined;
    out.push({
      id: row.id,
      agentId: row.agent_id,
      agentLabel: row.agent_label,
      title: row.title,
      kind: row.kind,
      summary: row.summary ?? payload.summary ?? null,
      state: row.state,
      reason: unfiledReasonLabel(row.unfiled_reason, row.state),
      reasonCode: row.state === "received" ? "stuck" : row.unfiled_reason,
      createdAt: row.created_at,
      suggestion,
      domainHint,
      spaceHint: payload.client?.spaceSlug ?? null,
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
    });
  }
  return out;
}

/** Clients that can take filed work: live clients with an active space, their open projects and open tasks. */
export async function filingChoices(sql: Sql): Promise<FilingChoices> {
  const spaces = await sql.all<{ id: string; slug: string; display_name: string; organization_id: string; project_id: string | null; org_name: string; domain: string | null }>(
    `SELECT w.id, w.slug, w.display_name, w.organization_id, w.project_id, o.name AS org_name, o.domain
     FROM workspaces w JOIN organizations o ON o.id = w.organization_id
     WHERE w.status = 'active' AND o.archived_at IS NULL
     ORDER BY o.name, w.display_name`,
  );
  const orgIds = [...new Set(spaces.map((row) => row.organization_id))];
  if (orgIds.length === 0) return { clients: [] };
  const marks = orgIds.map(() => "?").join(", ");
  const [projects, tasks] = await Promise.all([
    sql.all<{ id: string; name: string; organization_id: string }>(
      `SELECT id, name, organization_id FROM projects WHERE organization_id IN (${marks})
       AND status IN ('planned', 'active', 'waiting_on_client') ORDER BY name`,
      orgIds,
    ),
    sql.all<{ id: string; title: string; organization_id: string; project_id: string | null }>(
      `SELECT id, title, organization_id, project_id FROM tasks WHERE organization_id IN (${marks}) AND status != 'done'
       ORDER BY updated_at DESC LIMIT 500`,
      orgIds,
    ),
  ]);
  const byOrg = new Map<string, FilingChoices["clients"][number]>();
  for (const row of spaces) {
    let entry = byOrg.get(row.organization_id);
    if (!entry) {
      entry = { id: row.organization_id, name: row.org_name, domain: row.domain, spaces: [], projects: [], tasks: [] };
      byOrg.set(row.organization_id, entry);
    }
    entry.spaces.push({ id: row.id, name: row.display_name, slug: row.slug, projectId: row.project_id });
  }
  for (const row of projects) byOrg.get(row.organization_id)?.projects.push({ id: row.id, name: row.name });
  for (const row of tasks) byOrg.get(row.organization_id)?.tasks.push({ id: row.id, title: row.title, projectId: row.project_id });
  return { clients: [...byOrg.values()] };
}

export type ActionOutcome = { ok: true; message: string } | { ok: false; error: string; field?: string };

/** target is "<organizationId>:<workspaceId>". taskId "" files with no task; "keep" keeps the agent's own task. */
export async function staffFileUnfiled(
  sql: Sql,
  store: ObjectStore,
  caller: Caller,
  input: { id: string; target: string; projectId?: string | null; taskId?: string | null; now: number },
): Promise<ActionOutcome> {
  const gate = await liveStaff(sql, caller);
  if (!gate.ok) return gate;
  const [organizationId, workspaceId] = input.target.split(":");
  if (!organizationId || !workspaceId) return { ok: false, error: "Pick a client and space.", field: "target" };
  const filed = await fileUnfiledWork(sql, store, {
    id: input.id,
    organizationId,
    workspaceId,
    projectId: input.projectId?.trim() || null,
    taskId: input.taskId === "keep" ? undefined : input.taskId?.trim() || null,
    actor: gate.actor,
    now: input.now,
  });
  if (!filed.ok) {
    if (filed.error === "missing") return { ok: false, error: "That item was already filed or discarded." };
    if (filed.error === "space_rejected") return { ok: false, error: "The space refused these files. Try another space." };
    return { ok: false, error: "That space, project, or task isn't part of this client.", field: "target" };
  }
  return { ok: true, message: filed.taskClosed ? "Filed, and the task is done." : "Filed. It is held until Client Services approves it." };
}

export async function staffDiscardUnfiled(sql: Sql, caller: Caller, input: { id: string; reason: string; now: number }): Promise<ActionOutcome> {
  const gate = await liveStaff(sql, caller);
  if (!gate.ok) return gate;
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: "Say why this is being discarded.", field: "reason" };
  const done = await discardUnfiledWork(sql, { id: input.id, actor: gate.actor, now: input.now, reason }, objectStorageEnabled() ? openObjectStore() : undefined);
  return done ? { ok: true, message: "Discarded." } : { ok: false, error: "That item was already filed or discarded." };
}

// ---------- Agents ----------

export type AgentRow = {
  id: string;
  label: string;
  status: "active" | "revoked" | "idle";
  createdAt: number;
  revokedAt: number | null;
  lastActivity: number | null;
  filedCount: number;
  unfiledCount: number;
  assignments: {
    organizationId: string;
    organizationName: string;
    role: "lead" | "hire";
    spaceId: string | null;
    spaceName: string | null;
    projectId: string | null;
    projectName: string | null;
    assignedAt: number;
  }[];
  grants: string[];
};

export async function listAgentsForStaff(sql: Sql, caller: Caller): Promise<AgentRow[]> {
  if (!(await liveStaff(sql, caller)).ok) return [];
  const agents = await sql.all<{ id: string; label: string; created_at: number; revoked_at: number | null }>(
    "SELECT id, label, created_at, revoked_at FROM client_agents ORDER BY revoked_at IS NOT NULL, label",
  );
  if (agents.length === 0) return [];
  const [assignments, counts, lastWork, lastActs, grants] = await Promise.all([
    sql.all<{
      agent_id: string; organization_id: string; org_name: string; role: string; workspace_id: string | null; space_name: string | null;
      project_id: string | null; project_name: string | null; assigned_at: number;
    }>(
      `SELECT a.agent_id, a.organization_id, o.name AS org_name, a.role, a.workspace_id, w.display_name AS space_name,
              a.project_id, p.name AS project_name, a.assigned_at
       FROM agent_assignments a
       JOIN organizations o ON o.id = a.organization_id
       LEFT JOIN workspaces w ON w.id = a.workspace_id
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.ended_at IS NULL ORDER BY o.name`,
    ),
    sql.all<{ agent_id: string; state: string; n: number }>("SELECT agent_id, state, COUNT(*) AS n FROM agent_work_items GROUP BY agent_id, state"),
    sql.all<{ agent_id: string; at: number }>("SELECT agent_id, MAX(updated_at) AS at FROM agent_work_items GROUP BY agent_id"),
    sql.all<{ actor_id: string; at: number }>(
      "SELECT actor_id, MAX(created_at) AS at FROM activities WHERE actor_kind = 'agent' AND kind LIKE 'client_agent.%' GROUP BY actor_id",
    ),
    sql.all<{ agent_id: string; prefix: string }>("SELECT agent_id, prefix FROM skill_grants WHERE agent_id IS NOT NULL AND revoked_at IS NULL ORDER BY prefix"),
  ]);
  return agents.map((agent) => {
    const mine = assignments.filter((row) => row.agent_id === agent.id);
    const count = (state: string) => Number(counts.find((row) => row.agent_id === agent.id && row.state === state)?.n ?? 0);
    const times = [lastWork.find((row) => row.agent_id === agent.id)?.at, lastActs.find((row) => row.actor_id === agent.id)?.at].filter(
      (value): value is number => typeof value === "number",
    );
    return {
      id: agent.id,
      label: agent.label,
      status: agent.revoked_at ? "revoked" : mine.length ? "active" : "idle",
      createdAt: agent.created_at,
      revokedAt: agent.revoked_at,
      lastActivity: times.length ? Math.max(...times) : null,
      filedCount: count("filed"),
      unfiledCount: count("unfiled"),
      assignments: mine.map((row) => ({
        organizationId: row.organization_id,
        organizationName: row.org_name,
        role: row.role === "hire" ? "hire" : "lead",
        spaceId: row.workspace_id,
        spaceName: row.space_name,
        projectId: row.project_id,
        projectName: row.project_name,
        assignedAt: row.assigned_at,
      })),
      grants: grants.filter((row) => row.agent_id === agent.id).map((row) => row.prefix),
    };
  });
}

/** Client-level grants (every agent on that client). */
export async function listClientGrants(sql: Sql, caller: Caller): Promise<{ organizationId: string; name: string; prefixes: string[] }[]> {
  if (!(await liveStaff(sql, caller)).ok) return [];
  const rows = await sql.all<{ organization_id: string; name: string; prefix: string }>(
    `SELECT g.organization_id, o.name, g.prefix FROM skill_grants g JOIN organizations o ON o.id = g.organization_id
     WHERE g.agent_id IS NULL AND g.revoked_at IS NULL AND o.archived_at IS NULL ORDER BY o.name, g.prefix`,
  );
  const out = new Map<string, { organizationId: string; name: string; prefixes: string[] }>();
  for (const row of rows) {
    const entry = out.get(row.organization_id) ?? { organizationId: row.organization_id, name: row.name, prefixes: [] };
    entry.prefixes.push(row.prefix);
    out.set(row.organization_id, entry);
  }
  return [...out.values()];
}

export type SkillPack = { prefix: string; name: string; count: number; description: string };

export type LibrarySummary = {
  ok: true;
  packs: SkillPack[];
  skillCount: number;
  version: string;
  /** skills/manifest.json from the last publish, or null when the library was published before manifests. */
  manifest: LibraryManifest | null;
  /** path → skill name, for the usage table. */
  skillNames: Map<string, string>;
};

/**
 * The published library (skills/index.json in R2) grouped with the shared pack rule (packsFrom in skill-packs.ts), so
 * the Agents page, the agent API, and attach_skills agree on what a pack is. Includes skill count and manifest.
 */
export async function skillPacksFromIndex(bucket: SkillBucket | undefined): Promise<LibrarySummary | { ok: false; error: string }> {
  if (!bucket) return { ok: false, error: "The skill library isn't connected here." };
  const catalog = await loadCatalog(bucket);
  if (!catalog.ok) {
    return { ok: false, error: catalog.message.includes("not been published") ? "The skill library hasn't been published yet." : "The skill library didn't answer." };
  }
  let manifest: LibraryManifest | null = null;
  try {
    const object = await bucket.get("skills/manifest.json");
    manifest = parseLibraryManifest(object ? await object.text() : null);
  } catch {
    manifest = null;
  }
  return {
    ok: true,
    packs: packsFrom(catalog.skills),
    skillCount: catalog.skills.length,
    version: catalog.version,
    manifest,
    skillNames: new Map(catalog.skills.map((skill) => [skill.path, skill.name])),
  };
}

export type RegisterOutcome = { ok: true; message: string; token: string | null; agentId: string } | { ok: false; error: string; field?: string };

export async function staffRegisterAgent(
  sql: Sql,
  caller: Caller,
  input: { agentId: string; label: string; organizationId: string; workspaceId?: string | null; projectId?: string | null; role: string; now: number },
): Promise<RegisterOutcome> {
  const gate = await liveAdmin(sql, caller);
  if (!gate.ok) return gate;
  const agentId = input.agentId.trim().toLowerCase();
  if (await sql.get("SELECT id FROM client_agents WHERE id = ?", [agentId])) {
    return { ok: false, error: "That agent id is taken. Assign the existing agent instead.", field: "agentId" };
  }
  if (!input.organizationId) return { ok: false, error: "Pick a client.", field: "organizationId" };
  const made = await registerClientAgent(sql, {
    agentId,
    label: input.label,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId || null,
    projectId: input.projectId || null,
    role: input.role === "hire" ? "hire" : "lead",
    actor: gate.actor,
    now: input.now,
  });
  if (!made.ok) return { ok: false, error: made.message, field: made.message.startsWith("agent_id") ? "agentId" : undefined };
  return { ok: true, message: "Agent registered. Copy the token now; it won't be shown again.", token: made.token, agentId };
}

export async function staffRotateAgent(sql: Sql, caller: Caller, input: { agentId: string; now: number }): Promise<RegisterOutcome> {
  const gate = await liveAdmin(sql, caller);
  if (!gate.ok) return gate;
  if (!(await sql.get("SELECT id FROM client_agents WHERE id = ?", [input.agentId]))) return { ok: false, error: "Unknown agent." };
  const made = await registerClientAgent(sql, { agentId: input.agentId, rotate: true, actor: gate.actor, now: input.now });
  if (!made.ok) return { ok: false, error: made.message };
  return { ok: true, message: "New token issued. The old one stopped working.", token: made.token, agentId: input.agentId };
}

export async function staffRevokeAgent(sql: Sql, caller: Caller, input: { agentId: string; now: number }): Promise<ActionOutcome> {
  const gate = await liveAdmin(sql, caller);
  if (!gate.ok) return gate;
  return (await revokeClientAgent(sql, input.agentId, input.now))
    ? { ok: true, message: "Token revoked. The agent can't call HQ until it's rotated." }
    : { ok: false, error: "That agent is already revoked." };
}

export async function staffAssignAgent(
  sql: Sql,
  caller: Caller,
  input: { agentId: string; organizationId: string; workspaceId?: string | null; projectId?: string | null; role: string; now: number },
): Promise<ActionOutcome> {
  const gate = await liveStaff(sql, caller);
  if (!gate.ok) return gate;
  if (!(await sql.get("SELECT id FROM client_agents WHERE id = ?", [input.agentId]))) return { ok: false, error: "Unknown agent." };
  if (!input.organizationId) return { ok: false, error: "Pick a client.", field: "organizationId" };
  const made = await registerClientAgent(sql, {
    agentId: input.agentId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId || null,
    projectId: input.projectId || null,
    role: input.role === "hire" ? "hire" : "lead",
    actor: gate.actor,
    now: input.now,
  });
  return made.ok ? { ok: true, message: "Assignment saved." } : { ok: false, error: made.message };
}

export async function staffUnassignAgent(sql: Sql, caller: Caller, input: { agentId: string; organizationId: string; now: number }): Promise<ActionOutcome> {
  const gate = await liveStaff(sql, caller);
  if (!gate.ok) return gate;
  return (await endAssignment(sql, { ...input, actor: gate.actor }))
    ? { ok: true, message: "Unassigned. Its filed work stays with the client." }
    : { ok: false, error: "That agent isn't assigned to this client." };
}

/** scope "client" grants to every agent on that client; "agent" is a per-agent extra. */
export async function staffGrantSkills(
  sql: Sql,
  caller: Caller,
  input: { scope: string; agentId?: string | null; organizationId?: string | null; prefixes: string[]; now: number },
): Promise<ActionOutcome> {
  const gate = await liveStaff(sql, caller);
  if (!gate.ok) return gate;
  const target = input.scope === "agent" ? { agentId: input.agentId || null, organizationId: null } : { agentId: null, organizationId: input.organizationId || null };
  if (input.scope === "agent" ? !target.agentId : !target.organizationId) return { ok: false, error: input.scope === "agent" ? "Pick an agent." : "Pick a client." };
  const granted = await grantSkills(sql, { ...target, prefixes: input.prefixes, actor: gate.actor, now: input.now });
  return granted.ok ? { ok: true, message: `Granted ${granted.prefixes.length} skill pack${granted.prefixes.length === 1 ? "" : "s"}.` } : { ok: false, error: granted.message, field: "prefixes" };
}

export async function staffRevokeSkill(
  sql: Sql,
  caller: Caller,
  input: { agentId?: string | null; organizationId?: string | null; prefix: string; now: number },
): Promise<ActionOutcome> {
  const gate = await liveStaff(sql, caller);
  if (!gate.ok) return gate;
  const count = await revokeSkills(sql, { agentId: input.agentId || null, organizationId: input.organizationId || null, prefixes: [input.prefix], now: input.now });
  return count ? { ok: true, message: "Grant removed." } : { ok: false, error: "That grant was already gone." };
}

// ---------- Client page panel ----------

export type ClientAgentWork = {
  agents: { id: string; label: string; role: "lead" | "hire"; revoked: boolean }[];
  filed: {
    id: string;
    title: string;
    kind: string;
    summary: string | null;
    agentId: string;
    agentLabel: string;
    filedAt: number;
    spaceSlug: string | null;
    spaceName: string | null;
    batchId: string | null;
    paths: string[];
    links: { label: string; url: string }[];
    taskTitle: string | null;
    taskClosed: boolean;
    handoffTo: string | null;
    /** held: waiting on Client Services; released: the client sees it; superseded / withdrawn: retired; published: filed before the hold. */
    visibility: "held" | "released" | "superseded" | "replacing" | "withdrawn" | "published";
    deliverableVersion: number | null;
    supersededBy: string | null;
  }[];
  updates: { id: string; kind: string; body: string; actorId: string | null; at: number }[];
};

export async function listClientAgentWork(sql: Sql, caller: Caller, organizationId: string): Promise<ClientAgentWork> {
  const empty: ClientAgentWork = { agents: [], filed: [], updates: [] };
  if (!(await liveStaff(sql, caller)).ok) return empty;
  const [agents, filed, updates] = await Promise.all([
    sql.all<{ id: string; label: string; role: string; revoked_at: number | null }>(
      `SELECT c.id, c.label, a.role, c.revoked_at FROM agent_assignments a JOIN client_agents c ON c.id = a.agent_id
       WHERE a.organization_id = ? AND a.ended_at IS NULL ORDER BY a.role, a.assigned_at`,
      [organizationId],
    ),
    sql.all<{
      id: string; title: string; kind: string; summary: string | null; agent_id: string; label: string; filed_at: number; slug: string | null;
      display_name: string | null; batch_id: string | null; paths_json: string; links_json: string; task_title: string | null; task_closed: number; handoff_to: string | null;
      held_at: number | null; hidden_at: number | null; released_at: number | null; retracted_at: number | null; superseded_by: string | null; deliverable_version: number | null;
    }>(
      `SELECT i.id, i.title, i.kind, i.summary, i.agent_id, c.label, i.filed_at, w.slug, w.display_name, i.batch_id, i.paths_json, i.links_json,
              t.title AS task_title, i.task_closed, i.handoff_to, b.held_at, b.hidden_at, i.released_at, i.retracted_at, i.superseded_by, i.deliverable_version
       FROM agent_work_items i JOIN client_agents c ON c.id = i.agent_id
       LEFT JOIN batches b ON b.id = i.batch_id
       LEFT JOIN workspaces w ON w.id = i.workspace_id
       LEFT JOIN tasks t ON t.id = i.task_id
       WHERE i.organization_id = ? AND i.state = 'filed'
       ORDER BY i.filed_at DESC LIMIT 50`,
      [organizationId],
    ),
    sql.all<{ id: string; kind: string; body: string | null; actor_id: string | null; created_at: number }>(
      `SELECT id, kind, body, actor_id, created_at FROM activities
       WHERE organization_id = ? AND kind IN ('client_agent.board', 'client_agent.handoff', 'client_agent.dispatch', 'client_agent.assigned', 'client_agent.unassigned',
                                              'client_agent.work_superseded', 'client_agent.work_withdrawn', 'client_work.update_ready')
       ORDER BY created_at DESC LIMIT 30`,
      [organizationId],
    ),
  ]);
  const parse = <T,>(raw: string, fallback: T): T => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };
  return {
    agents: agents.map((row) => ({ id: row.id, label: row.label, role: row.role === "hire" ? "hire" : "lead", revoked: row.revoked_at != null })),
    filed: filed.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      summary: row.summary,
      agentId: row.agent_id,
      agentLabel: row.label,
      filedAt: row.filed_at,
      spaceSlug: row.slug,
      spaceName: row.display_name,
      batchId: row.batch_id,
      paths: parse<string[]>(row.paths_json, []),
      links: parse<{ label: string; url: string }[]>(row.links_json, []),
      taskTitle: row.task_title,
      taskClosed: row.task_closed === 1,
      handoffTo: row.handoff_to,
      visibility: row.retracted_at != null
        ? "withdrawn" as const
        : row.superseded_by
          ? (row.hidden_at != null || (row.held_at != null && row.released_at == null) ? "superseded" as const : "replacing" as const)
          : row.released_at != null
            ? "released" as const
            : row.held_at != null
              ? "held" as const
              : "published" as const,
      deliverableVersion: row.deliverable_version,
      supersededBy: row.superseded_by,
    })),
    updates: updates.map((row) => ({ id: row.id, kind: row.kind, body: row.body ?? "", actorId: row.actor_id, at: row.created_at })),
  };
}

/** Staff button: hand the client's lead agent the tasks already waiting in build or run. AGENT_MODE=agents only. */
export async function staffHandOverWaiting(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; now: number },
): Promise<ActionOutcome> {
  const gate = await liveStaff(sql, caller);
  if (!gate.ok) return gate;
  if (legacyStartsAllowed()) return { ok: false, error: "AGENT_MODE is legacy, so build and run still start the swarm and Cursor. Nothing to hand over." };
  const handed = await handOverWaitingTasks(sql, { organizationId: input.organizationId, actor: { kind: "staff", id: gate.actor }, now: input.now });
  if (!handed.leadAgentId) return { ok: false, error: "This client has no lead agent. Assign one first." };
  return {
    ok: true,
    message: handed.taskIds.length
      ? `Handed ${handed.taskIds.length} waiting task${handed.taskIds.length === 1 ? "" : "s"} to ${handed.leadAgentId}.`
      : `Nothing waiting. ${handed.leadAgentId} already has every build and run task.`,
  };
}

// ---------- Skill usage and suggestions (Agents page) ----------

/** "Oct 9, 7:34 PM ET" for a published_at ISO time, in the agency's zone. */
export function publishedLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    year: at.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  return `${text} ET`;
}

/** Name, domain, website, industry, and notes of each live client, for pack suggestions. Staff only. */
export async function suggestionClients(
  sql: Sql,
  caller: Caller,
  ids: string[],
): Promise<{ id: string; name: string; domain: string | null; website: string | null; industry: string | null; notes: string | null }[]> {
  if (!(await liveStaff(sql, caller)).ok || ids.length === 0) return [];
  const marks = ids.map(() => "?").join(", ");
  return sql.all(
    `SELECT id, name, domain, website, industry, notes FROM organizations WHERE archived_at IS NULL AND id IN (${marks}) ORDER BY name`,
    ids,
  );
}
