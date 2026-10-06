-- Readiness Check tables in the shared handoff D1 database.
-- Names stay prefixed so they do not collide with CRM tables.
-- intake_receipts already exists from the CRM migration and is not created here.

CREATE TABLE IF NOT EXISTS rc_leads (
  id TEXT PRIMARY KEY,
  name TEXT,
  domain TEXT NOT NULL UNIQUE,
  website TEXT,
  industry TEXT,
  source TEXT NOT NULL DEFAULT 'findall',
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS rc_contacts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  name TEXT,
  title TEXT,
  email TEXT,
  phone TEXT,
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS rc_scans (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  origin TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('public', 'ops')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  public_token TEXT NOT NULL UNIQUE,
  lead_id TEXT,
  score_total INTEGER,
  score_breakdown TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS rc_scans_domain_created_idx ON rc_scans (domain, created_at);

CREATE TABLE IF NOT EXISTS rc_scan_pages (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'other',
  fetch_status TEXT NOT NULL DEFAULT 'pending' CHECK (fetch_status IN ('pending', 'ok', 'failed', 'unknown')),
  has_json_ld INTEGER NOT NULL DEFAULT 0,
  schema_types TEXT NOT NULL DEFAULT '[]',
  evidence TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS rc_scan_findings (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  page_id TEXT,
  code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  passed INTEGER NOT NULL,
  message TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS rc_scan_unlocks (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (scan_id, email)
);

CREATE TABLE IF NOT EXISTS rc_ops_queue (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE,
  latest_scan_id TEXT,
  assessment_id TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'skipped', 'booked')),
  priority_score REAL NOT NULL DEFAULT 0,
  missing_contact INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status_changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS rc_ops_status_audit (
  id TEXT PRIMARY KEY,
  ops_queue_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS rc_assessments (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  config_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  lead_id TEXT,
  scan_id TEXT,
  domain TEXT,
  email TEXT,
  name TEXT,
  answers TEXT NOT NULL DEFAULT '{}',
  qualifiers TEXT NOT NULL DEFAULT '{}',
  scores TEXT,
  utm TEXT NOT NULL DEFAULT '{}',
  current_step TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  opted_in_at TEXT
);

CREATE TABLE IF NOT EXISTS rc_assessment_events (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS rc_appointments (
  id TEXT PRIMARY KEY,
  assessment_id TEXT,
  lead_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'rescheduled', 'cancelled', 'completed', 'no_show')),
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS rc_scan_pages_scan_id_idx ON rc_scan_pages (scan_id);
CREATE INDEX IF NOT EXISTS rc_scan_findings_scan_id_idx ON rc_scan_findings (scan_id);
CREATE INDEX IF NOT EXISTS rc_scan_unlocks_scan_id_idx ON rc_scan_unlocks (scan_id);
CREATE INDEX IF NOT EXISTS rc_contacts_lead_id_idx ON rc_contacts (lead_id);
CREATE INDEX IF NOT EXISTS rc_ops_queue_status_idx ON rc_ops_queue (status);
CREATE INDEX IF NOT EXISTS rc_assessments_domain_idx ON rc_assessments (domain);
CREATE INDEX IF NOT EXISTS rc_assessments_lead_id_idx ON rc_assessments (lead_id);
CREATE INDEX IF NOT EXISTS rc_assessment_events_assessment_id_idx ON rc_assessment_events (assessment_id);
CREATE INDEX IF NOT EXISTS rc_appointments_lead_id_idx ON rc_appointments (lead_id);
