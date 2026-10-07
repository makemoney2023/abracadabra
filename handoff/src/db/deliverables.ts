import type { Caller } from "@/lib/authz";
import {
  DELIVERABLE_KINDS,
  ITEM_FORMATS,
  parseManifest,
  type DeliverableKind,
  type ItemFormat,
  type Manifest,
} from "@/lib/deliverable-manifest";
import { workspacesFor } from "./records";
import type { Sql } from "./sql";

export type DeliverableError = "forbidden" | "invalid" | "missing";
export type DeliverableResult<T> = { ok: true; value: T } | { ok: false; error: DeliverableError };

export const DELIVERABLE_ERRORS: Record<DeliverableError, string> = {
  forbidden: "You can't do that.",
  invalid: "Check the finished work and try again.",
  missing: "That finished work is not here.",
};

const KINDS = new Set<string>(DELIVERABLE_KINDS);
const FORMATS = new Set<string>(ITEM_FORMATS);

export type DeliverableStatus = "draft" | "in_review" | "approved" | "changes_requested" | "archived";
export type FeedbackDecision = "approve" | "changes" | "comment";

export type DeliverableRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  workspace_id: string;
  title: string;
  kind: DeliverableKind;
  status: DeliverableStatus;
  version: number;
  published_version: number | null;
  source_repo_id: string | null;
  source_ref: string | null;
  published_at: number | null;
  created_at: number;
  updated_at: number;
};

export type DeliverableItemRow = {
  id: string;
  deliverable_id: string;
  version: number;
  section: string | null;
  format: ItemFormat;
  channel: string | null;
  title: string;
  copy_text: string | null;
  media_json: string;
  link_url: string | null;
  status: "pending" | "approved" | "changes_requested";
  sort: number;
};

export type DeliverableCard = {
  id: string;
  title: string;
  kind: DeliverableKind;
  status: DeliverableStatus;
  workspace_id: string;
  version: number;
  published_version: number | null;
  updated_at: number;
};

export type OpenedDeliverable = { deliverable: DeliverableRow; items: DeliverableItemRow[] };

export type FeedbackRow = {
  id: string;
  deliverable_id: string;
  item_id: string | null;
  version: number;
  author_kind: "client" | "staff";
  author_id: string | null;
  decision: FeedbackDecision;
  body: string | null;
  created_at: number;
};

export type ManifestFile = { bytes: Uint8Array; contentType: string };

export type PullInput = {
  deliverableId: string;
  repoId: string;
  commit: string;
  manifest: unknown;
  files: Record<string, ManifestFile>;
};

type MediaStored = {
  r2_key: string;
  role: string;
  content_type: string;
  size: number;
};

const DELIVERABLE_COLUMNS = `id, organization_id, project_id, workspace_id, title, kind, status, version,
  published_version, source_repo_id, source_ref, published_at, created_at, updated_at`;

async function seesSpace(sql: Sql, caller: Caller, workspaceId: string): Promise<boolean> {
  if (!caller.userId) return false;
  const spaces = await workspacesFor(sql, caller);
  return spaces.some((space) => space.id === workspaceId);
}

async function loadRow(sql: Sql, id: string): Promise<DeliverableRow | undefined> {
  return sql.get<DeliverableRow>(`SELECT ${DELIVERABLE_COLUMNS} FROM deliverables WHERE id = ?`, [id]);
}

async function itemsFor(sql: Sql, deliverableId: string, version: number): Promise<DeliverableItemRow[]> {
  return sql.all<DeliverableItemRow>(
    `SELECT id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
     FROM deliverable_items WHERE deliverable_id = ? AND version = ? ORDER BY sort, title`,
    [deliverableId, version],
  );
}

function statusFromItems(items: { status: string }[]): DeliverableStatus {
  if (items.some((item) => item.status === "changes_requested")) return "changes_requested";
  if (items.length > 0 && items.every((item) => item.status === "approved")) return "approved";
  return "in_review";
}

function nextWorking(row: DeliverableRow): { version: number; bump: boolean } {
  if (row.published_version != null && row.version === row.published_version) {
    return { version: row.version + 1, bump: true };
  }
  return { version: row.version, bump: false };
}

async function writeAll(sql: Sql, statements: { statement: string; params: readonly unknown[] }[]): Promise<void> {
  await sql.run("BEGIN");
  try {
    for (const entry of statements) await sql.run(entry.statement, entry.params);
    await sql.run("COMMIT");
  } catch (error) {
    await sql.run("ROLLBACK");
    throw error;
  }
}

function activity(
  row: Pick<DeliverableRow, "organization_id" | "project_id" | "workspace_id">,
  kind: string,
  actorKind: "staff" | "system",
  actorId: string,
  body: string,
  now: number,
): { statement: string; params: readonly unknown[] } {
  return {
    statement: `INSERT INTO activities (
      id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    params: [crypto.randomUUID(), row.organization_id, row.project_id, row.workspace_id, kind, actorKind, actorId, body, now],
  };
}

function cleanTitle(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

async function gateStaff(
  sql: Sql,
  caller: Caller,
  workspaceId: string,
): Promise<DeliverableResult<string>> {
  if (!(await seesSpace(sql, caller, workspaceId))) return { ok: false, error: "missing" };
  if (!caller.staff || !caller.userId) return { ok: false, error: "forbidden" };
  return { ok: true, value: caller.userId };
}

export async function createDeliverable(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; projectId: string | null; workspaceId: string; title: string; kind: string },
  now: number,
): Promise<DeliverableResult<{ id: string }>> {
  const staff = await gateStaff(sql, caller, input.workspaceId);
  if (!staff.ok) return staff;
  const title = cleanTitle(input.title);
  if (!title || !KINDS.has(input.kind)) return { ok: false, error: "invalid" };
  const workspace = await sql.get<{ organization_id: string | null; project_id: string | null }>(
    "SELECT organization_id, project_id FROM workspaces WHERE id = ? AND status != 'purged'",
    [input.workspaceId],
  );
  if (!workspace || workspace.organization_id !== input.organizationId) return { ok: false, error: "invalid" };
  if (input.projectId) {
    const project = await sql.get<{ organization_id: string }>(
      "SELECT organization_id FROM projects WHERE id = ?",
      [input.projectId],
    );
    if (!project || project.organization_id !== input.organizationId) return { ok: false, error: "invalid" };
    if (workspace.project_id && workspace.project_id !== input.projectId) return { ok: false, error: "invalid" };
  }
  const id = crypto.randomUUID();
  const row: DeliverableRow = {
    id,
    organization_id: input.organizationId,
    project_id: input.projectId,
    workspace_id: input.workspaceId,
    title,
    kind: input.kind as DeliverableKind,
    status: "draft",
    version: 1,
    published_version: null,
    source_repo_id: null,
    source_ref: null,
    published_at: null,
    created_at: now,
    updated_at: now,
  };
  await writeAll(sql, [
    {
      statement: `INSERT INTO deliverables (
        id, organization_id, project_id, workspace_id, title, kind, status, version,
        source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, NULL, NULL, NULL, 'staff', ?, ?, ?)`,
      params: [id, input.organizationId, input.projectId, input.workspaceId, title, input.kind, staff.value, now, now],
    },
    activity(row, "deliverable_created", "staff", staff.value, title, now),
  ]);
  return { ok: true, value: { id } };
}

export async function addDeliverableItem(
  sql: Sql,
  caller: Caller,
  input: {
    deliverableId: string;
    title: string;
    format: string;
    copyText?: string | null;
    section?: string | null;
    channel?: string | null;
    linkUrl?: string | null;
  },
  now: number,
): Promise<DeliverableResult<{ id: string }>> {
  const row = await loadRow(sql, input.deliverableId);
  if (!row) return { ok: false, error: "missing" };
  const staff = await gateStaff(sql, caller, row.workspace_id);
  if (!staff.ok) return staff;
  const title = cleanTitle(input.title);
  if (!title || !FORMATS.has(input.format)) return { ok: false, error: "invalid" };
  const plan = nextWorking(row);
  const existing = plan.bump ? [] : await itemsFor(sql, row.id, plan.version);
  const sort = existing.reduce((max, item) => Math.max(max, item.sort), -1) + 1;
  const id = crypto.randomUUID();
  const writes: { statement: string; params: readonly unknown[] }[] = [];
  if (plan.bump) {
    writes.push({
      statement: "UPDATE deliverables SET version = ?, status = 'draft', updated_at = ? WHERE id = ?",
      params: [plan.version, now, row.id],
    });
  }
  writes.push({
    statement: `INSERT INTO deliverable_items (
      id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 'pending', ?)`,
    params: [
      id,
      row.id,
      plan.version,
      input.section?.trim() || null,
      input.format,
      input.channel?.trim() || null,
      title,
      input.copyText?.trim() || null,
      input.linkUrl?.trim() || null,
      sort,
    ],
  });
  writes.push(activity(row, "deliverable_item", "staff", staff.value, title, now));
  await writeAll(sql, writes);
  return { ok: true, value: { id } };
}

export async function publishDeliverable(
  sql: Sql,
  caller: Caller,
  deliverableId: string,
  now: number,
): Promise<DeliverableResult<{ id: string }>> {
  const row = await loadRow(sql, deliverableId);
  if (!row) return { ok: false, error: "missing" };
  const staff = await gateStaff(sql, caller, row.workspace_id);
  if (!staff.ok) return staff;
  if (row.status !== "draft") return { ok: false, error: "invalid" };
  const items = await itemsFor(sql, row.id, row.version);
  if (items.length === 0) return { ok: false, error: "invalid" };
  await writeAll(sql, [
    {
      statement: `UPDATE deliverables
        SET published_version = version, published_at = ?, status = 'in_review', updated_at = ?
        WHERE id = ?`,
      params: [now, now, row.id],
    },
    activity(row, "deliverable_published", "staff", staff.value, row.title, now),
  ]);
  return { ok: true, value: { id: row.id } };
}

async function cardsFor(
  sql: Sql,
  caller: Caller,
  where: string,
  params: readonly unknown[],
): Promise<DeliverableCard[]> {
  const staffView = Boolean(caller.staff);
  const rows = await sql.all<DeliverableCard>(
    `SELECT id, title, kind, status, workspace_id, version, published_version, updated_at
     FROM deliverables
     WHERE status != 'archived' AND ${where}
     ORDER BY updated_at DESC, title`,
    params,
  );
  const visible: DeliverableCard[] = [];
  for (const row of rows) {
    if (!(await seesSpace(sql, caller, row.workspace_id))) continue;
    if (!staffView && row.published_version == null) continue;
    if (!staffView && row.published_version != null) {
      const items = await itemsFor(sql, row.id, row.published_version);
      visible.push({ ...row, status: statusFromItems(items) });
    } else {
      visible.push(row);
    }
  }
  return visible;
}

export async function listWorkspaceDeliverables(
  sql: Sql,
  caller: Caller,
  workspaceId: string,
): Promise<DeliverableCard[]> {
  if (!(await seesSpace(sql, caller, workspaceId))) return [];
  return cardsFor(sql, caller, "workspace_id = ?", [workspaceId]);
}

export async function listProjectDeliverables(
  sql: Sql,
  caller: Caller,
  projectId: string,
): Promise<DeliverableCard[]> {
  if (!caller.staff) return [];
  return cardsFor(sql, caller, "project_id = ?", [projectId]);
}

export async function openDeliverable(
  sql: Sql,
  caller: Caller,
  id: string,
  view: "published" | "working",
): Promise<OpenedDeliverable | undefined> {
  const row = await loadRow(sql, id);
  if (!row || !(await seesSpace(sql, caller, row.workspace_id))) return undefined;
  if (view === "working") {
    if (!caller.staff) return undefined;
    return { deliverable: row, items: await itemsFor(sql, row.id, row.version) };
  }
  if (row.published_version == null) return undefined;
  const items = await itemsFor(sql, row.id, row.published_version);
  return {
    deliverable: { ...row, status: statusFromItems(items) },
    items,
  };
}

export async function listDeliverableFeedback(
  sql: Sql,
  caller: Caller,
  deliverableId: string,
): Promise<FeedbackRow[]> {
  const row = await loadRow(sql, deliverableId);
  if (!row || !(await seesSpace(sql, caller, row.workspace_id))) return [];
  if (!caller.staff) {
    if (row.published_version == null) return [];
    return sql.all<FeedbackRow>(
      `SELECT id, deliverable_id, item_id, version, author_kind, author_id, decision, body, created_at
       FROM deliverable_feedback WHERE deliverable_id = ? AND version = ? ORDER BY created_at`,
      [deliverableId, row.published_version],
    );
  }
  return sql.all<FeedbackRow>(
    `SELECT id, deliverable_id, item_id, version, author_kind, author_id, decision, body, created_at
     FROM deliverable_feedback WHERE deliverable_id = ? ORDER BY created_at`,
    [deliverableId],
  );
}

export async function recordFeedback(
  sql: Sql,
  caller: Caller,
  input: { deliverableId: string; itemId: string | null; version: number; decision: FeedbackDecision; body: string },
  now: number,
): Promise<DeliverableResult<{ id: string }>> {
  const row = await loadRow(sql, input.deliverableId);
  if (!row || !(await seesSpace(sql, caller, row.workspace_id)) || !caller.userId) {
    return { ok: false, error: "missing" };
  }
  if (row.published_version == null || input.version !== row.published_version) {
    return { ok: false, error: "invalid" };
  }
  const body = input.body.trim();
  if (input.decision === "changes" && !body) return { ok: false, error: "invalid" };
  if (input.decision === "changes" && !input.itemId) return { ok: false, error: "invalid" };
  const items = await itemsFor(sql, row.id, input.version);
  if (input.itemId && !items.some((item) => item.id === input.itemId)) return { ok: false, error: "invalid" };
  const next = items.map((item) => {
    if (input.decision === "comment") return item.status;
    if (input.itemId == null && input.decision === "approve" && item.status === "pending") return "approved" as const;
    if (item.id === input.itemId && input.decision === "approve") return "approved" as const;
    if (item.id === input.itemId && input.decision === "changes") return "changes_requested" as const;
    return item.status;
  });
  const authorKind = caller.staff ? "staff" : "client";
  const actorKind = caller.staff ? "staff" : "system";
  const writes: { statement: string; params: readonly unknown[] }[] = [
    {
      statement: `INSERT INTO deliverable_feedback (
        id, deliverable_id, item_id, version, author_kind, author_id, decision, body, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        row.id,
        input.itemId,
        input.version,
        authorKind,
        caller.userId,
        input.decision,
        body || null,
        now,
      ],
    },
  ];
  if (input.decision !== "comment" && input.itemId) {
    const status = input.decision === "approve" ? "approved" : "changes_requested";
    writes.push({
      statement: "UPDATE deliverable_items SET status = ? WHERE id = ? AND deliverable_id = ? AND version = ?",
      params: [status, input.itemId, row.id, input.version],
    });
  }
  if (input.decision === "approve" && input.itemId == null) {
    writes.push({
      statement: `UPDATE deliverable_items SET status = 'approved'
        WHERE deliverable_id = ? AND version = ? AND status = 'pending'`,
      params: [row.id, input.version],
    });
  }
  if (input.decision !== "comment" && row.version === row.published_version) {
    writes.push({
      statement: "UPDATE deliverables SET status = ?, updated_at = ? WHERE id = ?",
      params: [statusFromItems(next.map((status) => ({ status }))), now, row.id],
    });
  }
  writes.push(activity(row, "deliverable_feedback", actorKind, caller.userId, body || "Approved.", now));
  await writeAll(sql, writes);
  return { ok: true, value: { id: row.id } };
}

export async function visibleMedia(
  sql: Sql,
  caller: Caller,
  deliverableId: string,
  itemId: string,
  role: string,
): Promise<{ key: string; contentType: string } | null> {
  const row = await loadRow(sql, deliverableId);
  if (!row || !(await seesSpace(sql, caller, row.workspace_id))) return null;
  const item = await sql.get<DeliverableItemRow>(
    `SELECT id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
     FROM deliverable_items WHERE id = ? AND deliverable_id = ?`,
    [itemId, deliverableId],
  );
  if (!item) return null;
  const staffView = Boolean(caller.staff);
  if (!staffView && item.version !== row.published_version) return null;
  let media: MediaStored[] = [];
  try {
    const parsed = JSON.parse(item.media_json) as unknown;
    if (Array.isArray(parsed)) media = parsed as MediaStored[];
  } catch {
    return null;
  }
  const match = media.find((entry) => entry.role === role && typeof entry.r2_key === "string");
  if (!match || typeof match.content_type !== "string") return null;
  return { key: match.r2_key, contentType: match.content_type };
}

export async function pullDeliverableFromManifest(
  sql: Sql,
  caller: Caller,
  input: PullInput,
  now: number,
  put: (bytes: Uint8Array) => Promise<string>,
): Promise<DeliverableResult<{ id: string }>> {
  const row = await loadRow(sql, input.deliverableId);
  if (!row) return { ok: false, error: "missing" };
  const staff = await gateStaff(sql, caller, row.workspace_id);
  if (!staff.ok) return staff;
  const commit = input.commit.trim();
  if (!commit || commit.length > 80 || /\s/.test(commit)) return { ok: false, error: "invalid" };
  const repo = await sql.get<{ organization_id: string }>(
    "SELECT organization_id FROM repos WHERE id = ? AND archived_at IS NULL",
    [input.repoId],
  );
  if (!repo || repo.organization_id !== row.organization_id) return { ok: false, error: "invalid" };
  const manifest = parseManifest(input.manifest);
  if (!manifest) return { ok: false, error: "invalid" };
  const ready = mediaPlan(manifest, input.files);
  if (!ready) return { ok: false, error: "invalid" };
  const stored: { title: string; format: ItemFormat; section: string | null; channel: string | null; copy: string | null; link: string | null; media: MediaStored[] }[] = [];
  for (const item of ready) {
    const media: MediaStored[] = [];
    for (const piece of item.media) {
      const key = await put(piece.bytes);
      media.push({
        r2_key: key,
        role: piece.role,
        content_type: piece.contentType,
        size: piece.bytes.byteLength,
      });
    }
    stored.push({ ...item, media });
  }
  const plan = nextWorking(row);
  const writes: { statement: string; params: readonly unknown[] }[] = [];
  if (plan.bump) {
    writes.push({
      statement: "UPDATE deliverables SET version = ?, status = 'draft', updated_at = ? WHERE id = ?",
      params: [plan.version, now, row.id],
    });
  }
  writes.push({
    statement: "DELETE FROM deliverable_items WHERE deliverable_id = ? AND version = ?",
    params: [row.id, plan.version],
  });
  stored.forEach((item, index) => {
    writes.push({
      statement: `INSERT INTO deliverable_items (
        id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      params: [
        crypto.randomUUID(),
        row.id,
        plan.version,
        item.section,
        item.format,
        item.channel,
        item.title,
        item.copy,
        JSON.stringify(item.media),
        item.link,
        index,
      ],
    });
  });
  writes.push({
    statement: `UPDATE deliverables
      SET title = ?, kind = ?, source_repo_id = ?, source_ref = ?, status = 'draft', updated_at = ?
      WHERE id = ?`,
    params: [manifest.title, manifest.kind, input.repoId, commit, now, row.id],
  });
  writes.push(activity(row, "deliverable_pulled", "staff", staff.value, manifest.title, now));
  await writeAll(sql, writes);
  return { ok: true, value: { id: row.id } };
}

function mediaPlan(
  manifest: Manifest,
  files: Record<string, ManifestFile>,
): { title: string; format: ItemFormat; section: string | null; channel: string | null; copy: string | null; link: string | null; media: { role: string; bytes: Uint8Array; contentType: string }[] }[] | null {
  const planned = [];
  for (const item of manifest.items) {
    const media = [];
    for (const entry of item.media) {
      const file = files[entry.path];
      if (!file || !(file.bytes instanceof Uint8Array)) return null;
      const contentType = file.contentType.trim();
      if (!contentType || contentType.length > 120 || /[\r\n]/.test(contentType)) return null;
      media.push({ role: entry.role, bytes: file.bytes, contentType });
    }
    planned.push({
      title: item.title,
      format: item.format,
      section: item.section,
      channel: item.channel,
      copy: item.copy,
      link: item.link,
      media,
    });
  }
  return planned;
}
