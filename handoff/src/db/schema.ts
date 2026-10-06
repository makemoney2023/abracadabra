import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const fileTags = [
  "brand",
  "photo",
  "copy",
  "data_export",
  "reference",
  "source",
  "other",
] as const;

export const staff = sqliteTable("staff", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  isSuperAdmin: integer("is_super_admin").notNull(),
  createdAt: integer("created_at").notNull(),
  revokedAt: integer("revoked_at"),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  logoObjectKey: text("logo_object_key"),
  senderName: text("sender_name").notNull(),
  policyProfile: text("policy_profile").notNull(),
  quotaBytes: integer("quota_bytes").notNull(),
  retentionDays: integer("retention_days").notNull(),
  requestDigest: integer("request_digest").notNull(),
  status: text("status").notNull(),
  openedAt: integer("opened_at").notNull(),
  archivedAt: integer("archived_at"),
  purgeAfter: integer("purge_after"),
  purgedAt: integer("purged_at"),
});

export const workspaceOperators = sqliteTable(
  "workspace_operators",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    assignedBy: text("assigned_by").notNull(),
    assignedAt: integer("assigned_at").notNull(),
    removedAt: integer("removed_at"),
  },
  (table) => [
    uniqueIndex("workspace_operators_live")
      .on(table.workspaceId, table.userId)
      .where(sql`removed_at is null`),
  ],
);

export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: integer("expires_at").notNull(),
    acceptedAt: integer("accepted_at"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    uniqueIndex("invites_live_workspace_email")
      .on(table.workspaceId, table.email)
      .where(sql`revoked_at is null`),
  ],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    createdAt: integer("created_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    uniqueIndex("memberships_live_workspace_user")
      .on(table.workspaceId, table.userId)
      .where(sql`revoked_at is null`),
  ],
);

export const requestTemplates = sqliteTable("request_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
  retiredAt: integer("retired_at"),
});

export const requestTemplateItems = sqliteTable("request_template_items", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  guidance: text("guidance"),
  suggestedTag: text("suggested_tag", { enum: fileTags }),
});

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  guidance: text("guidance"),
  suggestedTag: text("suggested_tag", { enum: fileTags }),
  dueOn: integer("due_on"),
  status: text("status").notNull(),
  receivedAt: integer("received_at"),
  closedAt: integer("closed_at"),
});

export const batches = sqliteTable("batches", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  requestId: text("request_id"),
  createdBy: text("created_by").notNull(),
  label: text("label"),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  lastActivityAt: integer("last_activity_at").notNull(),
  discardedAt: integer("discarded_at"),
  deletedAt: integer("deleted_at"),
});

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    relativePath: text("relative_path").notNull(),
    extension: text("extension").notNull(),
    declaredContentType: text("declared_content_type"),
    sizeBytes: integer("size_bytes").notNull(),
    objectKey: text("object_key").notNull().unique(),
    tag: text("tag", { enum: fileTags }).notNull(),
    status: text("status").notNull(),
    sha256: text("sha256"),
    scanReason: text("scan_reason"),
    scanAttempts: integer("scan_attempts").notNull(),
    nextScanAt: integer("next_scan_at"),
    createdAt: integer("created_at").notNull(),
    uploadedAt: integer("uploaded_at"),
    scannedAt: integer("scanned_at"),
    objectDeletedAt: integer("object_deleted_at"),
  },
  (table) => [
    uniqueIndex("files_batch_relative_path").on(table.batchId, table.relativePath),
    index("files_workspace_sha256").on(table.workspaceId, table.sha256),
  ],
);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  event: text("event").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  payload: text("payload").notNull(),
  sentAt: integer("sent_at"),
  attempts: integer("attempts").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  at: integer("at").notNull(),
  metadata: text("metadata").notNull(),
});
