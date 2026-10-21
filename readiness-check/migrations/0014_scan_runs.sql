-- Chunked scans: one run row per scan (tier, page limit, progress, planned site files) and one row per chunk of
-- up to 50 planned URLs. New tables only; nothing in readiness_scans / readiness_scan_pages changes.
-- Timestamps are unix milliseconds. Apply to D1 `handoff` before deploying the chunked scan code.
CREATE TABLE IF NOT EXISTS readiness_scan_runs (
  scan_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'free',
  page_limit INTEGER NOT NULL,
  pages_total INTEGER,
  pages_done INTEGER NOT NULL DEFAULT 0,
  chunks_total INTEGER,
  chunks_done INTEGER NOT NULL DEFAULT 0,
  search_count INTEGER NOT NULL DEFAULT 0,
  site_files_json TEXT,
  planned_at INTEGER,
  finalize_claimed_at INTEGER,
  finalized_at INTEGER,
  partial INTEGER NOT NULL DEFAULT 0 CHECK (partial IN (0, 1)),
  watchdog_rounds INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS readiness_scan_chunks (
  scan_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  urls_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  attempts INTEGER NOT NULL DEFAULT 0,
  pages_saved INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scan_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS readiness_scan_pages_scan_url ON readiness_scan_pages (scan_id, url);
