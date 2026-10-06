-- Read notes and project keys for one space. Tokens are stored as SHA-256 hex.
CREATE TABLE file_reads (
  file_id TEXT PRIMARY KEY REFERENCES files (id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'ready', 'skipped', 'failed')),
  summary TEXT,
  reason TEXT,
  source_sha TEXT,
  read_at INTEGER
);

CREATE TABLE file_passages (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files (id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  body TEXT NOT NULL,
  embedding TEXT NOT NULL,
  UNIQUE (file_id, position)
);

CREATE INDEX file_passages_workspace ON file_passages (workspace_id);

CREATE TABLE knowledge_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX knowledge_keys_workspace ON knowledge_keys (workspace_id);
