-- Client work requests from Client Services, and the report-back feed it pulls.
-- state: needs_approval (unknown client, ambiguous match, or too big), accepted (task on the board), declined.
CREATE TABLE client_work_requests (
  id TEXT PRIMARY KEY,
  source_message_id TEXT NOT NULL UNIQUE,
  organization_id TEXT REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  workspace_id TEXT REFERENCES workspaces(id),
  task_id TEXT REFERENCES tasks(id),
  client_email TEXT,
  client_domain TEXT,
  subject TEXT NOT NULL,
  brief TEXT NOT NULL,
  deliverables_json TEXT NOT NULL DEFAULT '[]',
  deadline TEXT,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  project_hint TEXT,
  estimate_hours INTEGER,
  size TEXT,
  state TEXT NOT NULL CHECK (state IN ('needs_approval', 'accepted', 'declined')),
  match_kind TEXT,
  approval_reason TEXT,
  decided_by TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX client_work_requests_state ON client_work_requests (state, created_at);

CREATE TABLE client_service_updates (
  id TEXT PRIMARY KEY,
  activity_id TEXT UNIQUE,
  organization_id TEXT REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  workspace_id TEXT REFERENCES workspaces(id),
  work_request_id TEXT REFERENCES client_work_requests(id),
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  links_json TEXT NOT NULL DEFAULT '[]',
  needs_review_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE INDEX client_service_updates_created ON client_service_updates (created_at);
