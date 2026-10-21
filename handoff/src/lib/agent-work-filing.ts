import { normalizeDomain } from "@/db/crm";
import { skillObjectKey } from "@/lib/skill-library";
import type { Sql } from "@/db/sql";
import type { ObjectStore } from "@/lib/store/objects";
import { storeWorkflowOutput, workflowFileExtension, type WorkflowFile } from "@/lib/workflow-files";
import { cleanFolder, defaultFolder, fileStem } from "@/lib/work-folder";
import { agentWorkLimits, MAX_ATTACHMENTS, storedBytes, tooBigMessage } from "@/lib/agent-work-limits";
import { checkSupersedes, recordFiling, resolveFilingRequest, type FilingReview } from "@/lib/agent-filing-review";
import { handOverWaitingTasks } from "@/lib/agent-dispatch";
import { builtWorkByItem, builtWorkMarkdown, builtWorkWrites, parseBuiltWork, type BuiltWorkInput } from "@/lib/built-work";
import { legacyStartsAllowed } from "@/lib/agent-mode";

/**
 * Work from client agents (Grok Bot teammates and hires) lands in the right client space on its own.
 * Routing never guesses: anything that does not resolve to exactly one assigned client and one space waits as "unfiled".
 * Filed work is kept as context the client's agents can read back.
 */

/** Default raw body cap. The live cap comes from agentWorkLimits() (AGENT_WORK_MAX_MB, default 10 MB of files). */
export const MAX_BODY_BYTES = agentWorkLimits().maxBodyBytes;
const CONTEXT_LIMIT = 100_000;
/** A payload bigger than this waits in R2 (payload_key) while unfiled, never in a D1 row (2 MB row cap). */
const INLINE_PAYLOAD_BYTES = 256 * 1024;
/** R2 namespace for unfiled payloads. Object keys are three UUIDs: namespace / work item / object. */
export const PAYLOAD_NAMESPACE = "a9e7f11e-0000-4000-8000-000000000000";
const OPEN_PROJECT = "status IN ('planned', 'active', 'waiting_on_client')";
export const WORK_KINDS = [
  "report", "document", "research", "design", "copy", "code", "data",
  "note", "plan", "decision", "meeting", "log", "handoff", "catalog", "other",
] as const;
const KINDS = new Set<string>(WORK_KINDS);
const AGENT_ID = /^[a-z0-9-]{2,64}$/;
const TOKEN_PREFIX = "caw_";

export type UnfiledReason =
  | "agent_not_assigned"
  | "ambiguous_client"
  | "client_mismatch"
  | "project_not_open"
  | "task_not_in_client"
  | "no_space"
  | "ambiguous_space"
  | "space_rejected";

export type Assignment = { organizationId: string; workspaceId: string | null; projectId: string | null; role: "lead" | "hire" };
export type AgentPrincipal = { agentId: string; label: string; assignments: Assignment[] };

export function assignmentFor(agent: AgentPrincipal, organizationId: string): Assignment | null {
  return agent.assignments.find((row) => row.organizationId === organizationId) ?? null;
}

export type WorkPayload = {
  externalId: string;
  title: string;
  kind: string;
  summary: string | null;
  /** Client-facing summary (plain words, no ids). Shown first to client members; summary stays the agent's note. */
  clientSummary: string | null;
  content: string | null;
  attachments: { name: string; body: string }[];
  links: { label: string; url: string }[];
  client: { organizationId: string | null; domain: string | null; spaceSlug: string | null };
  projectId: string | null;
  taskId: string | null;
  keepTaskOpen: boolean;
  handoffTo: string | null;
  handoffNote: string | null;
  finishedAt: string | null;
  agentId: string | null;
  /** Earlier filings (work item ids) this one replaces. */
  supersedes: string[];
  /** The Client Services request this work answers: client_work_requests id, or the email thread id. */
  workRequestId: string | null;
  threadId: string | null;
  /** Deliverable kind for the card's deliverable (social_pack, website, document, brief, design_system, other). */
  deliverableKind: string | null;
  /** Folder in the space, like "Social/Facebook". null: Finished work/<date> <title>. */
  folder: string | null;
  /** Skill paths the agent followed ("community/x/y/SKILL.md"). Checked against the published index after filing. */
  skillsUsed?: string[];
  /** Websites and other things built, shown as cards in the client space (src/lib/built-work.ts). */
  builtWork?: BuiltWorkInput[];
  /** Finished before it was filed (already_delivered: true, or kind "catalog"): approval publishes it as delivered, with no client update. */
  alreadyDelivered?: boolean;
};

export type FileResult =
  | {
      ok: true; duplicate: boolean; state: "filed"; workItemId: string; organizationId: string; workspaceId: string;
      spaceSlug: string; projectId: string | null; paths: string[]; route: string; taskClosed: boolean; handoffTo: string | null; awaitingReview?: boolean;
      held?: boolean; review?: FilingReview; folder?: string | null; builtWork?: number;
    }
  | { ok: true; duplicate: boolean; state: "unfiled" | "received" | "discarded"; workItemId: string; reason: string | null }
  | { ok: false; error: "invalid"; message: string }
  | { ok: false; error: "forbidden"; message: string }
  | { ok: false; error: "too_big"; message: string };

type Write = { statement: string; params: readonly unknown[] };

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

// ---------- Agents, assignments, tokens ----------

/**
 * Registers a client agent (or updates its label) and, when a client is named, adds or updates that assignment.
 * A token is returned only when one is minted (a new agent, or rotate: true). Only its hash is stored.
 */
export async function registerClientAgent(
  sql: Sql,
  input: {
    agentId: string;
    label?: string | null;
    organizationId?: string | null;
    workspaceId?: string | null;
    projectId?: string | null;
    role?: "lead" | "hire";
    rotate?: boolean;
    actor: string;
    now: number;
  },
): Promise<{ ok: true; created: boolean; token: string | null; handedOver?: string[] } | { ok: false; message: string }> {
  const agentId = input.agentId.trim().toLowerCase();
  if (!AGENT_ID.test(agentId)) return { ok: false, message: "agent_id must be 2-64 lowercase letters, digits, or dashes." };
  const organizationId = input.organizationId?.trim() || null;
  const workspaceId = input.workspaceId?.trim() || null;
  const projectId = input.projectId?.trim() || null;
  const role = input.role === "hire" ? "hire" : "lead";
  if (!organizationId && (workspaceId || projectId)) return { ok: false, message: "Name the client for that space or project." };
  if (organizationId) {
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE id = ? AND archived_at IS NULL", [organizationId]);
    if (!org) return { ok: false, message: "Unknown client." };
  }
  if (workspaceId) {
    const space = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND status = 'active'", [workspaceId, organizationId]);
    if (!space) return { ok: false, message: "That space is not an active space of this client." };
  }
  if (projectId) {
    const project = await sql.get<{ id: string }>("SELECT id FROM projects WHERE id = ? AND organization_id = ?", [projectId, organizationId]);
    if (!project) return { ok: false, message: "That project is not in this client." };
  }
  const existing = await sql.get<{ id: string }>("SELECT id FROM client_agents WHERE id = ?", [agentId]);
  const label = input.label?.trim().slice(0, 200) || null;
  const writes: Write[] = [];
  let token: string | null = null;
  if (!existing) {
    token = `${TOKEN_PREFIX}${randomHex(32)}`;
    writes.push({
      statement: "INSERT INTO client_agents (id, label, token_hash, created_by, created_at, updated_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
      params: [agentId, label ?? agentId, await sha256Hex(token), input.actor, input.now, input.now],
    });
  } else {
    if (label) writes.push({ statement: "UPDATE client_agents SET label = ?, updated_at = ? WHERE id = ?", params: [label, input.now, agentId] });
    if (input.rotate) {
      token = `${TOKEN_PREFIX}${randomHex(32)}`;
      writes.push({ statement: "UPDATE client_agents SET token_hash = ?, revoked_at = NULL, updated_at = ? WHERE id = ?", params: [await sha256Hex(token), input.now, agentId] });
    }
  }
  if (organizationId) {
    const live = await sql.get<{ id: string }>(
      "SELECT id FROM agent_assignments WHERE agent_id = ? AND organization_id = ? AND ended_at IS NULL",
      [agentId, organizationId],
    );
    if (live) {
      writes.push({
        statement: "UPDATE agent_assignments SET workspace_id = ?, project_id = ?, role = ?, assigned_by = ?, assigned_at = ? WHERE id = ?",
        params: [workspaceId, projectId, role, input.actor, input.now, live.id],
      });
    } else {
      writes.push({
        statement: `INSERT INTO agent_assignments (id, agent_id, organization_id, workspace_id, project_id, role, assigned_by, assigned_at, ended_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        params: [crypto.randomUUID(), agentId, organizationId, workspaceId, projectId, role, input.actor, input.now],
      });
    }
    writes.push({
      statement: `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
                  VALUES (?, ?, ?, ?, 'client_agent.assigned', 'agent', ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), organizationId, projectId, workspaceId, input.actor, `Client agent ${agentId} assigned as ${role}.`, JSON.stringify({ agent_id: agentId, role }), input.now],
    });
  }
  if (writes.length) await sql.batch(writes);
  // AGENT_MODE=agents: a new lead also gets the tasks already waiting in build or run.
  if (organizationId && role === "lead" && !legacyStartsAllowed()) {
    const handed = await handOverWaitingTasks(sql, { organizationId, actor: { kind: "system", id: input.actor }, now: input.now });
    if (handed.leadAgentId === agentId) return { ok: true, created: !existing, token, handedOver: handed.taskIds };
  }
  return { ok: true, created: !existing, token };
}

/** Ends one agent's assignment to one client. Its filed work stays with the client. */
export async function endAssignment(sql: Sql, input: { agentId: string; organizationId: string; actor: string; now: number }): Promise<boolean> {
  const live = await sql.get<{ id: string }>(
    "SELECT id FROM agent_assignments WHERE agent_id = ? AND organization_id = ? AND ended_at IS NULL",
    [input.agentId, input.organizationId],
  );
  if (!live) return false;
  await sql.batch([
    { statement: "UPDATE agent_assignments SET ended_at = ? WHERE id = ?", params: [input.now, live.id] },
    {
      statement: `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
                  VALUES (?, ?, 'client_agent.unassigned', 'agent', ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), input.organizationId, input.actor, `Client agent ${input.agentId} unassigned.`, JSON.stringify({ agent_id: input.agentId }), input.now],
    },
  ]);
  return true;
}

export async function revokeClientAgent(sql: Sql, agentId: string, now: number): Promise<boolean> {
  const row = await sql.get<{ id: string }>("SELECT id FROM client_agents WHERE id = ? AND revoked_at IS NULL", [agentId]);
  if (!row) return false;
  await sql.run("UPDATE client_agents SET revoked_at = ?, updated_at = ? WHERE id = ?", [now, now, agentId]);
  return true;
}

async function assignmentsFor(sql: Sql, agentId: string): Promise<Assignment[]> {
  const rows = await sql.all<{ organization_id: string; workspace_id: string | null; project_id: string | null; role: string }>(
    `SELECT a.organization_id, a.workspace_id, a.project_id, a.role FROM agent_assignments a
     JOIN organizations o ON o.id = a.organization_id
     WHERE a.agent_id = ? AND a.ended_at IS NULL AND o.archived_at IS NULL ORDER BY a.assigned_at`,
    [agentId],
  );
  return rows.map((row) => ({ organizationId: row.organization_id, workspaceId: row.workspace_id, projectId: row.project_id, role: row.role === "hire" ? "hire" : "lead" }));
}

export async function agentForToken(sql: Sql, header: string | null): Promise<AgentPrincipal | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  const token = match?.[1] ?? "";
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 20) return null;
  const row = await sql.get<{ id: string; label: string }>(
    "SELECT id, label FROM client_agents WHERE token_hash = ? AND revoked_at IS NULL",
    [await sha256Hex(token)],
  );
  if (!row) return null;
  return { agentId: row.id, label: row.label, assignments: await assignmentsFor(sql, row.id) };
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
  if (!KINDS.has(kind)) return { ok: false, message: `kind must be one of ${WORK_KINDS.join(", ")}.` };
  const attachments: WorkPayload["attachments"] = [];
  if (body.attachments != null) {
    if (!Array.isArray(body.attachments)) return { ok: false, message: "attachments must be a list." };
    if (body.attachments.length > MAX_ATTACHMENTS) return { ok: false, message: `Up to ${MAX_ATTACHMENTS} attachments a filing. Split the rest into another filing on the same card.` };
    for (const item of body.attachments) {
      const entry = item as Record<string, unknown> | null;
      const name = text(entry?.name, 120);
      // body, or content (same meaning): text, or a base64 data URL (data:image/png;base64,... or data:application/pdf;base64,...).
      const value = typeof entry?.body === "string" ? entry.body : typeof entry?.content === "string" ? entry.content : null;
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
  const built = parseBuiltWork(body.built_work, attachments);
  if (!built.ok) return { ok: false, message: built.message };
  attachments.push(...built.added);
  if (attachments.length > MAX_ATTACHMENTS) return { ok: false, message: `Up to ${MAX_ATTACHMENTS} attachments a filing, screenshots included. Split the rest into another filing on the same card.` };
  const content = typeof body.content === "string" && body.content.trim() ? body.content : null;
  const summary = text(body.summary, 4000);
  if (!content && !summary && attachments.length === 0 && links.length === 0 && built.items.length === 0) {
    return { ok: false, message: "Send content, a summary, attachments, links, or built_work." };
  }
  const handoff = body.handoff && typeof body.handoff === "object" && !Array.isArray(body.handoff) ? (body.handoff as Record<string, unknown>) : {};
  const client = body.client && typeof body.client === "object" && !Array.isArray(body.client) ? (body.client as Record<string, unknown>) : {};
  const domainRaw = text(client.domain, 255);
  const rawSupersedes = typeof body.supersedes === "string" ? [body.supersedes] : Array.isArray(body.supersedes) ? body.supersedes : [];
  if (rawSupersedes.length > 20) return { ok: false, message: "supersedes takes up to 20 work item ids." };
  const supersedes = [...new Set(rawSupersedes.map((value) => text(value, 100)).filter((value): value is string => Boolean(value)))];
  const deliverableKind = text(body.deliverable_kind, 30)?.toLowerCase() ?? (built.items.length ? "website" : null);
  const folder = cleanFolder(body.folder);
  if (!folder.ok) return { ok: false, message: folder.message };
  const skillsUsed = parseSkillsUsed(body.skills_used);
  if (!skillsUsed.ok) return { ok: false, message: skillsUsed.message };
  return {
    ok: true,
    payload: {
      externalId,
      title,
      kind,
      summary,
      clientSummary: text(body.client_summary, 2000),
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
      keepTaskOpen: body.keep_task_open === true,
      handoffTo: text(handoff.to, 64)?.toLowerCase() ?? null,
      handoffNote: text(handoff.note, 4000),
      finishedAt: text(body.finished_at, 40),
      agentId: text(body.agent_id, 64)?.toLowerCase() ?? null,
      supersedes,
      workRequestId: text(body.work_request_id, 100),
      threadId: text(body.thread_id, 500),
      deliverableKind,
      folder: folder.folder,
      skillsUsed: skillsUsed.paths,
      builtWork: built.items,
      alreadyDelivered: body.already_delivered === true || kind === "catalog",
    },
  };
}

export const MAX_SKILLS_USED = 30;

/**
 * skills_used: up to 30 SKILL.md paths from the library ("community/marketingskills/copywriting/SKILL.md"; a leading
 * ".cursor/skills/" or "skills/" is fine). org/ paths and anything that is not a SKILL.md path are refused.
 */
export function parseSkillsUsed(raw: unknown): { ok: true; paths: string[] } | { ok: false; message: string } {
  if (raw == null) return { ok: true, paths: [] };
  if (!Array.isArray(raw)) return { ok: false, message: "skills_used must be a list of skill paths." };
  if (raw.length > MAX_SKILLS_USED) return { ok: false, message: `skills_used takes up to ${MAX_SKILLS_USED} skill paths.` };
  const paths: string[] = [];
  for (const value of raw) {
    const key = typeof value === "string" ? skillObjectKey(value) : null;
    const relative = key ? key.slice("skills/".length) : null;
    if (!relative || relative.startsWith("org/") || !relative.includes("/")) {
      return { ok: false, message: `skills_used: ${typeof value === "string" ? value.slice(0, 120) : String(value)} is not a skill path like community/marketingskills/copywriting/SKILL.md.` };
    }
    if (!paths.includes(relative)) paths.push(relative);
  }
  return { ok: true, paths };
}

// ---------- Routing ----------

type Space = { id: string; slug: string; project_id: string | null };

export type Route =
  | { ok: true; organizationId: string; space: Space; projectId: string | null; taskId: string | null; route: string }
  | { ok: false; reason: UnfiledReason; organizationId: string | null; suggestedOrganizationId: string | null };

/** The org a client hint names, if any. Only exact matches count. */
async function hintedOrganization(sql: Sql, hint: WorkPayload["client"]): Promise<{ named: boolean; organizationId: string | null }> {
  if (hint.organizationId) return { named: true, organizationId: hint.organizationId };
  if (hint.spaceSlug) {
    const row = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM workspaces WHERE slug = ? AND status = 'active'", [hint.spaceSlug]);
    return { named: true, organizationId: row?.organization_id ?? null };
  }
  if (hint.domain) {
    const rows = await sql.all<{ id: string }>("SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL", [hint.domain]);
    return { named: true, organizationId: rows.length === 1 ? rows[0].id : null };
  }
  return { named: false, organizationId: null };
}

/**
 * The client must be one of the agent's live assignments. With several, the payload's client, task, or project picks one.
 * Hints can pick a space inside that client, never move work to another client.
 */
export async function resolveRoute(sql: Sql, agent: AgentPrincipal, payload: WorkPayload): Promise<Route> {
  const assigned = new Map(agent.assignments.map((row) => [row.organizationId, row]));
  const hinted = await hintedOrganization(sql, payload.client);
  const fail = (reason: UnfiledReason, organizationId: string | null, suggested: string | null = null): Route => ({
    ok: false, reason, organizationId, suggestedOrganizationId: suggested,
  });

  let task: { id: string; organization_id: string | null; project_id: string | null } | undefined;
  if (payload.taskId) task = await sql.get("SELECT id, organization_id, project_id FROM tasks WHERE id = ?", [payload.taskId]);
  let project: { id: string; organization_id: string; status: string } | undefined;
  if (payload.projectId) project = await sql.get("SELECT id, organization_id, status FROM projects WHERE id = ?", [payload.projectId]);

  let organizationId: string | null = null;
  if (hinted.named) {
    if (!hinted.organizationId || !assigned.has(hinted.organizationId)) {
      return fail(agent.assignments.length ? "client_mismatch" : "agent_not_assigned", null, hinted.organizationId);
    }
    organizationId = hinted.organizationId;
  } else if (agent.assignments.length === 1) {
    organizationId = agent.assignments[0].organizationId;
  } else if (task?.organization_id && assigned.has(task.organization_id)) {
    organizationId = task.organization_id;
  } else if (project && assigned.has(project.organization_id)) {
    organizationId = project.organization_id;
  } else if (agent.assignments.length === 0) {
    return fail("agent_not_assigned", null);
  } else {
    return fail("ambiguous_client", null);
  }
  const assignment = assigned.get(organizationId)!;

  if (payload.taskId && (!task || task.organization_id !== organizationId)) return fail("task_not_in_client", organizationId);
  if (payload.projectId) {
    const open = project && project.organization_id === organizationId
      ? await sql.get<{ id: string }>(`SELECT id FROM projects WHERE id = ? AND ${OPEN_PROJECT}`, [project.id])
      : undefined;
    if (!open) return fail("project_not_open", organizationId);
  }
  const projectHint = payload.projectId ?? task?.project_id ?? null;

  const spaces = await sql.all<Space>(
    "SELECT id, slug, project_id FROM workspaces WHERE organization_id = ? AND status = 'active' ORDER BY opened_at",
    [organizationId],
  );
  const pick = (space: Space, route: string): Route => ({
    ok: true,
    organizationId: organizationId!,
    space,
    projectId: projectHint ?? space.project_id ?? assignment.projectId,
    taskId: task?.id ?? null,
    route,
  });
  if (payload.client.spaceSlug) {
    const named = spaces.find((space) => space.slug === payload.client.spaceSlug);
    if (named) return pick(named, "space_slug");
  }
  if (projectHint) {
    const linked = spaces.filter((space) => space.project_id === projectHint);
    if (linked.length === 1) return pick(linked[0], payload.projectId ? "project" : "task");
  }
  if (assignment.workspaceId) {
    const set = spaces.find((space) => space.id === assignment.workspaceId);
    if (set) return pick(set, "assigned_space");
  }
  if (assignment.projectId) {
    const linked = spaces.filter((space) => space.project_id === assignment.projectId);
    if (linked.length === 1) return pick(linked[0], "assigned_project");
  }
  if (spaces.length === 1) return pick(spaces[0], "only_space");
  return fail(spaces.length === 0 ? "no_space" : "ambiguous_space", organizationId);
}

// ---------- Filing ----------

/** The summary page of a filing. src/lib/filing-summary.ts reads it back for display. */
export function summaryMarkdown(agent: AgentPrincipal, payload: WorkPayload, receivedAt: number): string {
  const lines = [`# ${payload.title}`, "", `- Kind: ${payload.kind}`, `- Agent: ${agent.label} (${agent.agentId})`];
  lines.push(`- Finished: ${payload.finishedAt ?? new Date(receivedAt).toISOString()}`);
  if (payload.taskId) lines.push(`- Task: ${payload.taskId}`);
  if (payload.handoffTo) lines.push(`- Handed to: ${payload.handoffTo}`);
  lines.push(`- Ref: ${payload.externalId}`);
  if (payload.clientSummary) lines.push("", "## For the client", "", payload.clientSummary);
  if (payload.summary) lines.push("", "## Summary", "", payload.summary);
  if (payload.handoffNote) lines.push("", "## Handoff", "", payload.handoffNote);
  if (payload.links.length) {
    lines.push("", "## Links", "");
    for (const link of payload.links) lines.push(`- [${link.label.replace(/[[\]]/g, "")}](${link.url})`);
  }
  lines.push(...builtWorkMarkdown(payload.builtWork ?? []));
  if (payload.attachments.length) {
    lines.push("", "## Files", "");
    for (const file of payload.attachments) lines.push(`- ${file.name}`);
  }
  if (payload.content && !payload.content.trim().startsWith("data:")) lines.push("", "---", "", payload.content);
  return lines.join("\n");
}

function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Names already used in the folder (lowercase), so a new filing gets "post-1 (2).png" instead of clashing. Hidden
 * batches don't count, and neither do the filings this one supersedes: the replacement keeps their names.
 */
async function takenPaths(sql: Sql, workspaceId: string, folder: string, agentId: string, supersedes: string[]): Promise<Set<string>> {
  const replaced = supersedes.length ? supersedes.map(() => "?").join(", ") : "NULL";
  const rows = await sql.all<{ path: string }>(
    `SELECT lower(f.relative_path) AS path FROM files f JOIN batches b ON b.id = f.batch_id
     WHERE f.workspace_id = ? AND b.discarded_at IS NULL AND b.deleted_at IS NULL AND b.hidden_at IS NULL
       AND f.object_deleted_at IS NULL AND f.relative_path LIKE ? ESCAPE '\\'
       AND (b.work_item_id IS NULL OR b.work_item_id NOT IN (
         SELECT id FROM agent_work_items WHERE id IN (${replaced}) OR (agent_id = ? AND external_id IN (${replaced}))
       ))`,
    [workspaceId, `${likeEscape(folder)}/%`, ...supersedes, agentId, ...supersedes],
  );
  return new Set(rows.map((row) => row.path));
}

/** Files for a filing: the summary plus attachments, under the agent's folder with readable names. */
function filesFor(itemId: string, summary: string, payload: WorkPayload, now: number, folder: string, taken: Set<string>): WorkflowFile[] {
  const run = itemId.slice(0, 8);
  // Keyed on the exact stored name (same extension logic as storage), so post.md and post.html can sit side by side.
  const claim = (stem: string, file: Pick<WorkflowFile, "body" | "name">): string => {
    const extension = workflowFileExtension(file) ?? "md";
    for (let n = 1; ; n += 1) {
      const candidate = n === 1 ? `${folder}/${stem}` : `${folder}/${stem} (${n})`;
      const key = `${candidate}.${extension}`.toLowerCase();
      if (!taken.has(key)) {
        taken.add(key);
        return candidate;
      }
    }
  };
  const summaryStem = payload.folder ? `${fileStem(payload.title)} - summary` : "summary";
  const files: WorkflowFile[] = [{ workflow: "work", run, node: "summary", body: summary, path: claim(summaryStem, { body: summary }) }];
  if (payload.content?.trim().startsWith("data:")) {
    files.push({ workflow: "work", run, node: "content", body: payload.content, path: claim("content", { body: payload.content }) });
  }
  for (const file of payload.attachments) {
    const stem = fileStem(file.name);
    files.push({ workflow: "work", run, node: stem, body: file.body, name: file.name, path: claim(stem, file) });
  }
  void now;
  return files;
}

async function writeFiled(
  sql: Sql,
  store: ObjectStore,
  input: { itemId: string; agent: AgentPrincipal; payload: WorkPayload; route: Extract<Route, { ok: true }>; actor: string; now: number },
): Promise<{ ok: true; paths: string[]; batchId: string; taskClosed: boolean; awaitingReview?: boolean; review: FilingReview; folder: string } | { ok: false }> {
  const { route, payload, agent } = input;
  const summary = summaryMarkdown(agent, payload, input.now);
  const folder = payload.folder ?? defaultFolder(input.now, payload.title);
  const taken = await takenPaths(sql, route.space.id, folder, agent.agentId, payload.supersedes);
  // Held: staff, Client Services and the client's agents see it; client members only after Client Services approves.
  const files = filesFor(input.itemId, summary, payload, input.now, folder, taken);
  const summaryPath = files[0]?.path ? `${files[0].path}.md` : null;
  const stored = await storeWorkflowOutput({
    sql,
    store,
    organizationId: route.organizationId,
    workspaceId: route.space.id,
    projectId: route.projectId,
    files,
    tag: "copy",
    label: `From ${agent.label}`.slice(0, 120),
    now: input.now,
    hold: true,
    workItemId: input.itemId,
  });
  if (!stored.batchId || stored.stored.length === 0) return { ok: false };
  const built = payload.builtWork ?? [];
  const screenshotFiles = new Map<string, string>();
  if (built.some((item) => item.screenshot)) {
    const wanted = new Map<string, string>();
    for (const file of files) {
      const extension = file.name ? workflowFileExtension(file) : null;
      if (file.name && file.path && extension) wanted.set(`${file.path}.${extension}`.toLowerCase(), file.name.toLowerCase());
    }
    const rows = await sql.all<{ id: string; relative_path: string }>("SELECT id, relative_path FROM files WHERE batch_id = ?", [stored.batchId]);
    for (const row of rows) {
      const name = wanted.get(row.relative_path.toLowerCase());
      if (name) screenshotFiles.set(name, row.id);
    }
  }
  const request = await resolveFilingRequest(sql, {
    organizationId: route.organizationId, taskId: route.taskId, workRequestId: payload.workRequestId, threadId: payload.threadId,
    title: payload.title, summary: payload.summary, projectId: route.projectId, workspaceId: route.space.id, now: input.now,
  });
  const writes: Write[] = [
    {
      statement: `UPDATE agent_work_items SET state = 'filed', organization_id = ?, workspace_id = ?, project_id = ?, task_id = ?, task_closed = 0,
                    handoff_to = ?, handoff_note = ?, route = ?, unfiled_reason = NULL, payload_json = NULL, payload_key = NULL, context_md = ?, batch_id = ?,
                    paths_json = ?, filed_by = ?, filed_at = ?, updated_at = ?, supersedes_json = ?, work_request_id = ?, folder = ?,
                    already_delivered = ?
                  WHERE id = ?`,
      params: [
        route.organizationId, route.space.id, route.projectId, route.taskId, payload.handoffTo, payload.handoffNote,
        route.route, summary.slice(0, CONTEXT_LIMIT), stored.batchId, JSON.stringify(stored.stored), input.actor, input.now, input.now,
        JSON.stringify(payload.supersedes), request, folder, payload.alreadyDelivered ? 1 : 0, input.itemId,
      ],
    },
    {
      statement: `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
                  VALUES (?, ?, ?, ?, 'client_agent.work_filed', 'agent', ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(), route.organizationId, route.projectId, route.space.id, agent.agentId,
        `${agent.label} filed (held for review): ${payload.title}`.slice(0, 500),
        JSON.stringify({
          work_item_id: input.itemId, agent_id: agent.agentId, kind: payload.kind, task_id: route.taskId, task_closed: false, held: true,
          route: route.route, filed_by: input.actor, paths: stored.stored, links: payload.links, handoff_to: payload.handoffTo,
          work_request_id: request, supersedes: payload.supersedes,
        }),
        input.now,
      ],
    },
  ];
  writes.push(...builtWorkWrites({
    workItemId: input.itemId, batchId: stored.batchId, organizationId: route.organizationId, workspaceId: route.space.id,
    projectId: route.projectId, items: built, screenshotFiles, now: input.now,
  }));
  if (payload.handoffTo) {
    writes.push({
      statement: `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
                  VALUES (?, ?, ?, ?, 'client_agent.handoff', 'agent', ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(), route.organizationId, route.projectId, route.space.id, agent.agentId,
        `${agent.label} handed "${payload.title}" to ${payload.handoffTo}.`.slice(0, 500),
        JSON.stringify({ work_item_id: input.itemId, from: agent.agentId, to: payload.handoffTo, note: payload.handoffNote }),
        input.now,
      ],
    });
  }
  await sql.batch(writes);
  // Deliverable version, supersede marks, and the review gate: filing never closes a card.
  const review = await recordFiling(sql, {
    itemId: input.itemId, batchId: stored.batchId, agent, payload, summary, summaryPath, organizationId: route.organizationId,
    workspaceId: route.space.id, projectId: route.projectId, taskId: route.taskId, workRequestId: request, now: input.now,
  });
  return {
    ok: true, paths: stored.stored, batchId: stored.batchId, taskClosed: false, folder,
    ...(review.awaitingReview ? { awaitingReview: true } : {}), review,
  };
}

async function markUnfiled(sql: Sql, itemId: string, agent: AgentPrincipal, payload: WorkPayload, reason: UnfiledReason, organizationId: string | null, suggested: string | null, now: number) {
  await sql.batch([
    {
      statement: "UPDATE agent_work_items SET state = 'unfiled', unfiled_reason = ?, organization_id = ?, suggested_organization_id = ?, updated_at = ? WHERE id = ?",
      params: [reason, organizationId, suggested, now, itemId],
    },
    {
      statement: `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
                  VALUES (?, ?, 'client_agent.work_unfiled', 'agent', ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(), organizationId, agent.agentId, `Agent work waits for filing (${reason}): ${payload.title}`.slice(0, 500),
        JSON.stringify({ work_item_id: itemId, agent_id: agent.agentId, reason, suggested_organization_id: suggested }), now,
      ],
    },
  ]);
}

async function existingResult(sql: Sql, agentId: string, externalId: string): Promise<FileResult | null> {
  const row = await sql.get<{
    id: string; state: string; organization_id: string | null; workspace_id: string | null; project_id: string | null;
    paths_json: string; route: string | null; unfiled_reason: string | null; task_closed: number; handoff_to: string | null;
  }>(
    `SELECT id, state, organization_id, workspace_id, project_id, paths_json, route, unfiled_reason, task_closed, handoff_to
     FROM agent_work_items WHERE agent_id = ? AND external_id = ?`,
    [agentId, externalId],
  );
  if (!row) return null;
  if (row.state === "filed" && row.organization_id && row.workspace_id) {
    const space = await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [row.workspace_id]);
    return {
      ok: true, duplicate: true, state: "filed", workItemId: row.id, organizationId: row.organization_id, workspaceId: row.workspace_id,
      spaceSlug: space?.slug ?? "", projectId: row.project_id, paths: JSON.parse(row.paths_json) as string[], route: row.route ?? "",
      taskClosed: row.task_closed === 1, handoffTo: row.handoff_to,
    };
  }
  return { ok: true, duplicate: true, state: row.state as "unfiled" | "received" | "discarded", workItemId: row.id, reason: row.unfiled_reason };
}

async function handoffAllowed(sql: Sql, to: string, organizationId: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    `SELECT a.id FROM agent_assignments a JOIN client_agents c ON c.id = a.agent_id
     WHERE a.agent_id = ? AND a.organization_id = ? AND a.ended_at IS NULL AND c.revoked_at IS NULL`,
    [to, organizationId],
  );
  return Boolean(row);
}

/** POST /api/agent-work body, already authenticated as `agent`. Idempotent on (agent, external_id). */
export async function fileAgentWork(sql: Sql, store: ObjectStore, agent: AgentPrincipal, raw: unknown, now: number): Promise<FileResult> {
  const parsed = parseWorkPayload(raw);
  if (!parsed.ok) return { ok: false, error: "invalid", message: parsed.message };
  const payload = parsed.payload;
  if (payload.agentId && payload.agentId !== agent.agentId) return { ok: false, error: "forbidden", message: "agent_id does not match this token." };
  const limits = agentWorkLimits();
  const fileBytes = payload.attachments.reduce((sum, file) => sum + storedBytes(file.body), 0) + (payload.content ? storedBytes(payload.content) : 0);
  if (fileBytes > limits.maxFileBytes) return { ok: false, error: "too_big", message: tooBigMessage("files", fileBytes, limits) };
  const seen = await existingResult(sql, agent.agentId, payload.externalId);
  if (seen) return seen;

  const route = await resolveRoute(sql, agent, payload);
  if (route.ok && payload.handoffTo) {
    if (payload.handoffTo === agent.agentId) return { ok: false, error: "invalid", message: "handoff.to is this agent." };
    if (!(await handoffAllowed(sql, payload.handoffTo, route.organizationId))) {
      return { ok: false, error: "invalid", message: "handoff.to is not an agent assigned to this client." };
    }
  }

  if (route.ok && payload.supersedes.length) {
    const checked = await checkSupersedes(sql, { agent, organizationId: route.organizationId, ids: payload.supersedes });
    if (!checked.ok) return { ok: false, error: "invalid", message: checked.message };
    payload.supersedes = checked.ids;
  }
  if (route.ok && payload.workRequestId) {
    const known = await sql.get<{ id: string }>("SELECT id FROM client_work_requests WHERE id = ? AND organization_id = ?", [payload.workRequestId, route.organizationId]);
    if (!known) return { ok: false, error: "invalid", message: "work_request_id is not a request of this client." };
  }

  const itemId = crypto.randomUUID();
  // A big payload (attachments) waits in R2 while it is received or unfiled; the D1 row keeps a light copy.
  const full = JSON.stringify(payload);
  let payloadJson = full;
  let payloadKey: string | null = null;
  if (new TextEncoder().encode(full).byteLength > INLINE_PAYLOAD_BYTES) {
    payloadKey = `${PAYLOAD_NAMESPACE}/${itemId}/${crypto.randomUUID()}`;
    await store.put(payloadKey, new TextEncoder().encode(full));
    payloadJson = JSON.stringify({ ...payload, content: null, attachments: payload.attachments.map((file) => ({ name: file.name, body: "" })) });
  }
  try {
    await sql.run(
      `INSERT INTO agent_work_items (id, agent_id, external_id, state, kind, title, summary, organization_id, payload_json, payload_key, links_json, created_at, updated_at)
       VALUES (?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, agent.agentId, payload.externalId, payload.kind, payload.title, payload.summary, route.organizationId, payloadJson, payloadKey, JSON.stringify(payload.links), now, now],
    );
  } catch (error) {
    if (payloadKey) await store.remove(payloadKey).catch(() => undefined);
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      const raced = await existingResult(sql, agent.agentId, payload.externalId);
      if (raced) return raced;
    }
    throw error;
  }

  if (!route.ok) {
    await markUnfiled(sql, itemId, agent, payload, route.reason, route.organizationId, route.suggestedOrganizationId, now);
    return { ok: true, duplicate: false, state: "unfiled", workItemId: itemId, reason: route.reason };
  }
  const filed = await writeFiled(sql, store, { itemId, agent, payload, route, actor: "auto", now });
  if (filed.ok && payloadKey) await store.remove(payloadKey).catch(() => undefined);
  if (!filed.ok) {
    await markUnfiled(sql, itemId, agent, payload, "space_rejected", route.organizationId, null, now);
    return { ok: true, duplicate: false, state: "unfiled", workItemId: itemId, reason: "space_rejected" };
  }
  return {
    ok: true, duplicate: false, state: "filed", workItemId: itemId, organizationId: route.organizationId, workspaceId: route.space.id,
    spaceSlug: route.space.slug, projectId: route.projectId, paths: filed.paths, route: route.route, taskClosed: filed.taskClosed,
    handoffTo: payload.handoffTo, ...(filed.awaitingReview ? { awaitingReview: true } : {}), held: true, review: filed.review, folder: filed.folder,
    ...(payload.builtWork?.length ? { builtWork: payload.builtWork.length } : {}),
  };
}

// ---------- Read-back context for agents ----------

export type WorkContextRow = {
  id: string;
  agent_id: string;
  agent_label: string;
  kind: string;
  title: string;
  summary: string | null;
  organization_id: string;
  organization_name: string;
  space_slug: string | null;
  project_id: string | null;
  task_id: string | null;
  handoff_to: string | null;
  handoff_note: string | null;
  paths: string[];
  links: { label: string; url: string }[];
  filed_at: string;
  /** Websites and other built work on this filing (title, live_url, preview_url, repo_url, description, status). */
  built_work?: Record<string, unknown>[];
};

/**
 * Filed work this agent may read: every item filed for the clients it is assigned to now, by any agent.
 * Filters: client (organization id, domain, or space slug), since (ISO or unix ms), kind, handed_to_me.
 */
export async function listAgentContext(
  sql: Sql,
  agent: AgentPrincipal,
  query: { client?: string | null; since?: string | null; kind?: string | null; handedToMe?: boolean; limit?: number },
): Promise<{ ok: true; items: WorkContextRow[] } | { ok: false; status: 400 | 403; message: string }> {
  let orgs = agent.assignments.map((row) => row.organizationId);
  const client = query.client?.trim().toLowerCase() || null;
  if (client) {
    const domain = normalizeDomain(client);
    const row = await sql.get<{ id: string }>(
      `SELECT o.id FROM organizations o WHERE o.id = ? OR o.domain = ?
       UNION SELECT w.organization_id FROM workspaces w WHERE w.slug = ? AND w.organization_id IS NOT NULL LIMIT 1`,
      [query.client!.trim(), domain, client],
    );
    if (!row || !orgs.includes(row.id)) return { ok: false, status: 403, message: "This agent is not assigned to that client." };
    orgs = [row.id];
  }
  if (orgs.length === 0) return { ok: true, items: [] };
  let since = 0;
  if (query.since) {
    since = /^\d+$/.test(query.since) ? Number(query.since) : Date.parse(query.since);
    if (!Number.isFinite(since)) return { ok: false, status: 400, message: "Bad since. Use ISO time or unix ms." };
  }
  if (query.kind && !KINDS.has(query.kind)) return { ok: false, status: 400, message: "Unknown kind." };
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 200);
  const marks = orgs.map(() => "?").join(", ");
  const rows = await sql.all<{
    id: string; agent_id: string; agent_label: string; kind: string; title: string; summary: string | null; organization_id: string;
    organization_name: string; space_slug: string | null; project_id: string | null; task_id: string | null; handoff_to: string | null;
    handoff_note: string | null; paths_json: string; links_json: string; filed_at: number;
  }>(
    `SELECT i.id, i.agent_id, a.label AS agent_label, i.kind, i.title, i.summary, i.organization_id, o.name AS organization_name,
            w.slug AS space_slug, i.project_id, i.task_id, i.handoff_to, i.handoff_note, i.paths_json, i.links_json, i.filed_at
     FROM agent_work_items i
     JOIN client_agents a ON a.id = i.agent_id
     JOIN organizations o ON o.id = i.organization_id
     LEFT JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.state = 'filed' AND i.organization_id IN (${marks}) AND i.filed_at > ?
       AND (? IS NULL OR i.kind = ?) AND (? = 0 OR i.handoff_to = ?)
     ORDER BY i.filed_at DESC LIMIT ?`,
    [...orgs, since, query.kind ?? null, query.kind ?? null, query.handedToMe ? 1 : 0, agent.agentId, limit],
  );
  const built = await builtWorkByItem(sql, rows.map((row) => row.id));
  return {
    ok: true,
    items: rows.map((row) => ({
      ...row,
      ...(built.has(row.id) ? { built_work: built.get(row.id) } : {}),
      paths: JSON.parse(row.paths_json) as string[],
      links: JSON.parse(row.links_json) as { label: string; url: string }[],
      filed_at: new Date(row.filed_at).toISOString(),
      paths_json: undefined,
      links_json: undefined,
    })) as WorkContextRow[],
  };
}

/** One filed item with its full summary markdown, if this agent is assigned to that client now. */
export async function readAgentContextItem(sql: Sql, agent: AgentPrincipal, id: string): Promise<(WorkContextRow & { context_md: string }) | null> {
  const row = await sql.get<{ organization_id: string | null; context_md: string | null; state: string }>(
    "SELECT organization_id, context_md, state FROM agent_work_items WHERE id = ?",
    [id],
  );
  if (!row || row.state !== "filed" || !row.organization_id) return null;
  if (!agent.assignments.some((a) => a.organizationId === row.organization_id)) return null;
  const listed = await listAgentContext(sql, agent, { client: row.organization_id, limit: 200 });
  const item = listed.ok ? listed.items.find((entry) => entry.id === id) : undefined;
  return item ? { ...item, context_md: row.context_md ?? "" } : null;
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
  input: {
    id: string;
    organizationId: string;
    workspaceId: string;
    projectId?: string | null;
    /** The task this work finishes. Undefined: the agent's own task_id when it is in this client. Null or "": none. */
    taskId?: string | null;
    actor: string;
    now: number;
  },
): Promise<{ ok: true; paths: string[]; batchId: string; taskClosed: boolean } | { ok: false; error: "missing" | "invalid" | "space_rejected" }> {
  const row = await sql.get<{ id: string; agent_id: string; state: string; payload_json: string | null; payload_key: string | null }>(
    "SELECT id, agent_id, state, payload_json, payload_key FROM agent_work_items WHERE id = ?",
    [input.id],
  );
  if (!row || (row.state !== "unfiled" && row.state !== "received") || !row.payload_json) return { ok: false, error: "missing" };
  let payloadText = row.payload_json;
  if (row.payload_key) {
    const bytes = await store.read(row.payload_key);
    if (!bytes) return { ok: false, error: "missing" };
    payloadText = new TextDecoder().decode(bytes);
  }
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
  const agent: AgentPrincipal = {
    agentId: row.agent_id,
    label: agentRow?.label ?? row.agent_id,
    assignments: [{ organizationId: input.organizationId, workspaceId: space.id, projectId, role: "lead" }],
  };
  const parsedPayload = JSON.parse(payloadText) as Partial<WorkPayload>;
  const payload = { supersedes: [], workRequestId: null, threadId: null, deliverableKind: null, ...parsedPayload } as WorkPayload;
  const explicit = input.taskId !== undefined;
  const wanted = (explicit ? input.taskId : payload.taskId)?.trim() || null;
  let taskId: string | null = null;
  if (wanted) {
    const task = await sql.get<{ id: string }>("SELECT id FROM tasks WHERE id = ? AND organization_id = ?", [wanted, input.organizationId]);
    if (task) taskId = task.id;
    else if (explicit) return { ok: false, error: "invalid" };
  }
  const filed = await writeFiled(sql, store, {
    itemId: row.id,
    agent,
    payload: { ...payload, taskId, handoffTo: null },
    route: { ok: true, organizationId: input.organizationId, space, projectId, taskId, route: "staff" },
    actor: input.actor,
    now: input.now,
  });
  if (!filed.ok) return { ok: false, error: "space_rejected" };
  if (row.payload_key) await store.remove(row.payload_key).catch(() => undefined);
  return { ok: true, paths: filed.paths, batchId: filed.batchId, taskClosed: filed.taskClosed };
}

/** Drops one unfiled item. The reason, when given, is kept on the item (route) and on the timeline. */
export async function discardUnfiledWork(
  sql: Sql,
  input: { id: string; actor: string; now: number; reason?: string | null },
  store?: ObjectStore,
): Promise<boolean> {
  const row = await sql.get<{ id: string; title: string; agent_id: string; suggested_organization_id: string | null; payload_key: string | null }>(
    "SELECT id, title, agent_id, suggested_organization_id, payload_key FROM agent_work_items WHERE id = ? AND state IN ('unfiled', 'received')",
    [input.id],
  );
  if (!row) return false;
  const reason = input.reason?.trim().slice(0, 500) || null;
  await sql.batch([
    {
      statement: "UPDATE agent_work_items SET state = 'discarded', payload_json = NULL, payload_key = NULL, route = ?, filed_by = ?, updated_at = ? WHERE id = ?",
      params: [reason ? `discarded: ${reason}` : "discarded", input.actor, input.now, input.id],
    },
    {
      statement: `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
                  VALUES (?, ?, 'client_agent.work_discarded', 'staff', ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        row.suggested_organization_id,
        input.actor,
        `Discarded "${row.title}" from ${row.agent_id}.${reason ? ` ${reason}` : ""}`.slice(0, 500),
        JSON.stringify({ work_item_id: row.id, agent_id: row.agent_id, reason }),
        input.now,
      ],
    },
  ]);
  if (row.payload_key && store) await store.remove(row.payload_key).catch(() => undefined);
  return true;
}

/** Client Services names a client by organization_id, domain, or space_slug. Exactly one live org must match. */
export async function resolveClientRef(
  sql: Sql,
  client: unknown,
): Promise<{ ok: true; organizationId: string; spaceId: string | null } | { ok: false; status: 400 | 404; message: string }> {
  const ref = client && typeof client === "object" && !Array.isArray(client) ? (client as Record<string, unknown>) : {};
  const id = text(ref.organization_id, 100);
  if (id) {
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE id = ? AND archived_at IS NULL", [id]);
    return org ? { ok: true, organizationId: org.id, spaceId: null } : { ok: false, status: 404, message: "Unknown client." };
  }
  const domainRaw = text(ref.domain, 255);
  if (domainRaw) {
    const domain = normalizeDomain(domainRaw);
    const rows = domain ? await sql.all<{ id: string }>("SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL", [domain]) : [];
    return rows.length === 1 ? { ok: true, organizationId: rows[0].id, spaceId: null } : { ok: false, status: 404, message: "No single client has that domain." };
  }
  const spaceSlug = text(ref.space_slug, 100)?.toLowerCase();
  if (spaceSlug) {
    const space = await sql.get<{ id: string; organization_id: string | null }>(
      `SELECT w.id, w.organization_id FROM workspaces w JOIN organizations o ON o.id = w.organization_id
       WHERE w.slug = ? AND w.status = 'active' AND o.archived_at IS NULL`,
      [spaceSlug],
    );
    return space?.organization_id ? { ok: true, organizationId: space.organization_id, spaceId: space.id } : { ok: false, status: 404, message: "No active space has that slug." };
  }
  return { ok: false, status: 400, message: "Name the client." };
}
