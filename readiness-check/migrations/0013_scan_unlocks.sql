-- Email unlocks for the page-by-page matrix and PDF (moved from Supabase scan_unlocks).
-- One row per (scan, email); repeat unlocks are no-ops. Timestamps are unix milliseconds.
CREATE TABLE IF NOT EXISTS readiness_scan_unlocks (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (scan_id, email)
);

CREATE INDEX IF NOT EXISTS readiness_scan_unlocks_scan ON readiness_scan_unlocks (scan_id);
