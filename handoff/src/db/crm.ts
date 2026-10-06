import type { Caller } from "@/lib/authz";
import { LIMITS } from "@/lib/policy/limits";
import type { Sql } from "./sql";

export type OrgKind = "lead" | "client" | "past_client" | "partner";

export type Organization = {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
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

export type TaskRow = {
  id: string;
  organization_id: string;
  title: string;
  status: "todo" | "doing" | "blocked" | "done";
  due_at: number | null;
  done_at: number | null;
};

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

const ORG_COLUMNS = "id, name, domain, website, kind, created_at, updated_at";

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
  input: { organizationId: string; kind: "note" | "call" | "task"; body: string; contactId?: string },
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
         id, organization_id, contact_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, ?, ?, 'staff', ?, ?, ?)`,
      [id, input.organizationId, input.contactId ?? null, input.kind, actorId, body, now],
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
  input: { organizationId: string; body: string; contactId?: string },
  now: number,
): Promise<CrmResult<{ id: string }>> {
  return writeStaffActivity(sql, caller, { ...input, kind: "note" }, now);
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
  input: { organizationId: string; title: string; dueAt?: number | null },
  now: number,
): Promise<CrmResult<TaskRow>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  if (!(await liveOrg(sql, caller, input.organizationId))) return { ok: false, error: "missing" };
  const title = cleanText(input.title, 200);
  if (!title) return { ok: false, error: "invalid" };
  const dueAt = input.dueAt ?? null;
  if (dueAt !== null && !Number.isInteger(dueAt)) return { ok: false, error: "invalid" };
  const id = crypto.randomUUID();
  await sql.exec("BEGIN");
  try {
    await sql.run(
      `INSERT INTO tasks (
         id, organization_id, title, status, due_at, created_at, updated_at, done_at
       ) VALUES (?, ?, ?, 'todo', ?, ?, ?, NULL)`,
      [id, input.organizationId, title, dueAt, now, now],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, 'task', 'staff', ?, ?, ?)`,
      [crypto.randomUUID(), input.organizationId, actorId, title, now],
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
