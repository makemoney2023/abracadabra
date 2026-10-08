-- Client conversations. A work request is one thread of email, Slack, or staff chat.

CREATE TABLE work_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'hq_chat')),
  thread_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('clarifying', 'proposed', 'approved', 'declined')),
  piece_title TEXT,
  goal TEXT,
  due_text TEXT,
  question_count INTEGER NOT NULL DEFAULT 0,
  decided_by TEXT REFERENCES staff(user_id),
  decided_at INTEGER,
  decline_reason TEXT,
  brief_version INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX work_requests_org_state ON work_requests (organization_id, state);
CREATE INDEX work_requests_thread ON work_requests (organization_id, channel, thread_id);

CREATE TABLE slack_channel_links (
  channel_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_at INTEGER NOT NULL
);
