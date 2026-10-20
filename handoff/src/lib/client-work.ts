import { normalizeDomain } from "@/db/crm";
import type { Sql } from "@/db/sql";
import { cleanEmail, companyDomain } from "@/lib/intake/consume";
import { planProjectSpace } from "@/lib/project-space";

/** Above this many estimated hours, or a "large" size, a request waits for staff on the HQ board. */
export const AUTO_START_MAX_HOURS = 16;

const OPEN_PROJECT = "status IN ('planned', 'active', 'waiting_on_client')";

export type WorkRequestResult =
  | {
      ok: true;
      duplicate: boolean;
      state?: "accepted" | "needs_approval";
      requestId?: string;
      /** Set when a task was put on the board and the HQ agent should be woken. */
      kickoffOrganizationId?: string;
    }
  | { ok: false; error: "invalid"; retry: false };

type Write = { statement: string; params: readonly unknown[] };

function text(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, max) : null;
}

function list(raw: unknown, max = 50): unknown[] {
  if (!Array.isArray(raw)) return typeof raw === "string" && raw.trim() ? [raw.trim().slice(0, 2000)] : [];
  return raw.slice(0, max).map((item) => {
    if (typeof item === "string") return item.slice(0, 2000);
    if (item && typeof item === "object") {
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(item as Record<string, unknown>).slice(0, 10)) {
        if (typeof value === "string" || typeof value === "number") out[key.slice(0, 50)] = String(value).slice(0, 2000);
      }
      return out;
    }
    return null;
  }).filter((item) => item != null);
}

function record(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

/** The brief may be a string or { request, deliverables, deadline }. */
function briefParts(body: Record<string, unknown>) {
  const brief = body.brief;
  const nested = record(brief);
  const request = typeof brief === "string" ? text(brief, 20000) : text(nested?.request ?? nested?.summary, 20000);
  const deliverables = list(nested?.deliverables ?? body.deliverables);
  const deadline = text(nested?.deadline ?? body.deadline, 200);
  return { request, deliverables, deadline };
}

export function workRequestBodyReady(payload: unknown): boolean {
  const body = record(payload);
  if (!body) return false;
  const id = text(body.source_message_id, 500);
  const email = text(body.client_email, 320);
  const domain = text(body.client_domain, 255);
  const subject = text(body.subject, 500);
  const { request } = briefParts(body);
  if (!id || !subject || !request || (!email && !domain)) return false;
  const hours = body.estimate_hours;
  if (hours != null && !(typeof hours === "number" && Number.isFinite(hours) && hours >= 0)) return false;
  return true;
}

type OrgMatch = { organizationId: string | null; reason: string | null };

async function matchOrg(sql: Sql, email: string | null, domain: string | null): Promise<OrgMatch> {
  if (email) {
    const contact = await sql.get<{ organization_id: string | null }>(
      `SELECT c.organization_id FROM contacts c JOIN organizations o ON o.id = c.organization_id
       WHERE c.email = ? AND o.archived_at IS NULL`,
      [email],
    );
    if (contact?.organization_id) return { organizationId: contact.organization_id, reason: null };
  }
  if (domain) {
    const org = await sql.get<{ id: string }>(
      "SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL",
      [domain],
    );
    if (org) return { organizationId: org.id, reason: null };
  }
  return { organizationId: null, reason: "unknown_client" };
}

type ProjectMatch =
  | { kind: "hint" | "only_open" | "name"; projectId: string }
  | { kind: "new" }
  | { kind: "ambiguous" }
  | { kind: "bad_hint" };

async function matchProject(
  sql: Sql,
  organizationId: string,
  hint: string | null,
  subject: string,
): Promise<ProjectMatch> {
  if (hint) {
    const row = await sql.get<{ id: string }>(
      `SELECT id FROM projects WHERE id = ? AND organization_id = ? AND ${OPEN_PROJECT}`,
      [hint, organizationId],
    );
    return row ? { kind: "hint", projectId: row.id } : { kind: "bad_hint" };
  }
  const open = await sql.all<{ id: string; name: string }>(
    `SELECT id, name FROM projects WHERE organization_id = ? AND ${OPEN_PROJECT} ORDER BY updated_at DESC`,
    [organizationId],
  );
  if (open.length === 0) return { kind: "new" };
  if (open.length === 1) return { kind: "only_open", projectId: open[0].id };
  const lower = subject.toLowerCase();
  const named = open.filter((row) => row.name.trim().length >= 3 && lower.includes(row.name.trim().toLowerCase()));
  if (named.length === 1) return { kind: "name", projectId: named[0].id };
  return { kind: "ambiguous" };
}

function tooBig(size: string | null, hours: number | null, maxHours: number): boolean {
  if (size && /^(large|xl|x-large)$/i.test(size)) return true;
  return hours != null && hours > maxHours;
}

function briefText(input: {
  subject: string;
  request: string;
  deliverables: unknown[];
  deadline: string | null;
  attachments: unknown[];
  clientEmail: string | null;
}): string {
  const lines = [`Client request: ${input.subject}`, "", input.request];
  if (input.deliverables.length) {
    lines.push("", "Deliverables:");
    for (const item of input.deliverables) lines.push(`- ${typeof item === "string" ? item : JSON.stringify(item)}`);
  }
  if (input.deadline) lines.push("", `Deadline: ${input.deadline}`);
  if (input.attachments.length) {
    lines.push("", "Attachments:");
    for (const item of input.attachments) lines.push(`- ${typeof item === "string" ? item : JSON.stringify(item)}`);
  }
  if (input.clientEmail) lines.push("", `From: ${input.clientEmail} (via Client Services)`);
  return lines.join("\n").slice(0, 20000);
}

type RequestRow = {
  id: string;
  source_message_id: string;
  organization_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
  task_id: string | null;
  client_email: string | null;
  subject: string;
  brief: string;
  deliverables_json: string;
  deadline: string | null;
  attachments_json: string;
  project_hint: string | null;
  state: string;
};

/** Writes that put a request on the board: project/Space (if needed), task, task brief, activity. */
async function acceptWrites(
  sql: Sql,
  row: RequestRow,
  input: { organizationId: string; projectId: string | null; matchKind: string; actor: string; now: number },
): Promise<{ writes: Write[]; projectId: string; workspaceId: string; taskId: string }> {
  const plan = await planProjectSpace(sql, {
    organizationId: input.organizationId,
    name: row.subject,
    projectId: input.projectId,
    description: row.brief,
    now: input.now,
  });
  const taskId = crypto.randomUUID();
  const position = await sql.get<{ next: number | null }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tasks
     WHERE organization_id = ? AND project_id = ? AND stage = 'describe' AND status != 'done'`,
    [input.organizationId, plan.projectId],
  );
  const deliverables = JSON.parse(row.deliverables_json) as unknown[];
  const attachments = JSON.parse(row.attachments_json) as unknown[];
  const detail = briefText({
    subject: row.subject,
    request: row.brief,
    deliverables,
    deadline: row.deadline,
    attachments,
    clientEmail: row.client_email,
  });
  const writes: Write[] = [
    ...plan.writes,
    {
      statement: `INSERT INTO tasks (
         id, project_id, milestone_id, organization_id, title, status, assignee_user_id,
         due_at, created_at, updated_at, done_at, stage, skills_json, created_by_kind, round, position
       ) VALUES (?, ?, NULL, ?, ?, 'todo', NULL, NULL, ?, ?, NULL, 'describe', '[]', 'agent', 1, ?)`,
      params: [taskId, plan.projectId, input.organizationId, row.subject.slice(0, 200), input.now, input.now, Number(position?.next ?? 0)],
    },
    {
      statement: `INSERT INTO activities (
         id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
       ) VALUES (?, ?, ?, 'agent.task_brief', 'agent', 'client-services', ?, ?, ?)`,
      params: [crypto.randomUUID(), input.organizationId, plan.projectId, detail, JSON.stringify({ taskId }), input.now],
    },
    {
      statement: `UPDATE client_work_requests
         SET state = 'accepted', organization_id = ?, project_id = ?, workspace_id = ?, task_id = ?,
             match_kind = ?, approval_reason = NULL, decided_by = ?, decided_at = ?, updated_at = ?
       WHERE id = ?`,
      params: [input.organizationId, plan.projectId, plan.workspaceId, taskId, input.matchKind, input.actor, input.now, input.now, row.id],
    },
    {
      statement: `INSERT INTO activities (
         id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
       ) VALUES (?, ?, ?, ?, 'client_work.accepted', 'agent', 'client-services', ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        input.organizationId,
        plan.projectId,
        plan.workspaceId,
        `Client request accepted: ${row.subject}`.slice(0, 500),
        JSON.stringify({
          work_request_id: row.id,
          source_message_id: row.source_message_id,
          task_id: taskId,
          match: input.matchKind,
          created_project: plan.createdProject,
          created_space: plan.createdSpace,
          decided_by: input.actor,
        }),
        input.now,
      ],
    },
  ];
  return { writes, projectId: plan.projectId, workspaceId: plan.workspaceId, taskId };
}

async function loadRequest(sql: Sql, id: string): Promise<RequestRow | undefined> {
  return sql.get<RequestRow>(
    `SELECT id, source_message_id, organization_id, project_id, workspace_id, task_id, client_email, subject, brief,
            deliverables_json, deadline, attachments_json, project_hint, state
     FROM client_work_requests WHERE id = ?`,
    [id],
  );
}

/** Queue consumer for POST /api/intake/work-request. Dedups on source_message_id. */
export async function consumeWorkRequest(
  sql: Sql,
  payload: unknown,
  now: number,
  maxHours = AUTO_START_MAX_HOURS,
): Promise<WorkRequestResult> {
  const body = record(payload);
  if (!body || !workRequestBodyReady(body)) return { ok: false, error: "invalid", retry: false };
  const sourceId = text(body.source_message_id, 500)!;
  const seen = await sql.get<{ id: string }>(
    "SELECT external_id AS id FROM intake_receipts WHERE source = 'work_request' AND external_id = ?",
    [sourceId],
  );
  if (seen) return { ok: true, duplicate: true };
  const email = cleanEmail(body.client_email);
  const domainField = text(body.client_domain, 255);
  const domain = companyDomain(domainField, email) ?? (domainField ? normalizeDomain(domainField) : null);
  const subject = text(body.subject, 500)!;
  const { request, deliverables, deadline } = briefParts(body);
  const attachments = list(body.attachments ?? body.attachment_links);
  const hint = text(body.project_id, 100);
  const hours = typeof body.estimate_hours === "number" ? Math.round(body.estimate_hours) : null;
  const size = text(body.size, 20);

  const org = await matchOrg(sql, email, domain);
  let reason: string | null = org.reason;
  let match: ProjectMatch | null = null;
  if (org.organizationId) {
    match = await matchProject(sql, org.organizationId, hint, subject);
    if (match.kind === "ambiguous") reason = "ambiguous_project";
    if (match.kind === "bad_hint") reason = "project_hint_not_open";
  }
  if (!reason && tooBig(size, hours, maxHours)) reason = "over_size_threshold";

  const id = crypto.randomUUID();
  const row: RequestRow = {
    id,
    source_message_id: sourceId,
    organization_id: org.organizationId,
    project_id: null,
    workspace_id: null,
    task_id: null,
    client_email: email,
    subject,
    brief: request!,
    deliverables_json: JSON.stringify(deliverables),
    deadline,
    attachments_json: JSON.stringify(attachments),
    project_hint: hint,
    state: "needs_approval",
  };
  const writes: Write[] = [
    {
      statement: `INSERT INTO client_work_requests (
         id, source_message_id, organization_id, project_id, workspace_id, task_id, client_email, client_domain,
         subject, brief, deliverables_json, deadline, attachments_json, project_hint, estimate_hours, size,
         state, match_kind, approval_reason, created_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_approval', ?, ?, ?, ?)`,
      params: [
        id,
        sourceId,
        org.organizationId,
        match && "projectId" in match ? match.projectId : null,
        email,
        domain,
        subject,
        request,
        row.deliverables_json,
        deadline,
        row.attachments_json,
        hint,
        hours,
        size,
        match?.kind ?? null,
        reason,
        now,
        now,
      ],
    },
    {
      statement: "INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('work_request', ?, ?)",
      params: [sourceId, now],
    },
  ];
  let kickoff: string | undefined;
  if (!reason && org.organizationId && match) {
    const accepted = await acceptWrites(sql, row, {
      organizationId: org.organizationId,
      projectId: "projectId" in match ? match.projectId : null,
      matchKind: match.kind,
      actor: "auto",
      now,
    });
    writes.push(...accepted.writes);
    kickoff = org.organizationId;
  } else {
    writes.push({
      statement: `INSERT INTO activities (
         id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
       ) VALUES (?, ?, 'client_work.needs_approval', 'agent', 'client-services', ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        org.organizationId,
        `Client request needs approval (${reason}): ${subject}`.slice(0, 500),
        JSON.stringify({ work_request_id: id, source_message_id: sourceId, reason }),
        now,
      ],
    });
  }
  try {
    await sql.batch(writes);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      const raced = await sql.get<{ id: string }>(
        "SELECT id FROM client_work_requests WHERE source_message_id = ?",
        [sourceId],
      );
      if (raced) return { ok: true, duplicate: true };
    }
    throw error;
  }
  return {
    ok: true,
    duplicate: false,
    state: kickoff ? "accepted" : "needs_approval",
    requestId: id,
    kickoffOrganizationId: kickoff,
  };
}

/** Staff approval from the HQ board. Unknown clients need an organization picked. */
export async function approveWorkRequest(
  sql: Sql,
  input: { id: string; organizationId?: string | null; projectId?: string | null; actor: string; now: number },
): Promise<{ ok: true; organizationId: string } | { ok: false; error: "missing" | "invalid" | "needs_client" }> {
  const row = await loadRequest(sql, input.id);
  if (!row || row.state !== "needs_approval") return { ok: false, error: "missing" };
  const organizationId = input.organizationId?.trim() || row.organization_id;
  if (!organizationId) return { ok: false, error: "needs_client" };
  const org = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE id = ? AND archived_at IS NULL", [organizationId]);
  if (!org) return { ok: false, error: "invalid" };
  let projectId = input.projectId?.trim() || null;
  if (projectId === "new") projectId = null;
  else if (!projectId && row.project_id) projectId = row.project_id;
  if (projectId) {
    const project = await sql.get<{ id: string }>(
      `SELECT id FROM projects WHERE id = ? AND organization_id = ? AND ${OPEN_PROJECT}`,
      [projectId, organizationId],
    );
    if (!project) return { ok: false, error: "invalid" };
  }
  const accepted = await acceptWrites(sql, row, {
    organizationId,
    projectId,
    matchKind: projectId ? "staff_pick" : "staff_new",
    actor: input.actor,
    now: input.now,
  });
  await sql.batch(accepted.writes);
  return { ok: true, organizationId };
}

export async function declineWorkRequest(
  sql: Sql,
  input: { id: string; actor: string; reason: string; now: number },
): Promise<boolean> {
  const row = await loadRequest(sql, input.id);
  if (!row || row.state !== "needs_approval") return false;
  await sql.batch([
    {
      statement: `UPDATE client_work_requests SET state = 'declined', approval_reason = ?, decided_by = ?, decided_at = ?, updated_at = ?
                  WHERE id = ?`,
      params: [input.reason.slice(0, 1000) || "declined", input.actor, input.now, input.now, row.id],
    },
    {
      statement: `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
                  VALUES (?, ?, 'client_work.declined', 'staff', ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), row.organization_id, input.actor, input.reason.slice(0, 1000) || "Declined.", JSON.stringify({ work_request_id: row.id }), input.now],
    },
  ]);
  return true;
}

export type PendingWorkRequest = {
  id: string;
  subject: string;
  client_email: string | null;
  client_domain: string | null;
  organization_id: string | null;
  organization_name: string | null;
  project_id: string | null;
  approval_reason: string | null;
  estimate_hours: number | null;
  deadline: string | null;
  brief: string;
  created_at: number;
};

export async function listPendingWorkRequests(sql: Sql): Promise<PendingWorkRequest[]> {
  return sql.all<PendingWorkRequest>(
    `SELECT r.id, r.subject, r.client_email, r.client_domain, r.organization_id, o.name AS organization_name,
            r.project_id, r.approval_reason, r.estimate_hours, r.deadline, r.brief, r.created_at
     FROM client_work_requests r LEFT JOIN organizations o ON o.id = r.organization_id
     WHERE r.state = 'needs_approval' ORDER BY r.created_at LIMIT 50`,
  );
}

/** Records that the HQ agent was (or was not) woken for an accepted request. */
/** "skipped" (AGENT_WAKES rules the HQ agent out): no note. The client's bots and Client Services pick the task up. */
export async function noteKickoff(sql: Sql, organizationId: string, woke: boolean | "skipped", now: number): Promise<void> {
  if (woke === "skipped") return;
  const rows = await sql.all<{ id: string; project_id: string | null; workspace_id: string | null; task_id: string | null }>(
    `SELECT r.id, r.project_id, r.workspace_id, r.task_id FROM client_work_requests r
     WHERE r.organization_id = ? AND r.state = 'accepted'
       AND NOT EXISTS (
         SELECT 1 FROM activities a WHERE a.kind = 'client_work.kickoff'
           AND json_extract(a.data_json, '$.work_request_id') = r.id AND json_extract(a.data_json, '$.woke') = 1
       )`,
    [organizationId],
  );
  for (const row of rows) {
    await sql.run(
      `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
       VALUES (?, ?, ?, ?, 'client_work.kickoff', 'system', 'wake', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        organizationId,
        row.project_id,
        row.workspace_id,
        woke ? "Woke the HQ agent on the client request." : "Wake failed. The every-minute cron will pick up the open task.",
        JSON.stringify({ work_request_id: row.id, task_id: row.task_id, woke: woke ? 1 : 0 }),
        now,
      ],
    );
  }
}

// ---------- Report-back feed for Client Services ----------

/** Activity kinds that count as a finish or milestone worth a Client Services look. */
const UPDATE_KINDS = [
  "client_work.accepted",
  "client_work.needs_approval",
  "client_work.declined",
  "client_work.kickoff",
  "agent.task_stage",
  "staff.task_stage",
  "staff.task_review",
  "client_services.task_review",
  "client_agent.review_waiting",
  "deliverable_published",
  "agent.published",
  "agent.ready_to_publish",
  "agent.brief_drafted",
  "request_done",
  "deal.won",
  "client_agent.work_filed",
  "client_agent.handoff",
  "client_agent.dispatch",
  "client_agent.board",
  "email.received",
] as const;

type ActivityRow = {
  id: string;
  organization_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
  kind: string;
  body: string | null;
  data_json: string | null;
  created_at: number;
};

function parse(raw: string | null): Record<string, unknown> {
  try {
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function interesting(row: ActivityRow, data: Record<string, unknown>): boolean {
  if (row.kind === "agent.task_stage" || row.kind === "staff.task_stage") return data.stage === "done";
  if (row.kind === "client_work.kickoff") return data.woke === 1;
  return true;
}

/**
 * Copies new milestone activities for client orgs into client_service_updates. Idempotent on activity_id.
 * email.received (the log-only mailbox) is copied for any sender, with or without an organization.
 */
export async function syncClientUpdates(sql: Sql, now: number, origin: string): Promise<number> {
  const last = await sql.get<{ at: number | null }>("SELECT MAX(created_at) AS at FROM client_service_updates");
  const floor = Math.max(0, Number(last?.at ?? now - 7 * 24 * 3600 * 1000) - 3_600_000);
  const marks = UPDATE_KINDS.map(() => "?").join(", ");
  const rows = await sql.all<ActivityRow>(
    `SELECT a.id, a.organization_id, a.project_id, a.workspace_id, a.kind, a.body, a.data_json, a.created_at
     FROM activities a LEFT JOIN organizations o ON o.id = a.organization_id
     WHERE a.created_at >= ? AND a.kind IN (${marks})
       AND (a.kind = 'email.received' OR o.kind = 'client' OR EXISTS (SELECT 1 FROM client_work_requests r WHERE r.organization_id = o.id))
       AND NOT EXISTS (SELECT 1 FROM client_service_updates u WHERE u.activity_id = a.id)
     ORDER BY a.created_at, a.rowid LIMIT 500`,
    [floor, ...UPDATE_KINDS],
  );
  let added = 0;
  for (const row of rows) {
    const data = parse(row.data_json);
    if (!interesting(row, data)) continue;
    let projectId = row.project_id;
    let workspaceId = row.workspace_id;
    const taskId = typeof data.taskId === "string" ? data.taskId : typeof data.task_id === "string" ? data.task_id : null;
    if (!projectId && taskId) {
      const task = await sql.get<{ project_id: string | null }>("SELECT project_id FROM tasks WHERE id = ?", [taskId]);
      projectId = task?.project_id ?? null;
    }
    if (!workspaceId && projectId) {
      const space = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE project_id = ? AND status = 'active' LIMIT 1", [projectId]);
      workspaceId = space?.id ?? null;
    }
    const request = typeof data.work_request_id === "string"
      ? data.work_request_id
      : taskId
        ? (await sql.get<{ id: string }>("SELECT id FROM client_work_requests WHERE task_id = ?", [taskId]))?.id ?? null
        : null;
    const links: { label: string; url: string }[] = [];
    let needsReview: { deliverable_id: string; title: string; status: string; version: number }[] = [];
    if (workspaceId) {
      const space = await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [workspaceId]);
      if (space) links.push({ label: "Space", url: `${origin}/w/${space.slug}` });
      links.push({ label: "Review API", url: `${origin}/api/client-services/spaces/${workspaceId}` });
      needsReview = await sql.all(
        `SELECT id AS deliverable_id, title, status, COALESCE(published_version, version) AS version FROM deliverables
         WHERE workspace_id = ? AND status IN ('in_review', 'changes_requested') ORDER BY updated_at DESC LIMIT 20`,
        [workspaceId],
      );
    }
    if (projectId) links.push({ label: "Project", url: `${origin}/projects/${projectId}` });
    for (const key of ["url", "preview_url", "previewUrl", "pr_url", "prUrl"]) {
      if (typeof data[key] === "string" && /^https?:\/\//.test(data[key] as string)) links.push({ label: key, url: data[key] as string });
    }
    try {
      await sql.run(
        `INSERT INTO client_service_updates (
           id, activity_id, organization_id, project_id, workspace_id, work_request_id, kind, summary, links_json, needs_review_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          row.id,
          row.organization_id,
          projectId,
          workspaceId,
          request,
          row.kind,
          (row.body ?? row.kind).slice(0, 2000),
          JSON.stringify(links),
          JSON.stringify(needsReview),
          row.created_at,
        ],
      );
      added += 1;
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("UNIQUE"))) throw error;
    }
  }
  return added;
}

export type ClientUpdate = {
  id: string;
  kind: string;
  created_at: string;
  summary: string;
  organization: { id: string | null; name: string | null; domain: string | null };
  project: { id: string; name: string; status: string } | null;
  space_id: string | null;
  work_request_id: string | null;
  links: { label: string; url: string }[];
  needs_review: { deliverable_id: string; title: string; status: string; version: number }[];
};

export async function listClientUpdates(
  sql: Sql,
  input: { since: string | null; now: number; origin: string },
): Promise<ClientUpdate[] | { error: string }> {
  let since = 0;
  if (input.since) {
    const parsed = /^\d+$/.test(input.since) ? Number(input.since) : Date.parse(input.since);
    if (!Number.isFinite(parsed)) return { error: "Bad since. Use ISO time or unix ms." };
    since = parsed;
  }
  await syncClientUpdates(sql, input.now, input.origin);
  const rows = await sql.all<{
    id: string; kind: string; created_at: number; summary: string; organization_id: string | null; org_name: string | null;
    org_domain: string | null; project_id: string | null; project_name: string | null; project_status: string | null;
    workspace_id: string | null; work_request_id: string | null; links_json: string; needs_review_json: string;
  }>(
    `SELECT u.id, u.kind, u.created_at, u.summary, u.organization_id, o.name AS org_name, o.domain AS org_domain,
            u.project_id, p.name AS project_name, p.status AS project_status, u.workspace_id, u.work_request_id,
            u.links_json, u.needs_review_json
     FROM client_service_updates u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN projects p ON p.id = u.project_id
     WHERE u.created_at > ? ORDER BY u.created_at, u.rowid LIMIT 200`,
    [since],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    created_at: new Date(row.created_at).toISOString(),
    summary: row.summary,
    organization: { id: row.organization_id, name: row.org_name, domain: row.org_domain },
    project: row.project_id && row.project_name ? { id: row.project_id, name: row.project_name, status: row.project_status ?? "" } : null,
    space_id: row.workspace_id,
    work_request_id: row.work_request_id,
    links: JSON.parse(row.links_json),
    needs_review: JSON.parse(row.needs_review_json),
  }));
}

// ---------- Review access for Client Services (read + comment + approve only) ----------

type SpaceRow = { id: string; slug: string; name: string; organization_id: string | null; project_id: string | null; status: string };

async function reviewableSpace(sql: Sql, spaceId: string): Promise<SpaceRow | undefined> {
  return sql.get<SpaceRow>(
    `SELECT w.id, w.slug, w.name, w.organization_id, w.project_id, w.status FROM workspaces w
     JOIN organizations o ON o.id = w.organization_id
     WHERE w.id = ? AND w.status = 'active' AND o.archived_at IS NULL
       AND (o.kind = 'client' OR EXISTS (SELECT 1 FROM client_work_requests r WHERE r.organization_id = o.id))`,
    [spaceId],
  );
}

export async function readSpaceForReview(sql: Sql, spaceId: string) {
  const space = await reviewableSpace(sql, spaceId);
  if (!space) return null;
  const project = space.project_id
    ? await sql.get<{ id: string; name: string; status: string; description: string | null }>(
        "SELECT id, name, status, description FROM projects WHERE id = ?",
        [space.project_id],
      )
    : null;
  const deliverables = await sql.all<{ id: string; title: string; kind: string; status: string; version: number; published_version: number | null; updated_at: number }>(
    `SELECT id, title, kind, status, version, published_version, updated_at FROM deliverables
     WHERE workspace_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 50`,
    [space.id],
  );
  const out = [];
  for (const deliverable of deliverables) {
    const version = deliverable.published_version ?? deliverable.version;
    const items = await sql.all(
      `SELECT id, section, format, channel, title, copy_text, media_json, link_url, status FROM deliverable_items
       WHERE deliverable_id = ? AND version = ? ORDER BY sort`,
      [deliverable.id, version],
    );
    const feedback = await sql.all(
      `SELECT id, item_id, version, author_kind, author_id, decision, body, created_at FROM deliverable_feedback
       WHERE deliverable_id = ? ORDER BY created_at`,
      [deliverable.id],
    );
    out.push({ ...deliverable, review_version: version, items, feedback });
  }
  const tasks = space.project_id
    ? await sql.all(
        "SELECT id, title, stage, status, updated_at FROM tasks WHERE project_id = ? ORDER BY updated_at DESC LIMIT 50",
        [space.project_id],
      )
    : [];
  const requests = await sql.all(
    `SELECT id, subject, state, task_id, created_at FROM client_work_requests WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 20`,
    [space.id],
  );
  return { space: { id: space.id, slug: space.slug, name: space.name, organization_id: space.organization_id }, project, deliverables: out, tasks, work_requests: requests };
}

export type ReviewDecision = "approve" | "changes" | "comment";

/** Client Services feedback on one deliverable in a Space. Logged as activity; changes wake the agent. */
export async function reviewDeliverable(
  sql: Sql,
  input: { spaceId: string; deliverableId: string; itemId?: string | null; decision: ReviewDecision; body: string; now: number },
): Promise<{ ok: true; status: string; organizationId: string } | { ok: false; error: "missing" | "invalid" }> {
  const space = await reviewableSpace(sql, input.spaceId);
  if (!space?.organization_id) return { ok: false, error: "missing" };
  const row = await sql.get<{ id: string; title: string; status: string; version: number; published_version: number | null; project_id: string | null }>(
    "SELECT id, title, status, version, published_version, project_id FROM deliverables WHERE id = ? AND workspace_id = ? AND status != 'archived'",
    [input.deliverableId, space.id],
  );
  if (!row) return { ok: false, error: "missing" };
  const body = input.body.trim().slice(0, 8000);
  if (input.decision === "changes" && !body) return { ok: false, error: "invalid" };
  if (input.decision === "comment" && !body) return { ok: false, error: "invalid" };
  const version = row.published_version ?? row.version;
  const itemId = input.itemId?.trim() || null;
  if (itemId) {
    const item = await sql.get<{ id: string }>(
      "SELECT id FROM deliverable_items WHERE id = ? AND deliverable_id = ? AND version = ?",
      [itemId, row.id, version],
    );
    if (!item) return { ok: false, error: "invalid" };
  }
  const writes: Write[] = [
    {
      statement: `INSERT INTO deliverable_feedback (id, deliverable_id, item_id, version, author_kind, author_id, decision, body, created_at)
                  VALUES (?, ?, ?, ?, 'staff', 'client-services', ?, ?, ?)`,
      params: [crypto.randomUUID(), row.id, itemId, version, input.decision, body || null, input.now],
    },
  ];
  let status = row.status;
  if (input.decision === "approve") {
    writes.push(
      itemId
        ? { statement: "UPDATE deliverable_items SET status = 'approved' WHERE id = ?", params: [itemId] }
        : {
            statement: "UPDATE deliverable_items SET status = 'approved' WHERE deliverable_id = ? AND version = ? AND status = 'pending'",
            params: [row.id, version],
          },
    );
    if (!itemId) status = "approved";
  }
  if (input.decision === "changes") {
    if (itemId) writes.push({ statement: "UPDATE deliverable_items SET status = 'changes_requested' WHERE id = ?", params: [itemId] });
    status = "changes_requested";
  }
  if (status !== row.status) {
    writes.push({ statement: "UPDATE deliverables SET status = ?, updated_at = ? WHERE id = ?", params: [status, input.now, row.id] });
  }
  const kind = input.decision === "approve" ? "client_services.approved" : input.decision === "changes" ? "client_services.changes_requested" : "client_services.comment";
  writes.push({
    statement: `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
                VALUES (?, ?, ?, ?, ?, 'agent', 'client-services', ?, ?, ?)`,
    params: [
      crypto.randomUUID(),
      space.organization_id,
      row.project_id ?? space.project_id,
      space.id,
      kind,
      (body || (input.decision === "approve" ? `Approved ${row.title}.` : row.title)).slice(0, 2000),
      JSON.stringify({ deliverable_id: row.id, item_id: itemId, version, decision: input.decision, status }),
      input.now,
    ],
  });
  await sql.batch(writes);
  return { ok: true, status, organizationId: space.organization_id };
}
