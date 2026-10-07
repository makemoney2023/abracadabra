-- Agent stages, briefs, and cloud runs.
-- Timestamps are unix milliseconds. Booleans are 0 or 1.

PRAGMA foreign_keys = OFF;

CREATE TABLE deliverables_next (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('social_pack', 'website', 'document', 'brief', 'design_system', 'other')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'changes_requested', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  source_repo_id TEXT REFERENCES repos(id),
  source_ref TEXT,
  published_at INTEGER,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff', 'agent', 'system')),
  actor_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_version INTEGER
);

INSERT INTO deliverables_next (
  id, organization_id, project_id, workspace_id, title, kind, status, version,
  source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at,
  updated_at, published_version
)
SELECT
  id, organization_id, project_id, workspace_id, title, kind, status, version,
  source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at,
  updated_at, published_version
FROM deliverables;

DROP TABLE deliverables;

ALTER TABLE deliverables_next RENAME TO deliverables;

CREATE INDEX deliverables_workspace_status ON deliverables (workspace_id, status, published_at);

PRAGMA foreign_keys = ON;

ALTER TABLE tasks ADD COLUMN stage TEXT NOT NULL DEFAULT 'describe'
  CHECK (stage IN ('describe', 'engineer', 'build', 'run'));
ALTER TABLE tasks ADD COLUMN deliverable_id TEXT REFERENCES deliverables(id);
ALTER TABLE tasks ADD COLUMN cursor_agent_id TEXT;
ALTER TABLE tasks ADD COLUMN build_deadline_at INTEGER;
ALTER TABLE tasks ADD COLUMN skills_json TEXT;
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN round INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN created_by_kind TEXT NOT NULL DEFAULT 'staff'
  CHECK (created_by_kind IN ('staff', 'agent'));

CREATE INDEX tasks_stage_cursor ON tasks (stage, cursor_agent_id);
CREATE INDEX tasks_org_stage ON tasks (organization_id, stage, status);

ALTER TABLE organizations ADD COLUMN brief_approval TEXT NOT NULL DEFAULT 'client'
  CHECK (brief_approval IN ('client', 'staff'));
ALTER TABLE organizations ADD COLUMN auto_publish_built INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN agent_paused_at INTEGER;

ALTER TABLE knowledge_keys ADD COLUMN organization_id TEXT REFERENCES organizations(id);

CREATE TABLE agent_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  task_id TEXT REFERENCES tasks(id),
  deliverable_id TEXT REFERENCES deliverables(id),
  question TEXT NOT NULL,
  options_json TEXT,
  answer TEXT,
  answered_by TEXT REFERENCES staff(user_id),
  asked_at INTEGER NOT NULL,
  answered_at INTEGER
);

CREATE INDEX agent_questions_open ON agent_questions (organization_id, answered_at);

CREATE TABLE cloud_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  repo_id TEXT NOT NULL REFERENCES repos(id),
  round INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'pr_open', 'pulled', 'failed', 'expired')),
  branch TEXT,
  pr_number INTEGER,
  head_sha TEXT,
  started_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  finished_at INTEGER,
  error TEXT
);

CREATE INDEX cloud_runs_open ON cloud_runs (status, deadline_at);

CREATE TABLE agent_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO agent_settings (key, value) VALUES ('max_cloud_runs', '4');
INSERT INTO agent_settings (key, value) VALUES ('build_deadline_hours', '2');

CREATE TABLE deliverable_notices (
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  version INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (deliverable_id, version)
);
