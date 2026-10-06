import type { Sql } from "@/db/sql";
import { can, type Caller } from "@/lib/authz";
import { LIMITS } from "@/lib/policy/limits";
import type { BrandingStore } from "@/lib/store/branding";
import { reencodeLogo } from "@/lib/store/logo";
import { REFUSED, type StoreResult } from "@/lib/store/result";
import { isLiveSuperAdmin } from "@/lib/store/staff";

const LOGO_REFUSED = "Use a PNG or WebP logo under 512 KB.";
const TEMPLATE_REFUSED = "Choose a live template.";
const SLUG_TAKEN = "That slug is already in use.";
const NOT_STAFF = "That person is not staff.";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type { BrandingStore } from "@/lib/store/branding";

export type PolicyProfile = "standard" | "software";

export type WorkspaceFields = {
  name: string;
  slug: string;
  displayName: string;
  senderName: string;
  policyProfile: PolicyProfile;
  templateId?: string | null;
  quotaBytes?: number;
  retentionDays?: number;
};

type TemplateItem = {
  position: number;
  title: string;
  guidance: string | null;
  suggested_tag: string | null;
};

function requiredText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function profileOf(value: string): PolicyProfile | undefined {
  return value === "standard" || value === "software" ? value : undefined;
}

function bytesOf(value: number | undefined, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

export async function liveTemplates(sql: Sql): Promise<{ id: string; name: string }[]> {
  return sql.all<{ id: string; name: string }>(
    "SELECT id, name FROM request_templates WHERE retired_at IS NULL ORDER BY name",
  );
}

export async function createWorkspace(input: {
  sql: Sql;
  caller: Caller;
  now: number;
  fields: WorkspaceFields;
}): Promise<StoreResult<{ id: string; slug: string }>> {
  if (!can(input.caller, "workspace.create") || !(await isLiveSuperAdmin(input.sql, input.caller))) {
    return { ok: false, message: REFUSED };
  }
  const name = requiredText(input.fields.name);
  const displayName = requiredText(input.fields.displayName);
  const senderName = requiredText(input.fields.senderName);
  const slug = input.fields.slug.trim().toLowerCase();
  const profile = profileOf(input.fields.policyProfile);
  const quota = bytesOf(input.fields.quotaBytes, LIMITS.defaultQuotaBytes);
  const retention = bytesOf(input.fields.retentionDays, LIMITS.defaultRetentionDays);
  if (!name || !displayName || !senderName || !SLUG.test(slug) || !profile || quota === undefined || retention === undefined) {
    return { ok: false, message: REFUSED };
  }

  const taken = await input.sql.get<{ id: string }>("SELECT id FROM workspaces WHERE slug = ?", [slug]);
  if (taken) return { ok: false, message: SLUG_TAKEN };

  const templateId = input.fields.templateId?.trim() ?? "";
  let items: TemplateItem[] = [];
  if (templateId.length > 0) {
    const template = await input.sql.get<{ id: string }>(
      "SELECT id FROM request_templates WHERE id = ? AND retired_at IS NULL",
      [templateId],
    );
    if (!template) return { ok: false, message: TEMPLATE_REFUSED };
    items = await input.sql.all<TemplateItem>(
      `SELECT position, title, guidance, suggested_tag
       FROM request_template_items WHERE template_id = ? ORDER BY position`,
      [templateId],
    );
  }

  const id = crypto.randomUUID();
  await input.sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at
     ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, 'active', ?)`,
    [id, slug, name, displayName, senderName, profile, quota, retention, input.now],
  );
  for (const item of items) {
    await input.sql.run(
      `INSERT INTO requests (
         id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'open', NULL, NULL)`,
      [crypto.randomUUID(), id, item.position, item.title, item.guidance, item.suggested_tag],
    );
  }
  return { ok: true, value: { id, slug } };
}

export async function assignOperator(input: {
  sql: Sql;
  caller: Caller;
  now: number;
  workspaceId: string;
  userId: string;
}): Promise<StoreResult<{ id: string }>> {
  if (!can(input.caller, "workspace.create") || !(await isLiveSuperAdmin(input.sql, input.caller))) {
    return { ok: false, message: REFUSED };
  }
  const workspace = await input.sql.get<{ id: string }>("SELECT id FROM workspaces WHERE id = ?", [
    input.workspaceId,
  ]);
  if (!workspace) return { ok: false, message: REFUSED };
  const staff = await input.sql.get<{ user_id: string }>(
    "SELECT user_id FROM staff WHERE user_id = ? AND revoked_at IS NULL",
    [input.userId],
  );
  if (!staff) return { ok: false, message: NOT_STAFF };
  const existing = await input.sql.get<{ id: string }>(
    `SELECT id FROM workspace_operators
     WHERE workspace_id = ? AND user_id = ? AND removed_at IS NULL`,
    [input.workspaceId, input.userId],
  );
  if (existing) return { ok: true, value: { id: existing.id } };
  const id = crypto.randomUUID();
  await input.sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [id, input.workspaceId, input.userId, input.caller.userId, input.now],
  );
  return { ok: true, value: { id } };
}

export async function configureWorkspace(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  policyProfile?: PolicyProfile;
  quotaBytes?: number;
}): Promise<StoreResult<{ id: string }>> {
  if (!can(input.caller, "workspace.configure") || !(await isLiveSuperAdmin(input.sql, input.caller))) {
    return { ok: false, message: REFUSED };
  }
  const workspace = await input.sql.get<{ id: string }>("SELECT id FROM workspaces WHERE id = ?", [
    input.workspaceId,
  ]);
  if (!workspace) return { ok: false, message: REFUSED };
  if (input.policyProfile !== undefined && !profileOf(input.policyProfile)) {
    return { ok: false, message: REFUSED };
  }
  if (input.quotaBytes !== undefined && bytesOf(input.quotaBytes, 0) === undefined) {
    return { ok: false, message: REFUSED };
  }
  if (input.policyProfile !== undefined) {
    await input.sql.run("UPDATE workspaces SET policy_profile = ? WHERE id = ?", [
      input.policyProfile,
      input.workspaceId,
    ]);
  }
  if (input.quotaBytes !== undefined) {
    await input.sql.run("UPDATE workspaces SET quota_bytes = ? WHERE id = ?", [
      input.quotaBytes,
      input.workspaceId,
    ]);
  }
  return { ok: true, value: { id: input.workspaceId } };
}

async function mayBrand(sql: Sql, caller: Caller, workspaceId: string): Promise<boolean> {
  if (!caller.userId) return false;
  if (await isLiveSuperAdmin(sql, caller)) return true;
  const staff = await sql.get<{ ok: number }>(
    "SELECT 1 AS ok FROM staff WHERE user_id = ? AND revoked_at IS NULL",
    [caller.userId],
  );
  if (staff?.ok !== 1) return false;
  const assigned = await sql.get<{ ok: number }>(
    `SELECT 1 AS ok FROM workspace_operators
     WHERE workspace_id = ? AND user_id = ? AND removed_at IS NULL`,
    [workspaceId, caller.userId],
  );
  return assigned?.ok === 1;
}

export async function setWorkspaceLogo(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  bytes: Uint8Array;
  branding: BrandingStore;
}): Promise<StoreResult<{ key: string }>> {
  const workspace = await input.sql.get<{ id: string }>("SELECT id FROM workspaces WHERE id = ?", [
    input.workspaceId,
  ]);
  if (!workspace || !(await mayBrand(input.sql, input.caller, input.workspaceId))) {
    return { ok: false, message: REFUSED };
  }
  const encoded = await reencodeLogo(input.bytes);
  if (!encoded) return { ok: false, message: LOGO_REFUSED };
  const key = `branding/${input.workspaceId}.png`;
  await input.branding.put(key, encoded, "image/png");
  await input.sql.run("UPDATE workspaces SET logo_object_key = ? WHERE id = ?", [key, input.workspaceId]);
  return { ok: true, value: { key } };
}
