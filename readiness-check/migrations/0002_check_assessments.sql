-- In-progress readiness questionnaire. Separate from the CRM `assessments` table,
-- which only stores a finished check. Timestamps are ISO-8601 text.

CREATE TABLE IF NOT EXISTS check_assessments (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  config_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  lead_id TEXT,
  scan_id TEXT,
  domain TEXT,
  email TEXT,
  name TEXT,
  answers_json TEXT NOT NULL DEFAULT '{}',
  qualifiers_json TEXT NOT NULL DEFAULT '{}',
  scores_json TEXT,
  utm_json TEXT NOT NULL DEFAULT '{}',
  current_step TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  opted_in_at TEXT
);

CREATE INDEX IF NOT EXISTS check_assessments_domain ON check_assessments (domain);

CREATE TABLE IF NOT EXISTS check_assessment_events (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS check_assessment_events_assessment ON check_assessment_events (assessment_id, created_at);
