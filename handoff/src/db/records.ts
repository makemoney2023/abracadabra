import { getTableName } from "drizzle-orm";
import { seesHeldWork, type Caller } from "@/lib/authz";
import { isBatchActive } from "@/lib/batches";
import { workspaces } from "./schema";
import type { Sql } from "./sql";

const WORKSPACES = getTableName(workspaces);
const WRITABLE_STATUSES = new Set(["pending", "uploading", "failed"]);

export const signedOutCaller: Caller = {
  userId: null,
  staff: null,
  operatorOf: [],
  memberships: [],
};

export type WorkspaceRecord = {
  id: string;
  slug: string;
  name: string;
  display_name: string;
  logo_object_key: string | null;
  sender_name: string;
  policy_profile: string;
  quota_bytes: number;
  retention_days: number;
  status: string;
  archived_at: number | null;
  purge_after: number | null;
  purged_at: number | null;
};

export type ScopedRecord = {
  id: string;
  workspace_id: string;
};

type VisibleRow = { id: string };

const VISIBLE_SQL = `
  SELECT id FROM ${WORKSPACES} w
  WHERE EXISTS (
    SELECT 1 FROM staff s
    WHERE s.user_id = ? AND s.is_super_admin = 1 AND s.revoked_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM workspace_operators o
    WHERE o.workspace_id = w.id AND o.user_id = ? AND o.removed_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.workspace_id = w.id AND m.user_id = ? AND m.revoked_at IS NULL
  )
  ORDER BY slug
`;

async function visibleIds(sql: Sql, caller: Caller): Promise<string[]> {
  if (!caller.userId) return [];
  const rows = await sql.all<VisibleRow>(VISIBLE_SQL, [
    caller.userId,
    caller.userId,
    caller.userId,
  ]);
  return rows.map((row) => row.id);
}

async function scoped<T extends ScopedRecord>(
  sql: Sql,
  caller: Caller,
  table: string,
  workspaceId?: string,
): Promise<T[]> {
  const ids = await visibleIds(sql, caller);
  const allowed = workspaceId ? ids.filter((id) => id === workspaceId) : ids;
  if (allowed.length === 0) return [];
  const placeholders = allowed.map(() => "?").join(", ");
  return sql.all<T>(
    `SELECT * FROM ${table} WHERE workspace_id IN (${placeholders}) ORDER BY id`,
    allowed,
  );
}

export async function workspacesFor(sql: Sql, caller: Caller): Promise<WorkspaceRecord[]> {
  const ids = await visibleIds(sql, caller);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  return sql.all<WorkspaceRecord>(
    `SELECT * FROM ${WORKSPACES} WHERE id IN (${placeholders}) ORDER BY slug`,
    ids,
  );
}

export async function workspaceById(
  sql: Sql,
  caller: Caller,
  id: string,
): Promise<WorkspaceRecord | undefined> {
  const visible = await workspacesFor(sql, caller);
  return visible.find((row) => row.id === id);
}

/** Files the caller may see. Files in a held batch (agent work waiting on Client Services) are staff-only. */
export async function filesFor(sql: Sql, caller: Caller, workspaceId?: string) {
  const rows = await scoped<ScopedRecord & { object_key: string; status: string; batch_id: string }>(
    sql,
    caller,
    "files",
    workspaceId,
  );
  const blind = [...new Set(rows.map((row) => row.workspace_id))].filter((id) => !seesHeldWork(caller, id));
  if (blind.length === 0) return rows;
  const held = await sql.all<{ id: string }>(
    `SELECT id FROM batches WHERE held_at IS NOT NULL AND workspace_id IN (${blind.map(() => "?").join(", ")})`,
    blind,
  );
  if (held.length === 0) return rows;
  const hidden = new Set(held.map((row) => row.id));
  return rows.filter((row) => !hidden.has(row.batch_id));
}

export function requestsFor(sql: Sql, caller: Caller, workspaceId?: string) {
  return scoped(sql, caller, "requests", workspaceId);
}

/** Batches the caller may see. A held batch (agent work waiting on Client Services) is staff-only. */
export async function batchesFor(sql: Sql, caller: Caller, workspaceId?: string) {
  const rows = await scoped<ScopedRecord & { held_at?: number | null }>(sql, caller, "batches", workspaceId);
  return rows.filter((row) => row.held_at == null || seesHeldWork(caller, row.workspace_id));
}

export function membershipsFor(sql: Sql, caller: Caller, workspaceId?: string) {
  return scoped(sql, caller, "memberships", workspaceId);
}

export function operatorsFor(sql: Sql, caller: Caller, workspaceId?: string) {
  return scoped(sql, caller, "workspace_operators", workspaceId);
}

type WriteRow = {
  status: string;
  created_at: number;
  last_activity_at: number;
  discarded_at: number | null;
  deleted_at: number | null;
};

/** A client may write only a live membership's pending, uploading, or failed object on an active batch. */
export async function objectWriteAllowed(
  sql: Sql,
  caller: Caller,
  objectKey: string,
  nowMs: number,
): Promise<boolean> {
  if (!caller.userId) return false;
  const parts = objectKey.split("/");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return false;
  const [workspaceId, batchId, fileId] = parts;
  const file = await sql.get<WriteRow>(
    `SELECT f.status, b.created_at, b.last_activity_at, b.discarded_at, b.deleted_at
     FROM files f
     JOIN batches b ON b.id = f.batch_id AND b.workspace_id = f.workspace_id
     WHERE f.object_key = ? AND f.id = ? AND f.batch_id = ? AND f.workspace_id = ?`,
    [objectKey, fileId, batchId, workspaceId],
  );
  if (!file || !WRITABLE_STATUSES.has(file.status)) return false;
  if (file.discarded_at !== null || file.deleted_at !== null) return false;
  if (
    !isBatchActive(new Date(file.created_at), new Date(file.last_activity_at), new Date(nowMs))
  ) {
    return false;
  }
  const member = await sql.get<{ id: string }>(
    `SELECT id FROM memberships
     WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL`,
    [workspaceId, caller.userId],
  );
  return member !== undefined;
}

export async function healthReport(sql: Sql, caller: Caller) {
  const table = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [WORKSPACES],
  );
  const visible = await workspacesFor(sql, caller);
  return {
    database: "d1" as const,
    ok: table?.name === WORKSPACES,
    visible: visible.length,
  };
}
