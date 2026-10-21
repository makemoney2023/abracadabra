-- Read-only Library view links. Tokens and passcodes are stored only as hashes.
CREATE TABLE library_shares (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  token_hash TEXT NOT NULL UNIQUE,
  title TEXT,
  expires_at INTEGER,
  revoked_at INTEGER,
  passcode_hash TEXT,
  allow_downloads INTEGER NOT NULL DEFAULT 0 CHECK (allow_downloads IN (0, 1)),
  show_external_links INTEGER NOT NULL DEFAULT 1 CHECK (show_external_links IN (0, 1)),
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX library_shares_workspace ON library_shares (workspace_id, created_at);

CREATE TABLE library_share_items (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL REFERENCES library_shares(id) ON DELETE RESTRICT,
  public_id TEXT NOT NULL,
  resource_kind TEXT NOT NULL CHECK (resource_kind IN ('deliverable_item', 'built_work', 'file')),
  resource_id TEXT NOT NULL,
  resource_version INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE (share_id, public_id),
  UNIQUE (share_id, resource_kind, resource_id, resource_version)
);
CREATE INDEX library_share_items_share ON library_share_items (share_id, sort);

CREATE TABLE library_share_events (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL REFERENCES library_shares(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('created', 'opened', 'downloaded', 'updated', 'revoked')),
  at INTEGER NOT NULL,
  user_agent TEXT,
  ip_hash TEXT
);
CREATE INDEX library_share_events_share ON library_share_events (share_id, at);

CREATE TABLE library_share_unlock_attempts (
  share_id TEXT NOT NULL REFERENCES library_shares(id) ON DELETE RESTRICT,
  ip_hash TEXT NOT NULL,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  blocked_until INTEGER,
  PRIMARY KEY (share_id, ip_hash)
);

CREATE TABLE library_share_unlock_sessions (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL REFERENCES library_shares(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX library_share_unlock_sessions_share ON library_share_unlock_sessions (share_id, expires_at);
