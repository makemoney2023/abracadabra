-- Staff schema checks. Every named site is stored. A needs-us site also becomes a lead.

CREATE TABLE IF NOT EXISTS schema_checks (
  id TEXT PRIMARY KEY,
  objective TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  error_message TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS schema_check_sites (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  name TEXT,
  website TEXT,
  verdict TEXT NOT NULL CHECK (verdict IN ('needs_us', 'covered', 'unread')),
  answer TEXT,
  organization_id TEXT,
  contacts_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS schema_check_sites_check ON schema_check_sites (check_id);
