import type { Caller } from "@/lib/authz";
import { nextColumnPosition } from "@/lib/task-position";
import { LIMITS } from "@/lib/policy/limits";
import { activityLinks, runStatus } from "@/lib/agent-activity";
import type { Sql } from "./sql";

export type OrgKind = "lead" | "client" | "past_client" | "partner";

export type Organization = {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  notes: string | null;
  kind: OrgKind;
  created_at: number;
  updated_at: number;
};

export type WorkspaceLink = {
  id: string;
  slug: string;
  display_name: string;
};

export type Contact = {
  id: string;
  organization_id: string;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: number;
};

export type TaskStatus = "todo" | "doing" | "blocked" | "done";

export type TaskRow = {
  id: string;
  organization_id: string;
  title: string;
  status: TaskStatus;
  due_at: number | null;
  done_at: number | null;
};

export const PROJECT_STATUSES = ["planned", "active", "waiting_on_client", "done", "paused", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectRow = {
  id: string;
  organization_id: string;
  deal_id: string | null;
  name: string;
  status: ProjectStatus;
  owner_user_id: string | null;
  starts_at: number | null;
  due_at: number | null;
  created_at: number;
  updated_at: number;
  description: string | null;
};

export type MilestoneRow = {
  id: string;
  project_id: string;
  name: string;
  due_at: number | null;
  done_at: number | null;
  sort: number;
};

export const TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;

export type WorkTask = TaskRow & {
  project_id: string | null;
  milestone_id: string | null;
  assignee_user_id: string | null;
  organization_name: string;
  assignee_email: string | null;
  stage: string;
  position: number;
  blocked_reason: string | null;
  skills_json: string | null;
  round: number;
  created_by_kind: string;
  cursor_agent_id: string | null;
  created_at: number;
  project_name: string | null;
  project_status: string | null;
};

export type BoardCard = WorkTask & {
  run_started_at: number | null;
  pr_number: number | null;
  repo_full_name: string | null;
};

export type BoardActivity = {
  id: string;
  taskId: string;
  kind: string;
  body: string | null;
  createdAt: number;
};

export const STATUS_HEALTHS = ["on_track", "at_risk", "off_track", "done"] as const;
export const STATUS_AUDIENCES = ["internal", "client"] as const;
export type StatusHealth = (typeof STATUS_HEALTHS)[number];
export type StatusAudience = (typeof STATUS_AUDIENCES)[number];

export type StatusUpdateRow = {
  id: string;
  project_id: string;
  organization_id: string;
  health: StatusHealth;
  audience: StatusAudience;
  body: string;
  state: "draft" | "published";
  actor_kind: string;
  actor_id: string | null;
  created_at: number;
  published_at: number | null;
};

export type TodayBoard = {
  newLeads: { id: string; title: string; organizationId: string; organizationName: string }[];
  calls: { id: string; organizationId: string; organizationName: string; startsAt: number }[];
  tasks: WorkTask[];
  stalledDeals: {
    id: string;
    title: string;
    organizationId: string;
    organizationName: string;
    nextStep: string | null;
    nextStepAt: number | null;
  }[];
  waitingSpaces: { id: string; slug: string; displayName: string; requestTitle: string }[];
  invoices: { id: string; number: string; organizationName: string; dueAt: number }[];
  agentNotes: {
    id: string;
    body: string | null;
    createdAt: number;
    organizationId: string | null;
    organizationName: string;
  }[];
  agentActivity: {
    id: string;
    kind: string;
    body: string | null;
    status: string;
    createdAt: number;
    organizationId: string | null;
    organizationName: string;
    reportUrl: string | null;
    artifacts: string[];
  }[];
  workRequests: { id: string; organizationId: string; organizationName: string; body: string; channel: string }[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PROJECT_COLUMNS =
  "id, organization_id, deal_id, name, status, owner_user_id, starts_at, due_at, created_at, updated_at, description";
const MILESTONE_COLUMNS = "id, project_id, name, due_at, done_at, sort";
const STATUS_COLUMNS =
  "id, project_id, organization_id, health, audience, body, state, actor_kind, actor_id, created_at, published_at";
const WORK_COLUMNS = `t.id, t.organization_id, t.title, t.status, t.due_at, t.done_at,
  t.project_id, t.milestone_id, t.assignee_user_id, t.stage, t.position, t.blocked_reason,
  t.skills_json, t.round, t.created_by_kind, t.cursor_agent_id, t.created_at,
  o.name AS organization_name, s.email AS assignee_email,
  p.name AS project_name, p.status AS project_status`;
const BOARD_COLUMNS = `${WORK_COLUMNS},
  cr.started_at AS run_started_at, cr.pr_number AS pr_number, rp.full_name AS repo_full_name`;
const WORK_JOINS = `FROM tasks t
  JOIN organizations o ON o.id = t.organization_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN staff s ON s.user_id = t.assignee_user_id`;
const BOARD_JOINS = `${WORK_JOINS}
  LEFT JOIN cloud_runs cr ON cr.id = (
    SELECT c2.id FROM cloud_runs c2 WHERE c2.task_id = t.id ORDER BY c2.started_at DESC LIMIT 1
  )
  LEFT JOIN repos rp ON rp.id = cr.repo_id`;

export type ActivityRow = {
  id: string;
  kind: string;
  body: string | null;
  actor_kind: string;
  created_at: number;
};

export type CrmError = "forbidden" | "invalid" | "taken" | "email_taken" | "space_taken" | "missing";

export type CrmResult<T> = { ok: true; value: T } | { ok: false; error: CrmError };

export const CRM_ERRORS: Record<CrmError, string> = {
  forbidden: "You can't do that.",
  invalid: "Check the name and website.",
  taken: "That website is already on a client.",
  email_taken: "That email is already on a person.",
  space_taken: "That space is already linked to a client.",
  missing: "That client or space is not here.",
};

const KINDS = new Set<OrgKind>(["lead", "client", "past_client", "partner"]);

const ORG_COLUMNS = "id, name, domain, website, industry, notes, kind, created_at, updated_at";

function staffUserId(caller: Caller): string | null {
  if (!caller.staff || !caller.userId) return null;
  return caller.userId;
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE");
}

/** Bare host for matching. Blank stays empty. A bad website is null. */
export function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  let hostname: string;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    hostname = new URL(withScheme).hostname;
  } catch {
    return null;
  }
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  if (
    hostname.length === 0 ||
    !hostname.includes(".") ||
    hostname.startsWith(".") ||
    hostname.endsWith(".") ||
    hostname.includes("..")
  ) {
    return null;
  }
  return hostname;
}

export async function listOrganizations(sql: Sql, caller: Caller): Promise<Organization[]> {
  if (!staffUserId(caller)) return [];
  return sql.all<Organization>(
    `SELECT ${ORG_COLUMNS} FROM organizations WHERE archived_at IS NULL ORDER BY name`,
  );
}

export type StoredAssessment = {
  id: string;
  totalScore: number | null;
  completedAt: number;
  reportUrl: string | null;
  scores: Record<string, unknown>;
  answers: Record<string, unknown>;
};

export type AssessmentView = {
  total: string;
  lines: string[];
  answers: { key: string; value: string }[];
  reportUrl: string | null;
};

function jsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function scoreNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scoreRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function answerText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => answerText(item))
      .filter((item) => item.length > 0)
      .join(", ");
  }
  return "";
}

export function presentAssessment(row: StoredAssessment): AssessmentView {
  const overall = scoreRecord(row.scores.overall);
  const readiness = scoreRecord(row.scores.readiness);
  const growth = scoreRecord(row.scores.growth);
  const visibility = scoreRecord(row.scores.visibility);
  const total = scoreNumber(overall.total) ?? row.totalScore;
  const band = typeof overall.band === "string" ? overall.band : null;
  const lines: string[] = [];
  const readinessTotal = scoreNumber(readiness.total);
  if (readinessTotal != null) lines.push(`Readiness ${readinessTotal}.`);
  for (const key of ["data", "process", "people", "decision"] as const) {
    const value = scoreNumber(readiness[key]);
    if (value != null) lines.push(`${key.slice(0, 1).toUpperCase()}${key.slice(1)} ${value}.`);
  }
  const growthTotal = scoreNumber(growth.total);
  if (growthTotal != null) lines.push(`Growth ${growthTotal}.`);
  const visibilityTotal = scoreNumber(visibility.total);
  if (visibilityTotal != null) lines.push(`Visibility ${visibilityTotal}.`);
  return {
    total: total == null ? "No overall score." : band ? `Overall ${band} (${total}/100).` : `Overall score ${total}.`,
    lines,
    answers: Object.entries(row.answers).flatMap(([key, value]) => {
      const text = answerText(value);
      return text ? [{ key, value: text }] : [];
    }),
    reportUrl: row.reportUrl,
  };
}

export async function latestAssessment(
  sql: Sql,
  caller: Caller,
  organizationId: string,
): Promise<StoredAssessment | null> {
  if (!staffUserId(caller)) return null;
  const row = await sql.get<{
    id: string;
    total_score: number | null;
    completed_at: number;
    report_url: string | null;
    scores_json: string;
    answers_json: string;
  }>(
    `SELECT id, total_score, completed_at, report_url, scores_json, answers_json
     FROM assessments WHERE organization_id = ?
     ORDER BY completed_at DESC LIMIT 1`,
    [organizationId],
  );
  if (!row) return null;
  return {
    id: row.id,
    totalScore: row.total_score,
    completedAt: row.completed_at,
    reportUrl: row.report_url,
    scores: jsonObject(row.scores_json),
    answers: jsonObject(row.answers_json),
  };
}

export async function organizationById(
  sql: Sql,
  caller: Caller,
  id: string,
): Promise<Organization | undefined> {
  if (!staffUserId(caller)) return undefined;
  return sql.get<Organization>(
    `SELECT ${ORG_COLUMNS} FROM organizations WHERE id = ? AND archived_at IS NULL`,
    [id],
  );
}

export async function createOrganization(
  sql: Sql,
  caller: Caller,
  input: { name: string; website?: string; kind?: OrgKind },
  now: number,
): Promise<CrmResult<Organization>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (name.length < 1 || name.length > 200) return { ok: false, error: "invalid" };
  const kind = input.kind ?? "client";
  if (!KINDS.has(kind)) return { ok: false, error: "invalid" };
  const websiteRaw = (input.website ?? "").trim();
  let domain: string | null = null;
  let website: string | null = null;
  if (websiteRaw.length > 0) {
    domain = normalizeDomain(websiteRaw);
    if (!domain) return { ok: false, error: "invalid" };
    website = websiteRaw;
  }
  const id = crypto.randomUUID();
  try {
    await sql.exec("BEGIN");
    await sql.run(
      `INSERT INTO organizations (id, name, domain, website, kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, domain, website, kind, now, now],
    );
    await sql.run(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, created_at)
       VALUES (?, ?, 'note', 'staff', ?, ?)`,
      [crypto.randomUUID(), id, actorId, now],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    if (isUnique(error)) return { ok: false, error: "taken" };
    throw error;
  }
  const row = await organizationById(sql, caller, id);
  if (!row) return { ok: false, error: "missing" };
  return { ok: true, value: row };
}

/** A lead typed in by staff: the company, a new deal, and a contact when an email is given. */
export async function createManualLead(
  sql: Sql,
  caller: Caller,
  input: { name: string; website?: string; contactName?: string; email?: string },
  now: number,
): Promise<CrmResult<{ organizationId: string; dealId: string }>> {
  const created = await createOrganization(sql, caller, { name: input.name, website: input.website, kind: "lead" }, now);
  if (!created.ok) return created;
  const dealId = crypto.randomUUID();
  const title = `${created.value.name}`.slice(0, 200);
  await sql.run(
    `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
     VALUES (?, ?, ?, 'new', 'manual', ?, ?)`,
    [dealId, created.value.id, title, now, now],
  );
  const email = (input.email ?? "").trim();
  if (email) {
    const contact = await createContact(
      sql,
      caller,
      {
        organizationId: created.value.id,
        name: (input.contactName ?? "").trim() || created.value.name,
        email,
        primary: true,
      },
      now,
    );
    if (!contact.ok && contact.error !== "invalid") return { ok: false, error: contact.error };
  }
  return { ok: true, value: { organizationId: created.value.id, dealId } };
}

export async function unlinkedWorkspaces(sql: Sql, caller: Caller): Promise<WorkspaceLink[]> {
  if (!staffUserId(caller)) return [];
  return sql.all<WorkspaceLink>(
    `SELECT id, slug, display_name FROM workspaces
     WHERE organization_id IS NULL AND status != 'purged'
     ORDER BY display_name`,
  );
}

export async function linkWorkspace(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; workspaceId: string },
  now: number,
): Promise<{ ok: true } | { ok: false; error: CrmError }> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const org = await organizationById(sql, caller, input.organizationId);
  if (!org) return { ok: false, error: "missing" };
  const space = await sql.get<{ id: string; organization_id: string | null }>(
    "SELECT id, organization_id FROM workspaces WHERE id = ?",
    [input.workspaceId],
  );
  if (!space) return { ok: false, error: "missing" };
  if (space.organization_id === input.organizationId) return { ok: true };
  if (space.organization_id) return { ok: false, error: "space_taken" };
  try {
    await sql.exec("BEGIN");
    await sql.run(
      "UPDATE workspaces SET organization_id = ? WHERE id = ? AND organization_id IS NULL",
      [input.organizationId, input.workspaceId],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, workspace_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, ?, 'note', 'staff', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.organizationId,
        input.workspaceId,
        actorId,
        "Linked a space.",
        now,
      ],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { ok: true };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_COLUMNS = "id, organization_id, name, title, email, phone, is_primary";
const TASK_COLUMNS = "id, organization_id, title, status, due_at, done_at";

function cleanText(raw: string, max: number): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > max) return null;
  return trimmed;
}

function cleanEmail(raw: string | undefined): string | null | undefined {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 200 || !EMAIL.test(trimmed)) return undefined;
  return trimmed;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

function isHealth(value: string): value is StatusHealth {
  return (STATUS_HEALTHS as readonly string[]).includes(value);
}

function isAudience(value: string): value is StatusAudience {
  return (STATUS_AUDIENCES as readonly string[]).includes(value);
}

async function openProject(
  sql: Sql,
  projectId: string,
): Promise<{ id: string; organization_id: string } | undefined> {
  return sql.get<{ id: string; organization_id: string }>(
    `SELECT p.id, p.organization_id FROM projects p
     JOIN organizations o ON o.id = p.organization_id
     WHERE p.id = ? AND o.archived_at IS NULL`,
    [projectId],
  );
}

async function liveOrg(sql: Sql, caller: Caller, id: string): Promise<boolean> {
  if (!staffUserId(caller)) return false;
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM organizations WHERE id = ? AND archived_at IS NULL",
    [id],
  );
  return Boolean(row);
}

export async function listContacts(sql: Sql, caller: Caller, organizationId: string): Promise<Contact[]> {
  if (!(await liveOrg(sql, caller, organizationId))) return [];
  return sql.all<Contact>(
    `SELECT ${CONTACT_COLUMNS} FROM contacts WHERE organization_id = ? ORDER BY name`,
    [organizationId],
  );
}

export async function createContact(
  sql: Sql,
  caller: Caller,
  input: {
    organizationId: string;
    name: string;
    email?: string;
    phone?: string;
    title?: string;
    primary?: boolean;
  },
  now: number,
): Promise<CrmResult<Contact>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  if (!(await liveOrg(sql, caller, input.organizationId))) return { ok: false, error: "missing" };
  const name = cleanText(input.name, 200);
  if (!name) return { ok: false, error: "invalid" };
  const email = cleanEmail(input.email);
  if (email === undefined) return { ok: false, error: "invalid" };
  const phoneRaw = (input.phone ?? "").trim();
  if (phoneRaw.length > 40) return { ok: false, error: "invalid" };
  const phone = phoneRaw.length === 0 ? null : phoneRaw;
  const titleRaw = (input.title ?? "").trim();
  if (titleRaw.length > 120) return { ok: false, error: "invalid" };
  const title = titleRaw.length === 0 ? null : titleRaw;
  const id = crypto.randomUUID();
  try {
    await sql.exec("BEGIN");
    if (input.primary) {
      await sql.run("UPDATE contacts SET is_primary = 0 WHERE organization_id = ?", [input.organizationId]);
    }
    await sql.run(
      `INSERT INTO contacts (
         id, organization_id, name, title, email, phone, is_primary, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.organizationId, name, title, email, phone, input.primary ? 1 : 0, now, now],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, contact_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, ?, 'note', 'staff', ?, ?, ?)`,
      [crypto.randomUUID(), input.organizationId, id, actorId, `Added ${name}.`, now],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    if (isUnique(error)) return { ok: false, error: "email_taken" };
    throw error;
  }
  const row = await sql.get<Contact>(`SELECT ${CONTACT_COLUMNS} FROM contacts WHERE id = ?`, [id]);
  if (!row) return { ok: false, error: "missing" };
  return { ok: true, value: row };
}

async function writeStaffActivity(
  sql: Sql,
  caller: Caller,
  input: {
    organizationId: string;
    kind: "note" | "call" | "task" | "staff.instruction";
    body: string;
    contactId?: string;
    data?: Record<string, unknown>;
  },
  now: number,
): Promise<CrmResult<{ id: string }>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  if (!(await liveOrg(sql, caller, input.organizationId))) return { ok: false, error: "missing" };
  const body = cleanText(input.body, 2000);
  if (!body) return { ok: false, error: "invalid" };
  const id = crypto.randomUUID();
  await sql.exec("BEGIN");
  try {
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, contact_id, kind, actor_kind, actor_id, body, data_json, created_at
       ) VALUES (?, ?, ?, ?, 'staff', ?, ?, ?, ?)`,
      [
        id,
        input.organizationId,
        input.contactId ?? null,
        input.kind,
        actorId,
        body,
        input.data ? JSON.stringify(input.data) : null,
        now,
      ],
    );
    await sql.run("UPDATE organizations SET updated_at = ? WHERE id = ?", [now, input.organizationId]);
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, value: { id } };
}

export function addNote(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; body: string; contactId?: string; asInstruction?: boolean; taskId?: string },
  now: number,
): Promise<CrmResult<{ id: string }>> {
  const kind = input.asInstruction ? "staff.instruction" : "note";
  const data = input.taskId ? { taskId: input.taskId } : undefined;
  return writeStaffActivity(sql, caller, { ...input, kind, data }, now);
}

export function logCall(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; body: string; contactId?: string },
  now: number,
): Promise<CrmResult<{ id: string }>> {
  return writeStaffActivity(sql, caller, { ...input, kind: "call" }, now);
}

export async function listOpenTasks(sql: Sql, caller: Caller, organizationId: string): Promise<TaskRow[]> {
  if (!(await liveOrg(sql, caller, organizationId))) return [];
  return sql.all<TaskRow>(
    `SELECT ${TASK_COLUMNS} FROM tasks
     WHERE organization_id = ? AND status != 'done'
     ORDER BY created_at`,
    [organizationId],
  );
}

export async function createTask(
  sql: Sql,
  caller: Caller,
  input: {
    organizationId?: string;
    projectId?: string;
    milestoneId?: string | null;
    title: string;
    dueAt?: number | null;
    assigneeUserId?: string | null;
  },
  now: number,
): Promise<CrmResult<TaskRow>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const title = cleanText(input.title, 200);
  if (!title) return { ok: false, error: "invalid" };
  const dueAt = input.dueAt ?? null;
  if (dueAt !== null && !Number.isInteger(dueAt)) return { ok: false, error: "invalid" };
  const projectId = blankToNull(input.projectId);
  const milestoneId = blankToNull(input.milestoneId);
  const assigneeUserId = blankToNull(input.assigneeUserId);
  let organizationId = blankToNull(input.organizationId);
  if (projectId) {
    const project = await openProject(sql, projectId);
    if (!project) return { ok: false, error: "missing" };
    if (organizationId && organizationId !== project.organization_id) return { ok: false, error: "invalid" };
    organizationId = project.organization_id;
  } else if (!organizationId || !(await liveOrg(sql, caller, organizationId))) {
    return { ok: false, error: organizationId ? "missing" : "invalid" };
  }
  if (milestoneId) {
    if (!projectId) return { ok: false, error: "invalid" };
    const milestone = await sql.get<{ id: string }>(
      "SELECT id FROM milestones WHERE id = ? AND project_id = ?",
      [milestoneId, projectId],
    );
    if (!milestone) return { ok: false, error: "invalid" };
  }
  if (assigneeUserId) {
    const person = await sql.get<{ user_id: string }>(
      "SELECT user_id FROM staff WHERE user_id = ? AND revoked_at IS NULL",
      [assigneeUserId],
    );
    if (!person) return { ok: false, error: "invalid" };
  }
  const id = crypto.randomUUID();
  const position = await nextColumnPosition(sql, {
    organizationId,
    projectId,
    column: "describe",
  });
  await sql.exec("BEGIN");
  try {
    await sql.run(
      `INSERT INTO tasks (
         id, project_id, milestone_id, organization_id, title, status, assignee_user_id,
         due_at, created_at, updated_at, done_at, position
       ) VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, NULL, ?)`,
      [id, projectId, milestoneId, organizationId, title, assigneeUserId, dueAt, now, now, position],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, project_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, ?, 'task', 'staff', ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, projectId, actorId, title, now],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  const row = await sql.get<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, [id]);
  if (!row) return { ok: false, error: "missing" };
  return { ok: true, value: row };
}

export async function completeTask(
  sql: Sql,
  caller: Caller,
  input: { taskId: string },
  now: number,
): Promise<{ ok: true } | { ok: false; error: CrmError }> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const task = await sql.get<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, [input.taskId]);
  if (!task?.organization_id) return { ok: false, error: "missing" };
  if (!(await liveOrg(sql, caller, task.organization_id))) return { ok: false, error: "missing" };
  if (task.status === "done") return { ok: true };
  await sql.exec("BEGIN");
  try {
    await sql.run(
      "UPDATE tasks SET status = 'done', done_at = ?, updated_at = ? WHERE id = ? AND status != 'done'",
      [now, now, task.id],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, 'task_done', 'staff', ?, ?, ?)`,
      [crypto.randomUUID(), task.organization_id, actorId, task.title, now],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { ok: true };
}

export type DeletedTask = {
  id: string;
  title: string;
  organizationId: string;
  projectId: string | null;
};

export type DeletedProject = {
  id: string;
  name: string;
  organizationId: string;
  tasksRemoved: number;
};

type DeleteActor = { kind: "staff" | "agent"; id: string };

function deletedKind(actor: DeleteActor, record: "task" | "project"): string {
  if (actor.kind === "agent") return record === "task" ? "agent.task_deleted" : "agent.project_deleted";
  return record === "task" ? "task_deleted" : "project_deleted";
}

/** Drops the rows that point at a task, then the task. The caller owns the transaction. */
async function eraseTaskRow(sql: Sql, taskId: string, now: number): Promise<void> {
  await sql.run("DELETE FROM cloud_runs WHERE task_id = ?", [taskId]);
  await sql.run("DELETE FROM agent_questions WHERE task_id = ?", [taskId]);
  await sql.run(
    "UPDATE client_workflows SET task_id = NULL, next_run_at = NULL, updated_at = ? WHERE task_id = ?",
    [now, taskId],
  );
  await sql.run("DELETE FROM tasks WHERE id = ?", [taskId]);
}

/** Removes one task that belongs to this live client. */
export async function eraseTask(
  sql: Sql,
  input: { taskId: string; organizationId: string; actor: DeleteActor },
  now: number,
): Promise<{ ok: true; value: DeletedTask } | { ok: false; error: "missing" | "invalid" }> {
  const taskId = input.taskId.trim();
  if (!taskId || !input.organizationId.trim() || !input.actor.id) return { ok: false, error: "invalid" };
  const task = await sql.get<{ id: string; title: string; organization_id: string; project_id: string | null }>(
    `SELECT t.id, t.title, t.organization_id, t.project_id
     FROM tasks t
     JOIN organizations o ON o.id = t.organization_id
     WHERE t.id = ? AND t.organization_id = ? AND o.archived_at IS NULL`,
    [taskId, input.organizationId],
  );
  if (!task) return { ok: false, error: "missing" };
  await sql.exec("BEGIN");
  try {
    await eraseTaskRow(sql, task.id, now);
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        task.organization_id,
        task.project_id,
        deletedKind(input.actor, "task"),
        input.actor.kind,
        input.actor.id,
        task.title,
        JSON.stringify({ taskId: task.id }),
        now,
      ],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return {
    ok: true,
    value: {
      id: task.id,
      title: task.title,
      organizationId: task.organization_id,
      projectId: task.project_id,
    },
  };
}

/** Removes a project and its tasks. The space, repo, invoice, and deliverable stay, unlinked. */
export async function eraseProject(
  sql: Sql,
  input: { projectId: string; organizationId: string; actor: DeleteActor },
  now: number,
): Promise<{ ok: true; value: DeletedProject } | { ok: false; error: "missing" | "invalid" }> {
  const projectId = input.projectId.trim();
  if (!projectId || !input.organizationId.trim() || !input.actor.id) return { ok: false, error: "invalid" };
  const project = await sql.get<{ id: string; name: string; organization_id: string }>(
    `SELECT p.id, p.name, p.organization_id
     FROM projects p
     JOIN organizations o ON o.id = p.organization_id
     WHERE p.id = ? AND p.organization_id = ? AND o.archived_at IS NULL`,
    [projectId, input.organizationId],
  );
  if (!project) return { ok: false, error: "missing" };
  await sql.exec("BEGIN");
  let tasksRemoved = 0;
  try {
    const tasks = await sql.all<{ id: string }>("SELECT id FROM tasks WHERE project_id = ?", [project.id]);
    tasksRemoved = tasks.length;
    for (const task of tasks) await eraseTaskRow(sql, task.id, now);
    await sql.run(
      `UPDATE tasks SET milestone_id = NULL
       WHERE milestone_id IN (SELECT id FROM milestones WHERE project_id = ?)`,
      [project.id],
    );
    await sql.run(
      `UPDATE client_workflows
       SET project_id = NULL, next_run_at = NULL, updated_at = ?
       WHERE project_id = ?`,
      [now, project.id],
    );
    await sql.run(
      `UPDATE invoice_items SET milestone_id = NULL
       WHERE milestone_id IN (SELECT id FROM milestones WHERE project_id = ?)`,
      [project.id],
    );
    await sql.run("DELETE FROM milestones WHERE project_id = ?", [project.id]);
    await sql.run("DELETE FROM status_updates WHERE project_id = ?", [project.id]);
    for (const table of ["workspaces", "repos", "deliverables", "invoices", "activities", "workflow_groups", "swarm_runs"]) {
      await sql.run(`UPDATE ${table} SET project_id = NULL WHERE project_id = ?`, [project.id]);
    }
    await sql.run("DELETE FROM projects WHERE id = ?", [project.id]);
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        project.organization_id,
        deletedKind(input.actor, "project"),
        input.actor.kind,
        input.actor.id,
        project.name,
        JSON.stringify({ projectId: project.id, tasksRemoved }),
        now,
      ],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return {
    ok: true,
    value: {
      id: project.id,
      name: project.name,
      organizationId: project.organization_id,
      tasksRemoved,
    },
  };
}

export async function deleteTask(
  sql: Sql,
  caller: Caller,
  input: { taskId: string },
  now: number,
): Promise<{ ok: true; value: DeletedTask } | { ok: false; error: CrmError }> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const taskId = input.taskId.trim();
  if (!taskId) return { ok: false, error: "invalid" };
  const task = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM tasks WHERE id = ?", [taskId]);
  if (!task?.organization_id) return { ok: false, error: "missing" };
  if (!(await liveOrg(sql, caller, task.organization_id))) return { ok: false, error: "missing" };
  return eraseTask(sql, { taskId, organizationId: task.organization_id, actor: { kind: "staff", id: actorId } }, now);
}

export async function deleteProject(
  sql: Sql,
  caller: Caller,
  input: { projectId: string },
  now: number,
): Promise<{ ok: true; value: DeletedProject } | { ok: false; error: CrmError }> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const projectId = input.projectId.trim();
  if (!projectId) return { ok: false, error: "invalid" };
  const project = await openProject(sql, projectId);
  if (!project) return { ok: false, error: "missing" };
  return eraseProject(
    sql,
    { projectId, organizationId: project.organization_id, actor: { kind: "staff", id: actorId } },
    now,
  );
}

export async function listProjects(
  sql: Sql,
  caller: Caller,
  organizationId?: string,
): Promise<ProjectRow[]> {
  if (!staffUserId(caller)) return [];
  if (organizationId) {
    return sql.all<ProjectRow>(
      `SELECT ${PROJECT_COLUMNS} FROM projects
       WHERE organization_id = ?
         AND organization_id IN (SELECT id FROM organizations WHERE archived_at IS NULL)
       ORDER BY updated_at DESC, name`,
      [organizationId],
    );
  }
  return sql.all<ProjectRow>(
    `SELECT p.id, p.organization_id, p.deal_id, p.name, p.status, p.owner_user_id,
            p.starts_at, p.due_at, p.created_at, p.updated_at, p.description
     FROM projects p
     JOIN organizations o ON o.id = p.organization_id
     WHERE o.archived_at IS NULL
     ORDER BY p.updated_at DESC, p.name`,
  );
}

export async function projectById(
  sql: Sql,
  caller: Caller,
  id: string,
): Promise<ProjectRow | undefined> {
  if (!staffUserId(caller)) return undefined;
  return sql.get<ProjectRow>(
    `SELECT p.id, p.organization_id, p.deal_id, p.name, p.status, p.owner_user_id,
            p.starts_at, p.due_at, p.created_at, p.updated_at, p.description
     FROM projects p
     JOIN organizations o ON o.id = p.organization_id
     WHERE p.id = ? AND o.archived_at IS NULL`,
    [id],
  );
}

type LooseHome = { id: string; name: string };

/** Attaches the client's single loose space and single loose repo. Several of either stay loose. */
export async function attachLooseHome(
  sql: Sql,
  organizationId: string,
  projectId: string,
): Promise<{ looseSpaces: LooseHome[]; looseRepos: LooseHome[] }> {
  const spaces = await sql.all<LooseHome>(
    `SELECT id, display_name AS name FROM workspaces
     WHERE organization_id = ? AND project_id IS NULL AND status != 'purged'
     ORDER BY opened_at, id`,
    [organizationId],
  );
  const repos = await sql.all<LooseHome>(
    `SELECT id, full_name AS name FROM repos
     WHERE organization_id = ? AND project_id IS NULL AND archived_at IS NULL
     ORDER BY full_name, id`,
    [organizationId],
  );
  const space = spaces.length === 1 ? spaces[0] : undefined;
  const repo = repos.length === 1 ? repos[0] : undefined;
  if (space) {
    await sql.run("UPDATE workspaces SET project_id = ? WHERE id = ? AND project_id IS NULL", [projectId, space.id]);
  }
  if (repo) {
    await sql.run("UPDATE repos SET project_id = ? WHERE id = ? AND project_id IS NULL AND archived_at IS NULL", [
      projectId,
      repo.id,
    ]);
  }
  return {
    looseSpaces: spaces.length === 1 ? [] : spaces,
    looseRepos: repos.length === 1 ? [] : repos,
  };
}

export async function createProject(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; name: string; dueAt?: number | null; status?: ProjectStatus },
  now: number,
): Promise<CrmResult<ProjectRow>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  if (!(await liveOrg(sql, caller, input.organizationId))) return { ok: false, error: "missing" };
  const name = cleanText(input.name, 200);
  if (!name) return { ok: false, error: "invalid" };
  const dueAt = input.dueAt ?? null;
  if (dueAt !== null && !Number.isInteger(dueAt)) return { ok: false, error: "invalid" };
  const status = input.status ?? "planned";
  if (!isProjectStatus(status)) return { ok: false, error: "invalid" };
  const existing = await sql.get<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM projects
     WHERE organization_id = ? AND lower(name) = lower(?)
     ORDER BY created_at
     LIMIT 1`,
    [input.organizationId, name],
  );
  if (existing) {
    await attachLooseHome(sql, input.organizationId, existing.id);
    return { ok: true, value: existing };
  }
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO projects (
       id, organization_id, deal_id, name, status, owner_user_id, starts_at, due_at, created_at, updated_at
     ) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?)`,
    [id, input.organizationId, name, status, actorId, dueAt, now, now],
  );
  const row = await sql.get<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`, [id]);
  if (!row) return { ok: false, error: "missing" };
  await attachLooseHome(sql, input.organizationId, row.id);
  return { ok: true, value: row };
}

export async function updateProject(
  sql: Sql,
  caller: Caller,
  input: { projectId: string; status: ProjectStatus },
  now: number,
): Promise<CrmResult<{ id: string }>> {
  if (!staffUserId(caller)) return { ok: false, error: "forbidden" };
  if (!isProjectStatus(input.status)) return { ok: false, error: "invalid" };
  const project = await openProject(sql, input.projectId);
  if (!project) return { ok: false, error: "missing" };
  await sql.run("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?", [input.status, now, project.id]);
  return { ok: true, value: { id: project.id } };
}

/** What the project is for. An empty note clears it. */
export async function saveProjectDescription(
  sql: Sql,
  caller: Caller,
  input: { projectId: string; description: string },
  now: number,
): Promise<CrmResult<{ id: string }>> {
  if (!staffUserId(caller)) return { ok: false, error: "forbidden" };
  const project = await openProject(sql, input.projectId);
  if (!project) return { ok: false, error: "missing" };
  const description = input.description.trim();
  if (description.length > 4000) return { ok: false, error: "invalid" };
  await sql.run("UPDATE projects SET description = ?, updated_at = ? WHERE id = ?", [
    description.length > 0 ? description : null,
    now,
    project.id,
  ]);
  return { ok: true, value: { id: project.id } };
}

export async function listMilestones(sql: Sql, caller: Caller, projectId: string): Promise<MilestoneRow[]> {
  if (!staffUserId(caller) || !(await openProject(sql, projectId))) return [];
  return sql.all<MilestoneRow>(
    `SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE project_id = ? ORDER BY sort, name`,
    [projectId],
  );
}

export async function createMilestone(
  sql: Sql,
  caller: Caller,
  input: { projectId: string; name: string; dueAt?: number | null },
  now: number,
): Promise<CrmResult<MilestoneRow>> {
  void now;
  if (!staffUserId(caller)) return { ok: false, error: "forbidden" };
  const project = await openProject(sql, input.projectId);
  if (!project) return { ok: false, error: "missing" };
  const name = cleanText(input.name, 200);
  if (!name) return { ok: false, error: "invalid" };
  const dueAt = input.dueAt ?? null;
  if (dueAt !== null && !Number.isInteger(dueAt)) return { ok: false, error: "invalid" };
  const sortRow = await sql.get<{ next: number }>(
    "SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM milestones WHERE project_id = ?",
    [project.id],
  );
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO milestones (id, project_id, name, due_at, done_at, sort) VALUES (?, ?, ?, ?, NULL, ?)`,
    [id, project.id, name, dueAt, sortRow?.next ?? 0],
  );
  const row = await sql.get<MilestoneRow>(`SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE id = ?`, [id]);
  if (!row) return { ok: false, error: "missing" };
  return { ok: true, value: row };
}

export async function updateTask(
  sql: Sql,
  caller: Caller,
  input: { taskId: string; status: TaskStatus },
  now: number,
): Promise<{ ok: true } | { ok: false; error: CrmError }> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  if (!isTaskStatus(input.status)) return { ok: false, error: "invalid" };
  const task = await sql.get<TaskRow & { project_id: string | null }>(
    `SELECT ${TASK_COLUMNS}, project_id FROM tasks WHERE id = ?`,
    [input.taskId],
  );
  if (!task?.organization_id) return { ok: false, error: "missing" };
  if (!(await liveOrg(sql, caller, task.organization_id))) return { ok: false, error: "missing" };
  if (task.status === input.status) return { ok: true };
  const doneAt = input.status === "done" ? now : null;
  await sql.exec("BEGIN");
  try {
    await sql.run("UPDATE tasks SET status = ?, done_at = ?, updated_at = ? WHERE id = ?", [
      input.status,
      doneAt,
      now,
      task.id,
    ]);
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, project_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, ?, 'task_status', 'staff', ?, ?, ?)`,
      [crypto.randomUUID(), task.organization_id, task.project_id, actorId, `Moved to ${input.status}.`, now],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { ok: true };
}

export async function listWork(
  sql: Sql,
  caller: Caller,
  filter: { late?: boolean; thisWeek?: boolean; blocked?: boolean },
  now: number,
): Promise<WorkTask[]> {
  const actorId = staffUserId(caller);
  if (!actorId) return [];
  return sql.all<WorkTask>(
    `SELECT ${WORK_COLUMNS}
     ${WORK_JOINS}
     WHERE o.archived_at IS NULL
       AND t.status != 'done'
       AND (? = 0 OR t.due_at < ?)
       AND (? = 0 OR (t.due_at >= ? AND t.due_at <= ?))
       AND (? = 0 OR t.status = 'blocked')
     ORDER BY CASE WHEN t.assignee_user_id = ? THEN 0 ELSE 1 END,
              CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
              t.due_at,
              t.title`,
    [
      filter.late ? 1 : 0,
      now,
      filter.thisWeek ? 1 : 0,
      now,
      now + WEEK_MS,
      filter.blocked ? 1 : 0,
      actorId,
    ],
  );
}

const ACTIVE_PROJECT = `('planned', 'active', 'waiting_on_client')`;

export type BoardQuery = {
  organizationId?: string;
  projectId?: string;
  unassigned?: boolean;
  /** Client and studio boards hide open cards on paused, done, and cancelled projects. */
  hideInactiveProjects?: boolean;
};

/** One task list for the project board, the client board, and the studio board. */
export async function listBoard(sql: Sql, caller: Caller, query: BoardQuery): Promise<BoardCard[]> {
  if (!staffUserId(caller)) return [];
  const where = ["o.archived_at IS NULL"];
  const params: unknown[] = [];
  if (query.organizationId) {
    where.push("t.organization_id = ?");
    params.push(query.organizationId);
  }
  if (query.unassigned) {
    where.push("t.project_id IS NULL");
  } else if (query.projectId) {
    where.push("t.project_id = ?");
    params.push(query.projectId);
  } else if (query.hideInactiveProjects) {
    where.push(`(t.project_id IS NULL OR p.status IN ${ACTIVE_PROJECT})`);
  }
  return sql.all<BoardCard>(
    `SELECT ${BOARD_COLUMNS}
     ${BOARD_JOINS}
     WHERE ${where.join(" AND ")}
     ORDER BY t.position, t.created_at, t.id`,
    params,
  );
}

export async function openCloudRunCount(sql: Sql, caller: Caller): Promise<number> {
  if (!staffUserId(caller)) return 0;
  const row = await sql.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM cloud_runs WHERE status IN ('started', 'pr_open')",
  );
  return Number(row?.n ?? 0);
}

export async function boardClientChips(
  sql: Sql,
  caller: Caller,
): Promise<{ id: string; name: string; open: number }[]> {
  if (!staffUserId(caller)) return [];
  const rows = await sql.all<{ id: string; name: string; open: number }>(
    `SELECT o.id, o.name, COUNT(t.id) AS open
     FROM organizations o
     JOIN tasks t ON t.organization_id = o.id AND t.status != 'done'
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE o.archived_at IS NULL
       AND (t.project_id IS NULL OR p.status IN ${ACTIVE_PROJECT})
     GROUP BY o.id
     ORDER BY o.name`,
  );
  return rows.map((row) => ({ id: row.id, name: row.name, open: Number(row.open) }));
}

/** Recent agent notes, keyed later by the task id stored on the activity. */
export async function listBoardActivity(sql: Sql, caller: Caller, organizationIds: string[]): Promise<BoardActivity[]> {
  if (!staffUserId(caller) || organizationIds.length === 0) return [];
  const rows = await sql.all<{
    id: string;
    kind: string;
    body: string | null;
    created_at: number;
    data_json: string | null;
    run_task_id: string | null;
  }>(
    `SELECT a.id, a.kind, a.body, a.created_at, a.data_json, cr.task_id AS run_task_id
     FROM activities a
     LEFT JOIN cloud_runs cr ON cr.id = json_extract(a.data_json, '$.runId')
     WHERE a.kind LIKE 'agent.%' AND a.organization_id IN (${organizationIds.map(() => "?").join(", ")})
     ORDER BY a.created_at DESC
     LIMIT 300`,
    organizationIds,
  );
  return rows.flatMap((row) => {
    let taskId = row.run_task_id ?? "";
    try {
      const data = JSON.parse(row.data_json ?? "") as { taskId?: unknown };
      if (typeof data.taskId === "string") taskId = data.taskId;
    } catch {
      taskId = row.run_task_id ?? "";
    }
    if (!taskId) return [];
    return [{ id: row.id, taskId, kind: row.kind, body: row.body, createdAt: row.created_at }];
  });
}

/** Sidebar badges. Needs you is late or blocked work. Work is that same set. Leads are new deals from the last 7 days. */
export async function navCounts(
  sql: Sql,
  caller: Caller,
  now: Date,
): Promise<{ needsYou: number; leads: number; work: number }> {
  if (!staffUserId(caller)) return { needsYou: 0, leads: 0, work: 0 };
  const at = now.getTime();
  const row = await sql.get<{ needs_you: number; work: number; leads: number }>(
    `SELECT
       (SELECT count(*)
        FROM tasks t
        JOIN organizations o ON o.id = t.organization_id
        WHERE o.archived_at IS NULL
          AND t.status != 'done'
          AND (t.due_at < ? OR t.status = 'blocked')) AS needs_you,
       (SELECT count(*)
        FROM tasks t
        JOIN organizations o ON o.id = t.organization_id
        WHERE o.archived_at IS NULL
          AND t.status != 'done'
          AND (t.due_at < ? OR t.status = 'blocked')) AS work,
       (SELECT count(*)
        FROM deals d
        JOIN organizations o ON o.id = d.organization_id
        WHERE o.archived_at IS NULL
          AND d.stage = 'new'
          AND d.created_at >= ?) AS leads`,
    [at, at, at - WEEK_MS],
  );
  return {
    needsYou: Number(row?.needs_you ?? 0),
    work: Number(row?.work ?? 0),
    leads: Number(row?.leads ?? 0),
  };
}

export async function listStatusUpdates(
  sql: Sql,
  caller: Caller,
  projectId: string,
): Promise<StatusUpdateRow[]> {
  if (!staffUserId(caller) || !(await openProject(sql, projectId))) return [];
  return sql.all<StatusUpdateRow>(
    `SELECT ${STATUS_COLUMNS} FROM status_updates WHERE project_id = ? ORDER BY created_at DESC, id DESC`,
    [projectId],
  );
}

export async function postStatusUpdate(
  sql: Sql,
  caller: Caller,
  input: { projectId: string; body: string; health: StatusHealth; audience: StatusAudience; publish?: boolean },
  now: number,
): Promise<CrmResult<StatusUpdateRow>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const project = await openProject(sql, input.projectId);
  if (!project) return { ok: false, error: "missing" };
  const body = cleanText(input.body, 4000);
  if (!body || !isHealth(input.health) || !isAudience(input.audience)) return { ok: false, error: "invalid" };
  const publish = input.publish === true;
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO status_updates (
       id, project_id, organization_id, health, audience, body, state, emailed_at,
       actor_kind, actor_id, created_at, published_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'staff', ?, ?, ?)`,
    [
      id,
      project.id,
      project.organization_id,
      input.health,
      input.audience,
      body,
      publish ? "published" : "draft",
      actorId,
      now,
      publish ? now : null,
    ],
  );
  const row = await sql.get<StatusUpdateRow>(`SELECT ${STATUS_COLUMNS} FROM status_updates WHERE id = ?`, [id]);
  if (!row) return { ok: false, error: "missing" };
  return { ok: true, value: row };
}

export async function publishStatusUpdate(
  sql: Sql,
  caller: Caller,
  input: { id: string },
  now: number,
): Promise<CrmResult<StatusUpdateRow>> {
  if (!staffUserId(caller)) return { ok: false, error: "forbidden" };
  const current = await sql.get<StatusUpdateRow>(`SELECT ${STATUS_COLUMNS} FROM status_updates WHERE id = ?`, [
    input.id,
  ]);
  if (!current) return { ok: false, error: "missing" };
  const project = await openProject(sql, current.project_id);
  if (!project) return { ok: false, error: "missing" };
  if (current.state === "published") return { ok: true, value: current };
  await sql.run("UPDATE status_updates SET state = 'published', published_at = ? WHERE id = ? AND state = 'draft'", [
    now,
    current.id,
  ]);
  const row = await sql.get<StatusUpdateRow>(`SELECT ${STATUS_COLUMNS} FROM status_updates WHERE id = ?`, [
    current.id,
  ]);
  if (!row) return { ok: false, error: "missing" };
  return { ok: true, value: row };
}

const EMPTY_TODAY: TodayBoard = {
  newLeads: [],
  calls: [],
  tasks: [],
  stalledDeals: [],
  waitingSpaces: [],
  invoices: [],
  agentNotes: [],
  agentActivity: [],
  workRequests: [],
};

export async function todayFor(sql: Sql, caller: Caller, now: number): Promise<TodayBoard> {
  const actorId = staffUserId(caller);
  if (!actorId) return EMPTY_TODAY;
  const weekEnd = now + WEEK_MS;
  const [newLeads, calls, tasks, stalledDeals, waitingSpaces, invoices, workRequests, agentNotes, agentActivity] = await Promise.all([
    sql.all<{ id: string; title: string; organization_id: string; organization_name: string }>(
      `SELECT d.id, d.title, d.organization_id, o.name AS organization_name
       FROM deals d
       JOIN organizations o ON o.id = d.organization_id
       WHERE o.archived_at IS NULL AND d.stage = 'new'
       ORDER BY d.updated_at DESC, d.title`,
    ),
    sql.all<{ id: string; organization_id: string; organization_name: string; starts_at: number }>(
      `SELECT a.id, a.organization_id, o.name AS organization_name, a.starts_at
       FROM appointments a
       JOIN organizations o ON o.id = a.organization_id
       WHERE o.archived_at IS NULL
         AND a.status IN ('booked', 'rescheduled')
         AND a.starts_at >= ? AND a.starts_at <= ?
       ORDER BY a.starts_at`,
      [now, weekEnd],
    ),
    sql.all<WorkTask>(
      `SELECT ${WORK_COLUMNS}
       ${WORK_JOINS}
       WHERE o.archived_at IS NULL
         AND t.status != 'done'
         AND (
           (t.due_at IS NOT NULL AND t.due_at <= ?)
           OR (t.due_at IS NULL AND t.created_at >= ? AND t.created_at <= ?)
         )
       ORDER BY CASE WHEN t.assignee_user_id = ? THEN 0 ELSE 1 END,
                CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
                t.due_at, t.title`,
      [weekEnd, now - WEEK_MS, now, actorId],
    ),
    sql.all<{
      id: string;
      title: string;
      organization_id: string;
      organization_name: string;
      next_step: string | null;
      next_step_at: number | null;
    }>(
      `SELECT d.id, d.title, d.organization_id, o.name AS organization_name, d.next_step, d.next_step_at
       FROM deals d
       JOIN organizations o ON o.id = d.organization_id
       WHERE o.archived_at IS NULL
         AND d.stage NOT IN ('won', 'lost')
         AND (d.next_step IS NULL OR d.next_step_at IS NULL OR d.next_step_at < ?)
       ORDER BY d.updated_at DESC, d.title`,
      [now],
    ),
    sql.all<{ id: string; slug: string; display_name: string; request_title: string }>(
      `SELECT w.id, w.slug, w.display_name, r.title AS request_title
       FROM requests r
       JOIN workspaces w ON w.id = r.workspace_id
       WHERE r.status = 'open' AND w.organization_id IS NOT NULL AND w.status != 'purged'
       ORDER BY w.display_name, r.title`,
    ),
    sql.all<{ id: string; number: string; organization_name: string; due_at: number }>(
      `SELECT i.id, i.number, o.name AS organization_name, i.due_at
       FROM invoices i
       JOIN organizations o ON o.id = i.organization_id
       WHERE o.archived_at IS NULL
         AND i.status IN ('sent', 'partly_paid')
         AND i.due_at IS NOT NULL
         AND i.due_at <= ?
       ORDER BY i.due_at`,
      [weekEnd],
    ),
    sql.all<{ id: string; organization_id: string; organization_name: string; body: string; channel: string }>(
      `SELECT w.id, w.organization_id, o.name AS organization_name, w.body, w.channel
       FROM work_requests w
       JOIN organizations o ON o.id = w.organization_id
       WHERE o.archived_at IS NULL AND w.state = 'proposed'
       ORDER BY w.updated_at DESC`,
    ),
    sql.all<{
      id: string;
      body: string | null;
      created_at: number;
      organization_id: string | null;
      organization_name: string | null;
    }>(
      `SELECT a.id, a.body, a.created_at, a.organization_id, o.name AS organization_name
       FROM activities a
       LEFT JOIN organizations o ON o.id = a.organization_id
       WHERE a.actor_kind = 'agent' AND a.kind NOT IN ('agent.swarm_run') AND a.created_at >= ?
       ORDER BY a.created_at DESC`,
      [now - WEEK_MS],
    ),
    sql.all<{
      id: string;
      kind: string;
      body: string | null;
      data_json: string | null;
      created_at: number;
      organization_id: string | null;
      organization_name: string | null;
    }>(
      `SELECT a.id, a.kind, a.body, a.data_json, a.created_at, a.organization_id, o.name AS organization_name
       FROM activities a
       LEFT JOIN organizations o ON o.id = a.organization_id
       WHERE a.kind IN ('schema.scan', 'agent.swarm_run', 'agent.wake_failed') AND a.created_at >= ?
       ORDER BY a.created_at DESC
       LIMIT 40`,
      [now - WEEK_MS],
    ),
  ]);
  return {
    newLeads: newLeads.map((row) => ({
      id: row.id,
      title: row.title,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
    })),
    calls: calls.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      startsAt: row.starts_at,
    })),
    tasks,
    stalledDeals: stalledDeals.map((row) => ({
      id: row.id,
      title: row.title,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      nextStep: row.next_step,
      nextStepAt: row.next_step_at,
    })),
    waitingSpaces: waitingSpaces.map((row) => ({
      id: row.id,
      slug: row.slug,
      displayName: row.display_name,
      requestTitle: row.request_title,
    })),
    invoices: invoices.map((row) => ({
      id: row.id,
      number: row.number,
      organizationName: row.organization_name,
      dueAt: row.due_at,
    })),
    agentNotes: agentNotes.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      organizationId: row.organization_id,
      organizationName: row.organization_name ?? "",
    })),
    agentActivity: agentActivity.map((row) => {
      const links = activityLinks(row.data_json);
      return {
        id: row.id,
        kind: row.kind,
        body: row.body,
        status: runStatus(row.data_json),
        createdAt: row.created_at,
        organizationId: row.organization_id,
        organizationName: row.organization_name ?? "",
        reportUrl: links.reportUrl,
        artifacts: links.artifacts,
      };
    }),
    workRequests: workRequests.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      body: row.body,
      channel: row.channel,
    })),
  };
}

export async function listTimeline(
  sql: Sql,
  caller: Caller,
  organizationId: string,
  limit: number,
  offset = 0,
): Promise<ActivityRow[]> {
  if (!(await liveOrg(sql, caller, organizationId))) return [];
  const size = Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 20;
  const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
  return sql.all<ActivityRow>(
    `SELECT id, kind, body, actor_kind, created_at FROM activities
     WHERE organization_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [organizationId, size, start],
  );
}

const MERGE_TABLES = [
  "contacts",
  "deals",
  "assessments",
  "appointments",
  "projects",
  "tasks",
  "activities",
  "invoices",
  "payments",
  "status_updates",
  "repos",
  "deliverables",
  "github_installations",
  "workspaces",
] as const;

export async function mergeOrganizations(
  sql: Sql,
  caller: Caller,
  input: { keepId: string; dropId: string },
  now: number,
): Promise<{ ok: true } | { ok: false; error: CrmError }> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  if (input.keepId === input.dropId) return { ok: false, error: "invalid" };
  const keep = await organizationById(sql, caller, input.keepId);
  const drop = await organizationById(sql, caller, input.dropId);
  if (!keep || !drop) return { ok: false, error: "missing" };
  await sql.exec("BEGIN");
  try {
    const keepPrimary = await sql.get<{ id: string }>(
      "SELECT id FROM contacts WHERE organization_id = ? AND is_primary = 1",
      [keep.id],
    );
    if (keepPrimary) {
      await sql.run("UPDATE contacts SET is_primary = 0 WHERE organization_id = ?", [drop.id]);
    }
    if (drop.domain) {
      if (!keep.domain) {
        await sql.run("UPDATE organizations SET domain = NULL WHERE id = ?", [drop.id]);
        await sql.run(
          "UPDATE organizations SET domain = ?, website = COALESCE(website, ?) WHERE id = ?",
          [drop.domain, drop.website, keep.id],
        );
      } else {
        await sql.run("UPDATE organizations SET domain = NULL WHERE id = ?", [drop.id]);
      }
    }
    for (const table of MERGE_TABLES) {
      await sql.run(`UPDATE ${table} SET organization_id = ? WHERE organization_id = ?`, [keep.id, drop.id]);
    }
    await sql.run("UPDATE organizations SET archived_at = ?, updated_at = ? WHERE id = ?", [now, now, drop.id]);
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, 'note', 'staff', ?, ?, ?)`,
      [crypto.randomUUID(), keep.id, actorId, `Merged ${drop.name}.`, now],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { ok: true };
}

async function recordSpaceActivity(
  sql: Sql,
  input: { workspaceId: string; kind: "file_uploaded" | "request_done"; marker: string; body: string; actorId: string | null; now: number },
): Promise<void> {
  const space = await sql.get<{ organization_id: string | null }>(
    "SELECT organization_id FROM workspaces WHERE id = ?",
    [input.workspaceId],
  );
  if (!space?.organization_id) return;
  const dataJson = JSON.stringify({ id: input.marker });
  const existing = await sql.get<{ id: string }>(
    "SELECT id FROM activities WHERE organization_id = ? AND kind = ? AND data_json = ?",
    [space.organization_id, input.kind, dataJson],
  );
  if (existing) return;
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, ?, ?, 'system', ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      space.organization_id,
      input.workspaceId,
      input.kind,
      input.actorId,
      input.body,
      dataJson,
      input.now,
    ],
  );
}

/** A finished upload on a linked space. Safe to call twice. Does not open its own transaction. */
export function recordFileUploaded(
  sql: Sql,
  input: { workspaceId: string; fileId: string; relativePath: string; actorId: string | null; now: number },
): Promise<void> {
  const body = input.relativePath.trim() || "A file";
  return recordSpaceActivity(sql, {
    workspaceId: input.workspaceId,
    kind: "file_uploaded",
    marker: `file:${input.fileId}`,
    body,
    actorId: input.actorId,
    now: input.now,
  });
}

export const DEAL_STAGES = ["new", "contacted", "call_booked", "proposal", "won", "lost"] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

const DEAL_STAGE_SET = new Set<string>(DEAL_STAGES);

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  new: "New",
  contacted: "Contacted",
  call_booked: "Call booked",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export type DealCard = {
  id: string;
  organization_id: string;
  organization_name: string;
  title: string;
  stage: DealStage;
  source: string;
  next_step: string | null;
  next_step_at: number | null;
  owner_user_id: string | null;
  score: number | null;
  last_touch: number | null;
};

export type DealMove = {
  id: string;
  stage: DealStage;
  organizationId: string;
  projectId: string | null;
  workspaceId: string | null;
};

/** Web address piece for a new space. Letters and numbers only. */
export function slugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "client";
}

function dealStageOf(value: string): DealStage | null {
  return DEAL_STAGE_SET.has(value) ? (value as DealStage) : null;
}

export async function listDeals(sql: Sql, caller: Caller, filter: {
  stage?: string;
  source?: string;
  ownerUserId?: string;
  organizationId?: string;
} = {}): Promise<DealCard[]> {
  if (!staffUserId(caller)) return [];
  const where = ["o.archived_at IS NULL"];
  const params: unknown[] = [];
  if (filter.stage) {
    const stage = dealStageOf(filter.stage);
    if (!stage) return [];
    where.push("d.stage = ?");
    params.push(stage);
  }
  const source = filter.source?.trim() ?? "";
  if (source.length > 0) {
    where.push("d.source = ?");
    params.push(source);
  }
  if (filter.ownerUserId) {
    where.push("d.owner_user_id = ?");
    params.push(filter.ownerUserId);
  }
  if (filter.organizationId) {
    where.push("d.organization_id = ?");
    params.push(filter.organizationId);
  }
  return sql.all<DealCard>(
    `SELECT d.id, d.organization_id, o.name AS organization_name, d.title, d.stage, d.source,
            d.next_step, d.next_step_at, d.owner_user_id,
            (
              SELECT total_score FROM assessments
              WHERE deal_id = d.id
              ORDER BY completed_at DESC
              LIMIT 1
            ) AS score,
            (
              SELECT MAX(created_at) FROM activities
              WHERE organization_id = d.organization_id
            ) AS last_touch
     FROM deals d
     JOIN organizations o ON o.id = d.organization_id
     WHERE ${where.join(" AND ")}
     ORDER BY d.updated_at DESC, o.name`,
    params,
  );
}

async function openSlug(sql: Sql, base: string): Promise<string> {
  let candidate = base;
  for (let n = 2; n < 50; n += 1) {
    const taken = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE slug = ?", [candidate]);
    if (!taken) return candidate;
    candidate = `${base}-${n}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Move a deal. Won turns a lead into a client, then a project, then a space when they have none. */
export async function moveDealStage(
  sql: Sql,
  caller: Caller,
  input: { dealId: string; stage: string; lostReason?: string },
  now: number,
): Promise<CrmResult<DealMove>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const deal = await sql.get<{
    id: string;
    organization_id: string;
    title: string;
    stage: string;
    owner_user_id: string | null;
    kind: OrgKind;
    name: string;
  }>(
    `SELECT d.id, d.organization_id, d.title, d.stage, d.owner_user_id, o.kind, o.name
     FROM deals d
     JOIN organizations o ON o.id = d.organization_id
     WHERE d.id = ? AND o.archived_at IS NULL`,
    [input.dealId],
  );
  if (!deal) return { ok: false, error: "missing" };
  const stage = dealStageOf(input.stage);
  if (!stage) return { ok: false, error: "invalid" };
  const reason = (input.lostReason ?? "").trim();
  if (stage === "lost" && deal.stage !== "lost" && (reason.length < 1 || reason.length > 500)) {
    return { ok: false, error: "invalid" };
  }
  const project = await sql.get<{ id: string }>("SELECT id FROM projects WHERE deal_id = ?", [deal.id]);
  const spaces = await sql.all<{ id: string; project_id: string | null }>(
    `SELECT id, project_id FROM workspaces
     WHERE organization_id = ? AND status != 'purged'
     ORDER BY opened_at`,
    [deal.organization_id],
  );
  if (deal.stage === stage) {
    return {
      ok: true,
      value: {
        id: deal.id,
        stage,
        organizationId: deal.organization_id,
        projectId: project?.id ?? null,
        workspaceId: spaces[0]?.id ?? null,
      },
    };
  }

  const winning = stage === "won";
  const projectId = winning ? (project?.id ?? crypto.randomUUID()) : (project?.id ?? null);
  const creatingProject = winning && !project;
  const creatingSpace = winning && spaces.length === 0;
  const workspaceId = creatingSpace ? crypto.randomUUID() : (spaces.length === 1 ? spaces[0].id : (spaces[0]?.id ?? null));
  const slug = creatingSpace ? await openSlug(sql, slugFromName(deal.name)) : null;
  const linkProject = winning && spaces.length === 1 && spaces[0].project_id == null;
  const closedAt = stage === "won" || stage === "lost" ? now : null;
  const lostReason = stage === "lost" ? reason : null;

  try {
    await sql.exec("BEGIN");
    await sql.run(
      "UPDATE deals SET stage = ?, updated_at = ?, closed_at = ?, lost_reason = ? WHERE id = ?",
      [stage, now, closedAt, lostReason, deal.id],
    );
    if (winning && (deal.kind === "lead" || deal.kind === "past_client")) {
      await sql.run("UPDATE organizations SET kind = 'client', updated_at = ? WHERE id = ?", [
        now,
        deal.organization_id,
      ]);
    }
    if (creatingProject && projectId) {
      await sql.run(
        `INSERT INTO projects (
           id, organization_id, deal_id, name, status, owner_user_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'planned', ?, ?, ?)`,
        [projectId, deal.organization_id, deal.id, deal.title, deal.owner_user_id ?? actorId, now, now],
      );
    }
    if (creatingSpace && workspaceId && slug && projectId) {
      await sql.run(
        `INSERT INTO workspaces (
           id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
           quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id
         ) VALUES (?, ?, ?, ?, NULL, ?, 'standard', ?, ?, 0, 'active', ?, ?, ?)`,
        [
          workspaceId,
          slug,
          deal.name,
          deal.name,
          deal.name,
          LIMITS.defaultQuotaBytes,
          LIMITS.defaultRetentionDays,
          now,
          deal.organization_id,
          projectId,
        ],
      );
      await sql.run(
        `INSERT INTO requests (
           id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
         ) VALUES (?, ?, 1, 'Files', NULL, 'other', NULL, 'open', NULL, NULL)`,
        [crypto.randomUUID(), workspaceId],
      );
      await sql.run(
        `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [crypto.randomUUID(), workspaceId, actorId, actorId, now],
      );
    }
    if (linkProject && projectId) {
      await sql.run("UPDATE workspaces SET project_id = ? WHERE id = ? AND project_id IS NULL", [
        projectId,
        spaces[0].id,
      ]);
    }
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, deal_id, project_id, workspace_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, ?, ?, ?, 'stage_change', 'staff', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        deal.organization_id,
        deal.id,
        projectId,
        workspaceId,
        actorId,
        `Moved from ${deal.stage} to ${stage}.`,
        now,
      ],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    value: {
      id: deal.id,
      stage,
      organizationId: deal.organization_id,
      projectId,
      workspaceId,
    },
  };
}

const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type LinkedRepo = {
  id: string;
  github_repo_id: number;
  installation_id: number | null;
  full_name: string;
  organization_id: string;
  project_id: string | null;
  default_branch: string | null;
  is_private: number;
  suspended_at: number | null;
};

export type RepoActivitySummary = {
  openPullRequests: { number: number; title: string; url: string }[];
  lastPush: { at: number; url: string; author: string } | null;
  latestRelease: { at: number; title: string; url: string } | null;
};

export function cleanRepoName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length > 200 || !REPO_NAME.test(trimmed)) return null;
  return trimmed;
}

const REPO_COLUMNS = `r.id, r.github_repo_id, r.installation_id, r.full_name, r.organization_id,
  r.project_id, r.default_branch, r.is_private, i.suspended_at`;

function repoSelect(where: string): string {
  return `SELECT ${REPO_COLUMNS}
    FROM repos r
    LEFT JOIN github_installations i ON i.id = r.installation_id
    WHERE ${where}
    ORDER BY r.full_name`;
}

export async function listRepos(sql: Sql, caller: Caller, organizationId: string): Promise<LinkedRepo[]> {
  if (!(await liveOrg(sql, caller, organizationId))) return [];
  return sql.all<LinkedRepo>(repoSelect("r.organization_id = ? AND r.archived_at IS NULL"), [organizationId]);
}

export async function listProjectRepos(sql: Sql, caller: Caller, projectId: string): Promise<LinkedRepo[]> {
  if (!staffUserId(caller)) return [];
  const project = await openProject(sql, projectId);
  if (!project) return [];
  return sql.all<LinkedRepo>(
    repoSelect("r.project_id = ? AND r.organization_id = ? AND r.archived_at IS NULL"),
    [projectId, project.organization_id],
  );
}

type RepoLinkInput = {
  organizationId: string;
  githubRepoId: number;
  installationId: number;
  fullName: string;
  defaultBranch: string | null;
  isPrivate: boolean;
};

/** Link a repo the app can see. An active repo on another client is refused. */
export async function linkRepo(
  sql: Sql,
  caller: Caller,
  input: RepoLinkInput,
  now: number,
): Promise<CrmResult<{ id: string }>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  if (!(await liveOrg(sql, caller, input.organizationId))) return { ok: false, error: "missing" };
  const fullName = cleanRepoName(input.fullName);
  if (!fullName || !Number.isInteger(input.githubRepoId) || input.githubRepoId <= 0) {
    return { ok: false, error: "invalid" };
  }
  if (!Number.isInteger(input.installationId) || input.installationId <= 0) return { ok: false, error: "invalid" };
  const branch = input.defaultBranch?.trim() ? input.defaultBranch.trim().slice(0, 200) : null;
  const isPrivate = input.isPrivate ? 1 : 0;
  await sql.exec("BEGIN");
  try {
    const existing = await sql.get<{ id: string; organization_id: string; archived_at: number | null }>(
      "SELECT id, organization_id, archived_at FROM repos WHERE github_repo_id = ?",
      [input.githubRepoId],
    );
    if (existing && existing.archived_at == null && existing.organization_id !== input.organizationId) {
      await sql.exec("ROLLBACK");
      return { ok: false, error: "taken" };
    }
    const sole = await soleProjectId(sql, input.organizationId);
    if (existing && existing.archived_at == null) {
      await sql.run(
        `UPDATE repos
         SET installation_id = ?, full_name = ?, default_branch = ?, is_private = ?, linked_by = ?,
             project_id = COALESCE(project_id, ?)
         WHERE id = ?`,
        [input.installationId, fullName, branch, isPrivate, actorId, sole, existing.id],
      );
      await sql.exec("COMMIT");
      return { ok: true, value: { id: existing.id } };
    }
    if (existing) {
      await sql.run(
        `UPDATE repos
         SET organization_id = ?, installation_id = ?, full_name = ?, default_branch = ?,
             is_private = ?, linked_by = ?, archived_at = NULL,
             project_id = CASE WHEN organization_id = ? THEN project_id ELSE NULL END
         WHERE id = ?`,
        [
          input.organizationId,
          input.installationId,
          fullName,
          branch,
          isPrivate,
          actorId,
          input.organizationId,
          existing.id,
        ],
      );
      if (sole) {
        await sql.run("UPDATE repos SET project_id = COALESCE(project_id, ?) WHERE id = ?", [sole, existing.id]);
      }
      await sql.exec("COMMIT");
      return { ok: true, value: { id: existing.id } };
    }
    const id = crypto.randomUUID();
    await sql.run(
      `INSERT INTO repos (
         id, github_repo_id, installation_id, full_name, organization_id, project_id, default_branch,
         is_private, owned_by, linked_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agency', ?, ?)`,
      [id, input.githubRepoId, input.installationId, fullName, input.organizationId, sole, branch, isPrivate, actorId, now],
    );
    await sql.exec("COMMIT");
    return { ok: true, value: { id } };
  } catch (error) {
    await sql.exec("ROLLBACK");
    if (isUnique(error)) return { ok: false, error: "taken" };
    throw error;
  }
}

export async function unlinkRepo(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; repoId: string },
  now: number,
): Promise<CrmResult<{ id: string }>> {
  if (!staffUserId(caller)) return { ok: false, error: "forbidden" };
  if (!(await liveOrg(sql, caller, input.organizationId))) return { ok: false, error: "missing" };
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM repos WHERE id = ? AND organization_id = ? AND archived_at IS NULL",
    [input.repoId, input.organizationId],
  );
  if (!row) return { ok: false, error: "missing" };
  await sql.run("UPDATE repos SET archived_at = ? WHERE id = ?", [now, row.id]);
  return { ok: true, value: { id: row.id } };
}

/** Point one of this client's spaces at one of this client's projects. */
export async function assignSpaceProject(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; workspaceId: string; projectId: string | null },
  now: number,
): Promise<CrmResult<{ id: string }>> {
  void now;
  if (!staffUserId(caller)) return { ok: false, error: "forbidden" };
  if (!(await liveOrg(sql, caller, input.organizationId))) return { ok: false, error: "missing" };
  const space = await sql.get<{ id: string }>(
    "SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND status != 'purged'",
    [input.workspaceId, input.organizationId],
  );
  if (!space) return { ok: false, error: "missing" };
  if (input.projectId) {
    const project = await openProject(sql, input.projectId);
    if (!project || project.organization_id !== input.organizationId) return { ok: false, error: "invalid" };
  }
  await sql.run("UPDATE workspaces SET project_id = ? WHERE id = ?", [input.projectId, space.id]);
  return { ok: true, value: { id: space.id } };
}

export async function assignRepoProject(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; repoId: string; projectId: string | null },
  now: number,
): Promise<CrmResult<{ id: string }>> {
  void now;
  if (!staffUserId(caller)) return { ok: false, error: "forbidden" };
  if (!(await liveOrg(sql, caller, input.organizationId))) return { ok: false, error: "missing" };
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM repos WHERE id = ? AND organization_id = ? AND archived_at IS NULL",
    [input.repoId, input.organizationId],
  );
  if (!row) return { ok: false, error: "missing" };
  if (input.projectId) {
    const project = await openProject(sql, input.projectId);
    if (!project || project.organization_id !== input.organizationId) return { ok: false, error: "invalid" };
  }
  await sql.run("UPDATE repos SET project_id = ? WHERE id = ?", [input.projectId, row.id]);
  return { ok: true, value: { id: row.id } };
}

async function soleProjectId(sql: Sql, organizationId: string): Promise<string | null> {
  const rows = await sql.all<{ id: string }>("SELECT id FROM projects WHERE organization_id = ?", [organizationId]);
  return rows.length === 1 ? (rows[0]?.id ?? null) : null;
}

function activityData(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Open pull requests, the last push, and the latest release for one linked repo. */
export async function repoActivitySummary(
  sql: Sql,
  caller: Caller,
  repoId: string,
): Promise<RepoActivitySummary | null> {
  if (!staffUserId(caller)) return null;
  const repo = await sql.get<{ organization_id: string; full_name: string }>(
    "SELECT organization_id, full_name FROM repos WHERE id = ? AND archived_at IS NULL",
    [repoId],
  );
  if (!repo || !(await liveOrg(sql, caller, repo.organization_id))) return null;
  const rows = await sql.all<{ kind: string; data_json: string | null; created_at: number }>(
    `SELECT kind, data_json, created_at FROM activities
     WHERE organization_id = ? AND kind IN ('pr_opened', 'pr_merged', 'push', 'release')
     ORDER BY created_at, kind`,
    [repo.organization_id],
  );
  const open = new Map<number, { number: number; title: string; url: string }>();
  let lastPush: RepoActivitySummary["lastPush"] = null;
  let latestRelease: RepoActivitySummary["latestRelease"] = null;
  for (const row of rows) {
    const data = activityData(row.data_json);
    if (!data || data.repo !== repo.full_name) continue;
    if (row.kind === "pr_opened" && typeof data.number === "number") {
      open.set(data.number, {
        number: data.number,
        title: typeof data.title === "string" ? data.title : "Untitled",
        url: typeof data.url === "string" ? data.url : "",
      });
    }
    if (row.kind === "pr_merged" && typeof data.number === "number") open.delete(data.number);
    if (row.kind === "push") {
      lastPush = {
        at: row.created_at,
        url: typeof data.url === "string" ? data.url : "",
        author: typeof data.author === "string" ? data.author : "",
      };
    }
    if (row.kind === "release") {
      latestRelease = {
        at: row.created_at,
        title: typeof data.title === "string" ? data.title : "Release",
        url: typeof data.url === "string" ? data.url : "",
      };
    }
  }
  return {
    openPullRequests: [...open.values()],
    lastPush,
    latestRelease,
  };
}

/** A draft invoice for newly approved client work. Staff set the price before it is sent. A repeat of the same source returns the first one. */
export async function createDraftInvoice(
  sql: Sql,
  input: { organizationId: string; description: string; sourceId: string; createdBy: string },
  now: number,
): Promise<{ id: string; number: string }> {
  const existing = await sql.get<{ id: string; number: string }>(
    "SELECT id, number FROM invoices WHERE external_id = ?",
    [input.sourceId],
  );
  if (existing) return existing;
  const year = new Date(now).getUTCFullYear();
  await sql.run(
    `INSERT INTO invoice_counters (year, last_number) VALUES (?, 1)
     ON CONFLICT(year) DO UPDATE SET last_number = last_number + 1`,
    [year],
  );
  const counter = await sql.get<{ last_number: number }>("SELECT last_number FROM invoice_counters WHERE year = ?", [year]);
  const number = `INV-${year}-${String(counter?.last_number ?? 1).padStart(4, "0")}`;
  const id = crypto.randomUUID();
  const description = input.description.trim().slice(0, 200) || "Approved client work";
  await sql.run(
    `INSERT INTO invoices (
      id, number, organization_id, project_id, contact_id, status, currency,
      subtotal_cents, tax_rate_bp, tax_cents, total_cents, paid_cents,
      issued_at, due_at, sent_at, paid_at, pdf_r2_key, external_id, memo, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, NULL, NULL, 'draft', 'usd',
      0, 0, 0, 0, 0,
      NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?
    )`,
    [id, number, input.organizationId, input.sourceId, "Quote for approved client work. Set the price before sending.", input.createdBy, now, now],
  );
  await sql.run(
    `INSERT INTO invoice_items (id, invoice_id, milestone_id, description, quantity, unit_cents, amount_cents, sort)
     VALUES (?, ?, NULL, ?, 1, 0, 0, 0)`,
    [crypto.randomUUID(), id, description],
  );
  return { id, number };
}

/** A request that just moved to received, on a linked space. Safe to call twice. */
export function recordRequestDone(
  sql: Sql,
  input: { workspaceId: string; requestId: string; title: string; now: number },
): Promise<void> {
  const body = input.title.trim() || "A request";
  return recordSpaceActivity(sql, {
    workspaceId: input.workspaceId,
    kind: "request_done",
    marker: `request:${input.requestId}`,
    body,
    actorId: null,
    now: input.now,
  });
}
