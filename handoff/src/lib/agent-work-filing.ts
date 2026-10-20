import { normalizeDomain } from "@/db/crm";
import type { Sql } from "@/db/sql";
import type { ObjectStore } from "@/lib/store/objects";
import { storeWorkflowOutput, type WorkflowFile } from "@/lib/workflow-files";

/**
 * Finished work from a client's dedicated agent lands in that client's space on its own.
 * Routing never guesses: anything that does not resolve to exactly one client and one space waits as "unfiled" for staff.
 */

export const MAX_BODY_BYTES = 1_000_000;
const OPEN_PROJECT = "status IN ('planned', 'active', 'waiting_on_client')";
const KINDS = new Set(["report", "document", "research", "design", "copy", "code", "data", "other"]);
const AGENT_ID = /^[a-z0-9-]{2,64}$/;
const TOKEN_PREFIX = "caw_";

export type UnfiledReason =
  | "agent_not_assigned"
  | "client_archived"
  | "client_mismatch"
  | "project_not_open"
  | "task_not_in_client"
  | "no_space"
  | "ambiguous_space"
  | "space_rejected";

export type AgentPrincipal = { agentId: string; label: string; organizationId: string | null; workspaceId: string | null; projectId: string | null };

export type WorkPayload = {
  externalId: string;
  title: string;
  kind: string;
  summary: string | null;
  content: string | null;
  attachments: { name: string; body: string }[];
  links: { label: string; url: string }[];
  client: { organizationId: string | null; domain: string | null; spaceSlug: string | null };
  projectId: string | null;
  taskId: string | null;
  finishedAt: string | null;
  agentId: string | null;
};

export type FileResult =
  | { ok: true; duplicate: boolean; state: "filed"; workItemId: string; organizationId: string; workspaceId: string; spaceSlug: string; projectId: string | null; paths: string[]; route: string }
  | { ok: true; duplicate: boolean; state: "unfiled" | "received" | "discarded"; workItemId: string; reason: string | null }
  | { ok: false; error: "invalid"; message: string }
  | { ok: false; error: "forbidden"; message: string };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(size: number): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function text(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, max) : null;
}

function slug(value: string, max = 40): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
}

// ---------- Agents and tokens ----------

/**
 * Registers a client agent, or re-assigns an existing one. A token is returned only when one is minted
 * (a new agent, or rotate: true). Only its hash is stored.
 */
export async function registerClientAgent(
  sql: Sql,
  input: {
    agentId: string;
    label?: string | null;
    organizationId?: string | null;
    workspaceId?: string | null;
    projectId?: string | null;
    rotate?: boolean;
    actor: string;
    now: number;
  },
): Promise<{ ok: true; created: boolean; token: string | null } | { ok: false; message: string }> {
  const agentId = input.agentId.trim().toLowerCase();
  if (!AGENT_ID.test(agentId)) return { ok: false, message: "agent_id must be 2-64 lowercase letters, digits, or dashes." };
  const organizationId = input.organizationId?.trim() || null;
  const workspaceId = input.workspaceId?.trim() || null;
  const projectId = input.projectId?.trim() || null;
  if (organizationId) {
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE id = ? AND archived_at IS NULL", [organizationId]);
    if (!org) return { ok: false, message: "Unknown client." };
  }
  if (workspaceId) {
    const space = await sql.get<{ id: string }>(
      "SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND status = 'active'",
      [workspaceId, organizationId],
    );
    if (!space) return { ok: false, message: "That space is not an active space of this client." };
  }
  if (projectId) {
    const project = await sql.get<{ id: string }>("SELECT id FROM projects WHERE id = ? AND organization_id = ?", [projectId, organizationId]);
    if (!project) return { ok: false, message: "That project is not in this client." };
  }
  const existing = await sql.get<{ id: string; revoked_at: number | null }>("SELECT id, revoked_at FROM client_agents WHERE id = ?", [agentId]);
  const label = input.label?.trim().slice(0, 200) || agentId;
  if (!existing) {
    const token = `${TOKEN_PREFIX}${randomHex(32)}`;
    await sql.run(
      `INSERT INTO client_agents (id, label, token_hash, organization_id, workspace_id, project_id, assigned_by, assigned_at, created_at, updated_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [agentId, label, await sha256Hex(token), organizationId, workspaceId, projectId, organizationId ? input.actor : null, organizationId ? input.now : null, input.now, input.now],
    );
    await logAssignment(sql, agentId, organizationId, workspaceId, projectId, input.actor, input.now);
    return { ok: true, created: true, token };
  }
  let token: string | null = null;
  const writes: { statement: string; params: readonly unknown[] }[] = [
    {
      statement: `UPDATE client_agents SET label = ?, organization_id = ?, workspace_id = ?, project_id = ?, assigned_by = ?, assigned_at = ?, updated_at = ?
                  WHERE id = ?`,
      params: [label, organizationId, workspaceId, projectId, input.actor, input.now, input.now, agentId],
    },
  ];
  if (input.rotate) {
    token = `${TOKEN_PREFIX}${randomHex(32)}`;
    writes.push({ statement: "UPDATE client_agents SET token_hash = ?, revoked_at = NULL WHERE id = ?", params: [await sha256Hex(token), agentId] });
  }
  await sql.batch(writes);
  await logAssignment(sql, agentId, organizationId, workspaceId, projectId, input.actor, input.now);
  return { ok: true, created: false, token };
}

async function logAssignment(sql: Sql, agentId: string, organizationId: string | null, workspaceId: string | null, projectId: string | null, actor: string, now: number) {
  if (!organizationId) return;
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, ?, 'client_agent.assigned', 'agent', ?, ?, ?, ?)`,
    [crypto.randomUUID(), organizationId, projectId, workspaceId, actor, `Client agent ${agentId} assigned.`, JSON.stringify({ agent_id: agentId }), now],
  );
}

export async function revokeClientAgent(sql: Sql, agentId: string, now: number): Promise<boolean> {
  const row = await sql.get<{ id: string }>("SELECT id FROM client_agents WHERE id = ? AND revoked_at IS NULL", [agentId]);
  if (!row) return false;
  await sql.run("UPDATE client_agents SET revoked_at = ?, updated_at = ? WHERE id = ?", [now, now, agentId]);
  return true;
}

export async function agentForToken(sql: Sql, header: string | null): Promise<AgentPrincipal | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  const token = match?.[1] ?? "";
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 20) return null;
  const row = await sql.get<{ id: string; label: string; organization_id: string | null; workspace_id: string | null; project_id: string | null }>(
    "SELECT id, label, organization_id, workspace_id, project_id FROM client_agents WHERE token_hash = ? AND revoked_at IS NULL",
    [await sha256Hex(token)],
  );
  if (!row) return null;
  return { agentId: row.id, label: row.label, organizationId: row.organization_id, workspaceId: row.workspace_id, projectId: row.project_id };
}

// ---------- Payload ----------

export function parseWorkPayload(raw: unknown): { ok: true; payload: WorkPayload } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "Send a JSON object." };
  const body = raw as Record<string, unknown>;
  const externalId = text(body.external_id, 200);
  const title = text(body.title, 200);
  if (!externalId) return { ok: false, message: "external_id is required (your task or run id, used to skip repeats)." };
  if (!title) return { ok: false, message: "title is required." };
  const kind = (text(body.kind, 20) ?? "other").toLowerCase();
  if (!KINDS.has(kind)) return { ok: false, message: `kind must be one of ${[...KINDS].join(", ")}.` };
  const attachments: WorkPayload["attachments"] = [];
  if (body.attachments != null) {
    if (!Array.isArray(body.attachments)) return { ok: false, message: "attachments must be a list." };
    for (const item of body.attachments.slice(0, 20)) {
      const entry = item as Record<string, unknown> | null;
      const name = text(entry?.name, 120);
      const value = typeof entry?.body === "string" ? entry.body : null;
      if (!name || !value?.trim()) return { ok: false, message: "Each attachment needs a name and a body." };
      attachments.push({ name, body: value });
    }
  }
  const links: WorkPayload["links"] = [];
  if (body.links != null) {
    if (!Array.isArray(body.links)) return { ok: false, message: "links must be a list." };
    for (const item of body.links.slice(0, 50)) {
      const url = typeof item === "string" ? text(item, 2000) : text((item as Record<string, unknown> | null)?.url, 2000);
      if (!url || !/^https:\/\//i.test(url)) return { ok: false, message: "Each link must be an https URL." };
      const label = typeof item === "string" ? url : text((item as Record<string, unknown>).label, 200) ?? url;
      links.push({ label, url });
    }
  }
  const content = typeof body.content === "string" && body.content.trim() ? body.content : null;
  if (!content && attachments.length === 0 && links.length === 0) {
    return { ok: false, message: "Send content, attachments, or links." };
  }
  const client = body.client && typeof body.client === "object" && !Array.isArray(body.client) ? (body.client as Record<string, unknown>) : {};
  const domainRaw = text(client.domain, 255);
  return {
    ok: true,
    payload: {
      externalId,
      title,
      kind,
      summary: text(body.summary, 4000),
      content,
      attachments,
      links,
      client: {
        organizationId: text(client.organization_id, 100),
        domain: domainRaw ? normalizeDomain(domainRaw) : null,
        spaceSlug: text(client.space_slug, 100)?.toLowerCase() ?? null,
      },
      projectId: text(body.project_id, 100),
      taskId: text(body.task_id, 100),
      finishedAt: text(body.finished_at, 40),
      agentId: text(body.agent_id, 64)?.toLowerCase() ?? null,
    },
  };
}

// ---------- Routing ----------

type Space = { id: string; slug: string; project_id: string | null };

export type Route =
  | { ok: true; organizationId: string; space: Space; projectId: string | null; taskId: string | null; route: string }
  | { ok: false; reason: UnfiledReason; organizationId: string | null; suggestedOrganizationId: string | null };

/** Assignment decides the client. A hint in the payload may narrow the space, but never moves work to another client. */
export async function resolveRoute(sql: Sql, agent: AgentPrincipal, payload: WorkPayload): Promise<Route> {
  const hint = payload.client;
  let suggested: string | null = null;
  if (hint.domain) {
    const rows = await sql.all<{ id: string }>("SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL", [hint.domain]);
    if (rows.length === 1) suggested = rows[0].id;
  }
  if (!suggested && hint.spaceSlug) {
    const row = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM workspaces WHERE slug = ? AND status = 'active'", [hint.spaceSlug]);
    suggested = row?.organization_id ?? null;
  }
  if (!suggested && hint.organizationId) suggested = hint.organizationId;

  const organizationId = agent.organizationId;
  if (!organizationId) return { ok: false, reason: "agent_not_assigned", organizationId: null, suggestedOrganizationId: suggested };
  const org = await sql.get<{ id: string; domain: string | null }>("SELECT id, domain FROM organizations WHERE id = ? AND archived_at IS NULL", [organizationId]);
  if (!org) return { ok: false, reason: "client_archived", organizationId, suggestedOrganizationId: suggested };

  const mismatch =
    (hint.organizationId && hint.organizationId !== organizationId) ||
    (hint.domain && org.domain && hint.domain !== org.domain) ||
    (suggested && suggested !== organizationId);
  if (mismatch) return { ok: false, reason: "client_mismatch", organizationId, suggestedOrganizationId: suggested };

  let taskId: string | null = null;
  let taskProject: string | null = null;
  if (payload.taskId) {
    const task = await sql.get<{ id: string; project_id: string | null }>("SELECT id, project_id FROM tasks WHERE id = ? AND organization_id = ?", [payload.taskId, organizationId]);
    if (!task) return { ok: false, reason: "task_not_in_client", organizationId, suggestedOrganizationId: null };
    taskId = task.id;
    taskProject = task.project_id;
  }
  const projectHint = payload.projectId ?? taskProject;
  if (payload.projectId) {
    const project = await sql.get<{ id: string }>(`SELECT id FROM projects WHERE id = ? AND organization_id = ? AND ${OPEN_PROJECT}`, [payload.projectId, organizationId]);
    if (!project) return { ok: false, reason: "project_not_open", organizationId, suggestedOrganizationId: null };
  }

  const spaces = await sql.all<Space>(
    "SELECT id, slug, project_id FROM workspaces WHERE organization_id = ? AND status = 'active' ORDER BY opened_at",
    [organizationId],
  );
  const pick = (space: Space, route: string): Route => ({
    ok: true,
    organizationId,
    space,
    projectId: projectHint ?? space.project_id ?? agent.projectId,
    taskId,
    route,
  });
  if (hint.spaceSlug) {
    const named = spaces.find((space) => space.slug === hint.spaceSlug);
    if (named) return pick(named, "space_slug");
  }
  if (projectHint) {
    const linked = spaces.filter((space) => space.project_id === projectHint);
    if (linked.length === 1) return pick(linked[0], payload.projectId ? "project" : "task");
  }
  if (agent.workspaceId) {
    const assigned = spaces.find((space) => space.id === agent.workspaceId);
    if (assigned) return pick(assigned, "assigned_space");
  }
  if (spaces.length === 1) return pick(spaces[0], "only_space");
  return { ok: false, reason: spaces.length === 0 ? "no_space" : "ambiguous_space", organizationId, suggestedOrganizationId: null };
}

// ---------- Filing ----------

function summaryMarkdown(agent: AgentPrincipal, payload: WorkPayload, receivedAt: number): string {
  const lines = [`# ${payload.title}`, "", `- Kind: ${payload.kind}`, `- Agent: ${agent.label} (${agent.agentId})`];
  lines.push(`- Finished: ${payload.finishedAt ?? new Date(receivedAt).toISOString()}`);
  if (payload.taskId) lines.push(`- Task: ${payload.taskId}`);
  lines.push(`- Ref: ${payload.externalId}`);
  if (payload.summary) lines.push("", "## Summary", "", payload.summary);
  if (payload.links.length) {
    lines.push("", "## Links", "");
    for (const link of payload.links) lines.push(`- [${link.label.replace(/[[\]]/g, "")}](${link.url})`);
  }
  if (payload.attachments.length) {
    lines.push("", "## Files", "");
    for (const file of payload.attachments) lines.push(`- ${file.name}`);
  }
  if (payload.content && !payload.content.trim().startsWith("data:")) lines.push("", "---", "", payload.content);
  return lines.join("\n");
}

function filesFor(itemId: string, agent: AgentPrincipal, payload: WorkPayload, now: number): WorkflowFile[] {
  const date = new Date(now).toISOString().slice(0, 10);
  const run = `${date}-${slug(payload.title) || "work"}-${itemId.slice(0, 6)}`;
  const files: WorkflowFile[] = [{ workflow: "work", run, node: "summary", body: summaryMarkdown(agent, payload, now) }];
  if (payload.content?.trim().startsWith("data:")) files.push({ workflow: "work", run, node: "content", body: payload.content });
  const used = new Set(["summary", "content"]);
  for (const file of payload.attachments) {
    let node = slug(file.name.replace(/\.[a-z0-9]{1,8}$/i, ""), 50) || "file";
    while (used.has(node)) node = `${node}-2`;
    used.add(node);
    files.push({ workflow: "work", run, node, body: file.body });
  }
  return files;
}

async function writeFiled(
  sql: Sql,
  store: ObjectStore,
  input: { itemId: string; agent: AgentPrincipal; payload: WorkPayload; route: Extract<Route, { ok: true }>; actor: string; now: number },
): Promise<{ ok: true; paths: string[]; batchId: string } | { ok: false }> {
  const { route, payload, agent } = input;
  const stored = await storeWorkflowOutput({
    sql,
    store,
    organizationId: route.organizationId,
    workspaceId: route.space.id,
    projectId: route.projectId,
    files: filesFor(input.itemId, agent, payload, input.now),
    tag: "copy",
    label: `From ${agent.label}`.slice(0, 120),
    now: input.now,
  });
  if (!stored.batchId || stored.stored.length === 0) return { ok: false };
  await sql.batch([
    {
      statement: `UPDATE agent_work_items SET state = 'filed', organization_id = ?, workspace_id = ?, project_id = ?, task_id = ?, route = ?,
                    unfiled_reason = NULL, payload_json = NULL, batch_id = ?, paths_json = ?, filed_by = ?, filed_at = ?, updated_at = ?
                  WHERE id = ?`,
      params: [route.organizationId, route.space.id, route.projectId, route.taskId, route.route, stored.batchId, JSON.stringify(stored.stored), input.actor, input.now, input.now, input.itemId],
    },
    {
      statement: `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
                  VALUES (?, ?, ?, ?, 'client_agent.work_filed', 'agent', ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        route.organizationId,
        route.projectId,
        route.space.id,
        agent.agentId,
        `${agent.label} filed: ${payload.title}`.slice(0, 500),
        JSON.stringify({
          work_item_id: input.itemId,
          agent_id: agent.agentId,
          kind: payload.kind,
          task_id: route.taskId,
          route: route.route,
          filed_by: input.actor,
          paths: stored.stored,
          links: payload.links,
        }),
        input.now,
      ],
    },
  ]);
  return { ok: true, paths: stored.stored, batchId: stored.batchId };
}

async function markUnfiled(sql: Sql, itemId: string, agent: AgentPrincipal, payload: WorkPayload, reason: UnfiledReason, organizationId: string | null, suggested: string | null, now: number) {
  await sql.batch([
    {
      statement: `UPDATE agent_work_items SET state = 'unfiled', unfiled_reason = ?, organization_id = ?, suggested_organization_id = ?, updated_at = ? WHERE id = ?`,
      params: [reason, organizationId, suggested, now, itemId],
    },
    {
      statement: `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
                  VALUES (?, ?, 'client_agent.work_unfiled', 'agent', ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        organizationId,
        agent.agentId,
        `Agent work waits for filing (${reason}): ${payload.title}`.slice(0, 500),
        JSON.stringify({ work_item_id: itemId, agent_id: agent.agentId, reason, suggested_organization_id: suggested }),
        now,
      ],
    },
  ]);
}

async function existingResult(sql: Sql, agentId: string, externalId: string): Promise<FileResult | null> {
  const row = await sql.get<{ id: string; state: string; organization_id: string | null; workspace_id: string | null; project_id: string | null; paths_json: string; route: string | null; unfiled_reason: string | null }>(
    "SELECT id, state, organization_id, workspace_id, project_id, paths_json, route, unfiled_reason FROM agent_work_items WHERE agent_id = ? AND external_id = ?",
    [agentId, externalId],
  );
  if (!row) return null;
  if (row.state === "filed" && row.organization_id && row.workspace_id) {
    const space = await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [row.workspace_id]);
    return {
      ok: true,
      duplicate: true,
      state: "filed",
      workItemId: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      spaceSlug: space?.slug ?? "",
      projectId: row.project_id,
      paths: JSON.parse(row.paths_json) as string[],
      route: row.route ?? "",
    };
  }
  return { ok: true, duplicate: true, state: row.state as "unfiled" | "received" | "discarded", workItemId: row.id, reason: row.unfiled_reason };
}

/** POST /api/agent-work body, already authenticated as `agent`. Idempotent on (agent, external_id). */
export async function fileAgentWork(sql: Sql, store: ObjectStore, agent: AgentPrincipal, raw: unknown, now: number): Promise<FileResult> {
  const parsed = parseWorkPayload(raw);
  if (!parsed.ok) return { ok: false, error: "invalid", message: parsed.message };
  const payload = parsed.payload;
  if (payload.agentId && payload.agentId !== agent.agentId) return { ok: false, error: "forbidden", message: "agent_id does not match this token." };
  const seen = await existingResult(sql, agent.agentId, payload.externalId);
  if (seen) return seen;

  const itemId = crypto.randomUUID();
  try {
    await sql.run(
      `INSERT INTO agent_work_items (id, agent_id, external_id, state, kind, title, summary, organization_id, payload_json, links_json, created_at, updated_at)
       VALUES (?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, agent.agentId, payload.externalId, payload.kind, payload.title, payload.summary, agent.organizationId, JSON.stringify(payload), JSON.stringify(payload.links), now, now],
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      const raced = await existingResult(sql, agent.agentId, payload.externalId);
      if (raced) return raced;
    }
    throw error;
  }

  const route = await resolveRoute(sql, agent, payload);
  if (!route.ok) {
    await markUnfiled(sql, itemId, agent, payload, route.reason, route.organizationId, route.suggestedOrganizationId, now);
    return { ok: true, duplicate: false, state: "unfiled", workItemId: itemId, reason: route.reason };
  }
  const filed = await writeFiled(sql, store, { itemId, agent, payload, route, actor: "auto", now });
  if (!filed.ok) {
    await markUnfiled(sql, itemId, agent, payload, "space_rejected", route.organizationId, null, now);
    return { ok: true, duplicate: false, state: "unfiled", workItemId: itemId, reason: "space_rejected" };
  }
  return {
    ok: true,
    duplicate: false,
    state: "filed",
    workItemId: itemId,
    organizationId: route.organizationId,
    workspaceId: route.space.id,
    spaceSlug: route.space.slug,
    projectId: route.projectId,
    paths: filed.paths,
    route: route.route,
  };
}

// ---------- Unfiled inbox (staff) ----------

export type UnfiledItem = {
  id: string;
  agent_id: string;
  agent_label: string;
  title: string;
  kind: string;
  state: string;
  unfiled_reason: string | null;
  organization_id: string | null;
  organization_name: string | null;
  suggested_organization_id: string | null;
  suggested_organization_name: string | null;
  created_at: number;
};

/** Unfiled work, plus anything stuck in "received" for over five minutes. */
export async function listUnfiledWork(sql: Sql, now: number): Promise<UnfiledItem[]> {
  return sql.all<UnfiledItem>(
    `SELECT i.id, i.agent_id, a.label AS agent_label, i.title, i.kind, i.state, i.unfiled_reason, i.organization_id, o.name AS organization_name,
            i.suggested_organization_id, s.name AS suggested_organization_name, i.created_at
     FROM agent_work_items i
     JOIN client_agents a ON a.id = i.agent_id
     LEFT JOIN organizations o ON o.id = i.organization_id
     LEFT JOIN organizations s ON s.id = i.suggested_organization_id
     WHERE i.state = 'unfiled' OR (i.state = 'received' AND i.created_at < ?)
     ORDER BY i.created_at LIMIT 100`,
    [now - 5 * 60 * 1000],
  );
}

/** Staff pick the client and space for one unfiled item. The pick is checked; nothing is guessed. */
export async function fileUnfiledWork(
  sql: Sql,
  store: ObjectStore,
  input: { id: string; organizationId: string; workspaceId: string; projectId?: string | null; actor: string; now: number },
): Promise<{ ok: true; paths: string[] } | { ok: false; error: "missing" | "invalid" | "space_rejected" }> {
  const row = await sql.get<{ id: string; agent_id: string; state: string; payload_json: string | null }>(
    "SELECT id, agent_id, state, payload_json FROM agent_work_items WHERE id = ?",
    [input.id],
  );
  if (!row || (row.state !== "unfiled" && row.state !== "received") || !row.payload_json) return { ok: false, error: "missing" };
  const space = await sql.get<Space>(
    `SELECT w.id, w.slug, w.project_id FROM workspaces w JOIN organizations o ON o.id = w.organization_id
     WHERE w.id = ? AND w.organization_id = ? AND w.status = 'active' AND o.archived_at IS NULL`,
    [input.workspaceId, input.organizationId],
  );
  if (!space) return { ok: false, error: "invalid" };
  const projectId = input.projectId?.trim() || space.project_id;
  if (input.projectId) {
    const project = await sql.get<{ id: string }>("SELECT id FROM projects WHERE id = ? AND organization_id = ?", [input.projectId, input.organizationId]);
    if (!project) return { ok: false, error: "invalid" };
  }
  const agentRow = await sql.get<{ id: string; label: string }>("SELECT id, label FROM client_agents WHERE id = ?", [row.agent_id]);
  const agent: AgentPrincipal = { agentId: row.agent_id, label: agentRow?.label ?? row.agent_id, organizationId: input.organizationId, workspaceId: space.id, projectId };
  const payload = JSON.parse(row.payload_json) as WorkPayload;
  const filed = await writeFiled(sql, store, {
    itemId: row.id,
    agent,
    payload: { ...payload, taskId: null },
    route: { ok: true, organizationId: input.organizationId, space, projectId, taskId: null, route: "staff" },
    actor: input.actor,
    now: input.now,
  });
  if (!filed.ok) return { ok: false, error: "space_rejected" };
  return { ok: true, paths: filed.paths };
}

export async function discardUnfiledWork(sql: Sql, input: { id: string; actor: string; now: number }): Promise<boolean> {
  const row = await sql.get<{ id: string }>("SELECT id FROM agent_work_items WHERE id = ? AND state IN ('unfiled', 'received')", [input.id]);
  if (!row) return false;
  await sql.run("UPDATE agent_work_items SET state = 'discarded', payload_json = NULL, filed_by = ?, updated_at = ? WHERE id = ?", [input.actor, input.now, input.id]);
  return true;
}
