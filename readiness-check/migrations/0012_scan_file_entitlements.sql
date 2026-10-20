-- Paid access to the generated fix files for one public scan.
-- One row per scan. Written only after the payment provider confirms payment
-- (signed webhook or server-side session retrieval). Timestamps are unix milliseconds.

CREATE TABLE IF NOT EXISTS readiness_scan_entitlements (
  scan_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  checkout_session_id TEXT NOT NULL UNIQUE,
  payment_status TEXT NOT NULL,
  amount_total INTEGER,
  currency TEXT,
  created_at INTEGER NOT NULL
);
