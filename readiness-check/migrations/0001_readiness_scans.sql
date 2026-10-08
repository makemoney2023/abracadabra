-- Public URL scans and ops prospect scans. Timestamps are unix milliseconds.
-- organization_id points at the Handoff CRM lead when a site needs a follow-up.

CREATE TABLE IF NOT EXISTS readiness_scans (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  origin TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('public', 'ops')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  organization_id TEXT,
  score_total INTEGER,
  score_breakdown_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS readiness_scans_domain_created
  ON readiness_scans (domain, source, created_at);

CREATE TABLE IF NOT EXISTS readiness_scan_pages (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL,
  fetch_status TEXT NOT NULL,
  has_json_ld INTEGER NOT NULL CHECK (has_json_ld IN (0, 1)),
  schema_types_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS readiness_scan_pages_scan ON readiness_scan_pages (scan_id);

CREATE TABLE IF NOT EXISTS readiness_scan_findings (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  page_url TEXT,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  message TEXT NOT NULL,
  evidence_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS readiness_scan_findings_scan ON readiness_scan_findings (scan_id);
