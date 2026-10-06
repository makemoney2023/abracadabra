-- Handoff locker records (HND-047) on Cloudflare D1.
-- Timestamps are unix milliseconds. Booleans are 0 or 1.
-- D1 has no row-level security. src/db/records.ts scopes every read and write.

PRAGMA foreign_keys = ON;

CREATE TABLE staff (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL CHECK (email = lower(email) AND length(email) > 0),
  is_super_admin INTEGER NOT NULL CHECK (is_super_admin IN (0, 1)),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (
    length(slug) > 0
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND slug NOT GLOB '-*'
    AND slug NOT GLOB '*-'
    AND slug NOT GLOB '*--*'
  ),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  logo_object_key TEXT,
  sender_name TEXT NOT NULL,
  policy_profile TEXT NOT NULL CHECK (policy_profile IN ('standard', 'software')),
  quota_bytes INTEGER NOT NULL CHECK (quota_bytes >= 0),
  retention_days INTEGER NOT NULL CHECK (retention_days >= 0),
  request_digest INTEGER NOT NULL CHECK (request_digest IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived', 'purged')),
  opened_at INTEGER NOT NULL,
  archived_at INTEGER,
  purge_after INTEGER,
  purged_at INTEGER
);

CREATE TABLE workspace_operators (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  removed_at INTEGER
);

CREATE UNIQUE INDEX workspace_operators_live
  ON workspace_operators (workspace_id, user_id)
  WHERE removed_at IS NULL;

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  email TEXT NOT NULL CHECK (email = lower(email) AND length(email) > 0),
  role TEXT NOT NULL CHECK (role IN ('client_owner', 'client_member')),
  invited_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  revoked_at INTEGER
);

CREATE UNIQUE INDEX invites_live_workspace_email
  ON invites (workspace_id, email)
  WHERE revoked_at IS NULL;

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL CHECK (email = lower(email) AND length(email) > 0),
  role TEXT NOT NULL CHECK (role IN ('client_owner', 'client_member')),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE UNIQUE INDEX memberships_live_workspace_user
  ON memberships (workspace_id, user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE request_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  retired_at INTEGER
);

CREATE TABLE request_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES request_templates (id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  guidance TEXT,
  suggested_tag TEXT CHECK (
    suggested_tag IS NULL
    OR suggested_tag IN (
      'brand', 'photo', 'copy', 'data_export', 'reference', 'source', 'other'
    )
  ),
  UNIQUE (template_id, position)
);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  guidance TEXT,
  suggested_tag TEXT CHECK (
    suggested_tag IS NULL
    OR suggested_tag IN (
      'brand', 'photo', 'copy', 'data_export', 'reference', 'source', 'other'
    )
  ),
  due_on INTEGER,
  status TEXT NOT NULL CHECK (status IN ('open', 'received', 'closed')),
  received_at INTEGER,
  closed_at INTEGER,
  UNIQUE (workspace_id, position)
);

CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  request_id TEXT REFERENCES requests (id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL,
  label TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  discarded_at INTEGER,
  deleted_at INTEGER
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches (id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  relative_path TEXT NOT NULL,
  extension TEXT NOT NULL,
  declared_content_type TEXT,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  object_key TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL CHECK (
    tag IN ('brand', 'photo', 'copy', 'data_export', 'reference', 'source', 'other')
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'pending', 'uploading', 'uploaded', 'scanning', 'clean', 'rejected', 'held', 'failed'
    )
  ),
  sha256 TEXT,
  scan_reason TEXT,
  scan_attempts INTEGER NOT NULL DEFAULT 0 CHECK (scan_attempts >= 0),
  next_scan_at INTEGER,
  created_at INTEGER NOT NULL,
  uploaded_at INTEGER,
  scanned_at INTEGER,
  object_deleted_at INTEGER,
  UNIQUE (batch_id, relative_path)
);

CREATE INDEX files_workspace_sha256 ON files (workspace_id, sha256);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  event TEXT NOT NULL,
  recipient_email TEXT NOT NULL CHECK (
    recipient_email = lower(recipient_email) AND length(recipient_email) > 0
  ),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  sent_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  metadata TEXT NOT NULL
);
