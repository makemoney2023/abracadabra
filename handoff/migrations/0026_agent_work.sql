-- Client agents (one per client) and the finished work they file into HQ.
-- A client agent authenticates with its own token (stored as SHA-256 hex). Client Services assigns it to one client.
CREATE TABLE client_agents (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 2 AND 64 AND id NOT GLOB '*[^a-z0-9-]*'),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  organization_id TEXT REFERENCES organizations(id),
  workspace_id TEXT REFERENCES workspaces(id),
  project_id TEXT REFERENCES projects(id),
  assigned_by TEXT,
  assigned_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX client_agents_org ON client_agents (organization_id);

-- state: received (being filed), filed (in a space), unfiled (waits for staff, never guessed), discarded.
CREATE TABLE agent_work_items (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES client_agents(id),
  external_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('received', 'filed', 'unfiled', 'discarded')),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  organization_id TEXT REFERENCES organizations(id),
  workspace_id TEXT REFERENCES workspaces(id),
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  route TEXT,
  unfiled_reason TEXT,
  suggested_organization_id TEXT REFERENCES organizations(id),
  payload_json TEXT,
  links_json TEXT NOT NULL DEFAULT '[]',
  batch_id TEXT,
  paths_json TEXT NOT NULL DEFAULT '[]',
  filed_by TEXT,
  filed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (agent_id, external_id)
);

CREATE INDEX agent_work_items_state ON agent_work_items (state, created_at);
CREATE INDEX agent_work_items_workspace ON agent_work_items (workspace_id, created_at);
