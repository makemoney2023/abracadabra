import type { Sql } from "@/db/sql";
import { can, type Caller } from "@/lib/authz";
import { isFileTag, LIMITS, type FileTag } from "@/lib/policy/limits";
import { REFUSED, type StoreResult } from "@/lib/store/result";

const GUIDANCE_LIMIT = "Guidance is at most 2,000 characters.";
const INACTIVE = "That workspace is no longer active.";

export type RequestStatus = "open" | "received" | "closed";

export type RequestRecord = {
  id: string;
  workspace_id: string;
  position: number;
  title: string;
  guidance: string | null;
  suggested_tag: string | null;
  due_on: number | null;
  status: RequestStatus;
  received_at: number | null;
  closed_at: number | null;
};

export type TemplateItemRecord = {
  id: string;
  template_id: string;
  position: number;
  title: string;
  guidance: string | null;
  suggested_tag: string | null;
};

export type TemplateCatalog = {
  id: string;
  name: string;
  items: TemplateItemRecord[];
};

type ItemFields = {
  title: string;
  guidance: string | null;
  suggestedTag: string | null;
};

async function liveStaff(sql: Sql, caller: Caller): Promise<boolean> {
  if (!caller.userId || !caller.staff) return false;
  const row = await sql.get<{ ok: number }>(
    "SELECT 1 AS ok FROM staff WHERE user_id = ? AND revoked_at IS NULL",
    [caller.userId],
  );
  return row?.ok === 1;
}

async function liveRequestGrant(sql: Sql, caller: Caller, workspaceId: string): Promise<boolean> {
  if (!caller.userId || !can(caller, "request.manage", { workspaceId })) return false;
  if (caller.staff?.superAdmin) {
    const row = await sql.get<{ ok: number }>(
      "SELECT 1 AS ok FROM staff WHERE user_id = ? AND is_super_admin = 1 AND revoked_at IS NULL",
      [caller.userId],
    );
    if (row?.ok === 1) return true;
  }
  const row = await sql.get<{ ok: number }>(
    `SELECT 1 AS ok FROM staff s
     JOIN workspace_operators o ON o.user_id = s.user_id
     WHERE s.user_id = ? AND s.revoked_at IS NULL AND o.workspace_id = ? AND o.removed_at IS NULL`,
    [caller.userId, workspaceId],
  );
  return row?.ok === 1;
}

function titleOf(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function guidanceOf(value: string | null): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value.trim().length === 0) return { ok: true, value: null };
  const trimmed = value.trim();
  if (trimmed.length > LIMITS.maxGuidanceChars) return { ok: false };
  return { ok: true, value: trimmed };
}

function tagOf(value: string | null): FileTag | null | undefined {
  if (value === null || value.trim().length === 0) return null;
  const trimmed = value.trim();
  return isFileTag(trimmed) ? trimmed : undefined;
}

function dueOf(value: number | null): number | null | undefined {
  if (value === null) return null;
  if (!Number.isInteger(value)) return undefined;
  return value;
}

function fieldsOf(input: ItemFields): StoreResult<{ title: string; guidance: string | null; tag: string | null }> {
  const title = titleOf(input.title);
  const guidance = guidanceOf(input.guidance);
  if (!guidance.ok) return { ok: false, message: GUIDANCE_LIMIT };
  const tag = tagOf(input.suggestedTag);
  if (!title || tag === undefined) return { ok: false, message: REFUSED };
  return { ok: true, value: { title, guidance: guidance.value, tag } };
}

async function liveTemplate(sql: Sql, templateId: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM request_templates WHERE id = ? AND retired_at IS NULL",
    [templateId],
  );
  return row !== undefined;
}

export async function createTemplate(input: {
  sql: Sql;
  caller: Caller;
  now: number;
  name: string;
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveStaff(input.sql, input.caller))) return { ok: false, message: REFUSED };
  const name = titleOf(input.name);
  if (!name || !input.caller.userId) return { ok: false, message: REFUSED };
  const id = crypto.randomUUID();
  await input.sql.run(
    `INSERT INTO request_templates (id, name, created_by, created_at, retired_at)
     VALUES (?, ?, ?, ?, NULL)`,
    [id, name, input.caller.userId, input.now],
  );
  return { ok: true, value: { id } };
}

export async function addTemplateItem(input: {
  sql: Sql;
  caller: Caller;
  templateId: string;
  title: string;
  guidance: string | null;
  suggestedTag: string | null;
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveStaff(input.sql, input.caller))) return { ok: false, message: REFUSED };
  if (!(await liveTemplate(input.sql, input.templateId))) return { ok: false, message: REFUSED };
  const fields = fieldsOf(input);
  if (!fields.ok) return fields;
  const max = await input.sql.get<{ position: number | null }>(
    "SELECT max(position) AS position FROM request_template_items WHERE template_id = ?",
    [input.templateId],
  );
  const position = (max?.position ?? -1) + 1;
  const id = crypto.randomUUID();
  await input.sql.run(
    `INSERT INTO request_template_items (id, template_id, position, title, guidance, suggested_tag)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.templateId, position, fields.value.title, fields.value.guidance, fields.value.tag],
  );
  return { ok: true, value: { id } };
}

export async function reorderTemplateItems(input: {
  sql: Sql;
  caller: Caller;
  templateId: string;
  orderedIds: string[];
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveStaff(input.sql, input.caller))) return { ok: false, message: REFUSED };
  if (!(await liveTemplate(input.sql, input.templateId))) return { ok: false, message: REFUSED };
  const rows = await input.sql.all<{ id: string }>(
    "SELECT id FROM request_template_items WHERE template_id = ? ORDER BY position",
    [input.templateId],
  );
  const current = rows.map((row) => row.id);
  const next = input.orderedIds;
  if (next.length !== current.length || new Set(next).size !== next.length) {
    return { ok: false, message: REFUSED };
  }
  if (!current.every((id) => next.includes(id))) return { ok: false, message: REFUSED };
  await input.sql.run(
    "UPDATE request_template_items SET position = position + 1000000 WHERE template_id = ?",
    [input.templateId],
  );
  for (const [position, id] of next.entries()) {
    await input.sql.run("UPDATE request_template_items SET position = ? WHERE id = ? AND template_id = ?", [
      position,
      id,
      input.templateId,
    ]);
  }
  return { ok: true, value: { id: input.templateId } };
}

export async function retireTemplateItem(input: {
  sql: Sql;
  caller: Caller;
  templateId: string;
  itemId: string;
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveStaff(input.sql, input.caller))) return { ok: false, message: REFUSED };
  if (!(await liveTemplate(input.sql, input.templateId))) return { ok: false, message: REFUSED };
  const item = await input.sql.get<{ id: string }>(
    "SELECT id FROM request_template_items WHERE id = ? AND template_id = ?",
    [input.itemId, input.templateId],
  );
  if (!item) return { ok: false, message: REFUSED };
  await input.sql.run("DELETE FROM request_template_items WHERE id = ?", [input.itemId]);
  const remaining = await input.sql.all<{ id: string }>(
    "SELECT id FROM request_template_items WHERE template_id = ? ORDER BY position",
    [input.templateId],
  );
  await input.sql.run(
    "UPDATE request_template_items SET position = position + 1000000 WHERE template_id = ?",
    [input.templateId],
  );
  for (const [position, row] of remaining.entries()) {
    await input.sql.run("UPDATE request_template_items SET position = ? WHERE id = ?", [position, row.id]);
  }
  return { ok: true, value: { id: input.itemId } };
}

export async function updateTemplateItem(input: {
  sql: Sql;
  caller: Caller;
  templateId: string;
  itemId: string;
  title: string;
  guidance: string | null;
  suggestedTag: string | null;
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveStaff(input.sql, input.caller))) return { ok: false, message: REFUSED };
  if (!(await liveTemplate(input.sql, input.templateId))) return { ok: false, message: REFUSED };
  const fields = fieldsOf(input);
  if (!fields.ok) return fields;
  const item = await input.sql.get<{ id: string }>(
    "SELECT id FROM request_template_items WHERE id = ? AND template_id = ?",
    [input.itemId, input.templateId],
  );
  if (!item) return { ok: false, message: REFUSED };
  await input.sql.run(
    "UPDATE request_template_items SET title = ?, guidance = ?, suggested_tag = ? WHERE id = ?",
    [fields.value.title, fields.value.guidance, fields.value.tag, input.itemId],
  );
  return { ok: true, value: { id: input.itemId } };
}

export async function retireTemplate(input: {
  sql: Sql;
  caller: Caller;
  templateId: string;
  now: number;
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveStaff(input.sql, input.caller))) return { ok: false, message: REFUSED };
  if (!(await liveTemplate(input.sql, input.templateId))) return { ok: false, message: REFUSED };
  await input.sql.run("UPDATE request_templates SET retired_at = ? WHERE id = ?", [input.now, input.templateId]);
  return { ok: true, value: { id: input.templateId } };
}

export async function templateCatalog(sql: Sql): Promise<TemplateCatalog[]> {
  const templates = await sql.all<{ id: string; name: string }>(
    "SELECT id, name FROM request_templates WHERE retired_at IS NULL ORDER BY name",
  );
  if (templates.length === 0) return [];
  const items = await sql.all<TemplateItemRecord>(
    `SELECT id, template_id, position, title, guidance, suggested_tag
     FROM request_template_items
     WHERE template_id IN (${templates.map(() => "?").join(", ")})
     ORDER BY position`,
    templates.map((template) => template.id),
  );
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    items: items.filter((item) => item.template_id === template.id),
  }));
}

async function activeWorkspace(sql: Sql, workspaceId: string): Promise<"active" | "missing" | "inactive"> {
  const row = await sql.get<{ status: string }>("SELECT status FROM workspaces WHERE id = ?", [workspaceId]);
  if (!row) return "missing";
  return row.status === "active" ? "active" : "inactive";
}

export async function createRequest(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  title: string;
  guidance: string | null;
  suggestedTag: string | null;
  dueOn: number | null;
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveRequestGrant(input.sql, input.caller, input.workspaceId))) {
    return { ok: false, message: REFUSED };
  }
  const workspace = await activeWorkspace(input.sql, input.workspaceId);
  if (workspace === "missing") return { ok: false, message: REFUSED };
  if (workspace === "inactive") return { ok: false, message: INACTIVE };
  const fields = fieldsOf(input);
  if (!fields.ok) return fields;
  const due = dueOf(input.dueOn);
  if (due === undefined) return { ok: false, message: REFUSED };
  const max = await input.sql.get<{ position: number | null }>(
    "SELECT max(position) AS position FROM requests WHERE workspace_id = ?",
    [input.workspaceId],
  );
  const id = crypto.randomUUID();
  await input.sql.run(
    `INSERT INTO requests (
       id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL)`,
    [id, input.workspaceId, (max?.position ?? -1) + 1, fields.value.title, fields.value.guidance, fields.value.tag, due],
  );
  return { ok: true, value: { id } };
}

export async function updateRequest(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  requestId: string;
  title: string;
  guidance: string | null;
  suggestedTag: string | null;
  dueOn: number | null;
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveRequestGrant(input.sql, input.caller, input.workspaceId))) {
    return { ok: false, message: REFUSED };
  }
  const fields = fieldsOf(input);
  if (!fields.ok) return fields;
  const due = dueOf(input.dueOn);
  if (due === undefined) return { ok: false, message: REFUSED };
  const row = await input.sql.get<{ id: string }>(
    "SELECT id FROM requests WHERE id = ? AND workspace_id = ?",
    [input.requestId, input.workspaceId],
  );
  if (!row) return { ok: false, message: REFUSED };
  await input.sql.run(
    "UPDATE requests SET title = ?, guidance = ?, suggested_tag = ?, due_on = ? WHERE id = ?",
    [fields.value.title, fields.value.guidance, fields.value.tag, due, input.requestId],
  );
  return { ok: true, value: { id: input.requestId } };
}

export async function closeRequest(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  requestId: string;
  now: number;
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveRequestGrant(input.sql, input.caller, input.workspaceId))) {
    return { ok: false, message: REFUSED };
  }
  const row = await input.sql.get<{ id: string; status: string }>(
    "SELECT id, status FROM requests WHERE id = ? AND workspace_id = ?",
    [input.requestId, input.workspaceId],
  );
  if (!row) return { ok: false, message: REFUSED };
  if (row.status !== "closed") {
    await input.sql.run("UPDATE requests SET status = 'closed', closed_at = ? WHERE id = ?", [
      input.now,
      input.requestId,
    ]);
  }
  return { ok: true, value: { id: input.requestId } };
}

export async function reopenRequest(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  requestId: string;
  now: number;
}): Promise<StoreResult<{ id: string }>> {
  if (!(await liveRequestGrant(input.sql, input.caller, input.workspaceId))) {
    return { ok: false, message: REFUSED };
  }
  const row = await input.sql.get<{ id: string }>(
    "SELECT id FROM requests WHERE id = ? AND workspace_id = ?",
    [input.requestId, input.workspaceId],
  );
  if (!row || !Number.isInteger(input.now)) return { ok: false, message: REFUSED };
  await input.sql.run("UPDATE requests SET status = 'open', closed_at = NULL WHERE id = ?", [input.requestId]);
  return { ok: true, value: { id: input.requestId } };
}

export async function workspaceRequests(sql: Sql, workspaceId: string): Promise<RequestRecord[]> {
  return sql.all<RequestRecord>(
    `SELECT id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
     FROM requests
     WHERE workspace_id = ?
     ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'received' THEN 1 ELSE 2 END, position`,
    [workspaceId],
  );
}
