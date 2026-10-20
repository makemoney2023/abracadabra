-- Client agents (Grok Bot teammates and hires), what they are assigned to, the work they file, and the skills they may read.
-- An agent authenticates with its own token (stored as SHA-256 hex). Client Services issues it and sets assignments.
CREATE TABLE client_agents (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 2 AND 64 AND id NOT GLOB '*[^a-z0-9-]*'),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);

-- A client can have many agents (a lead agent plus hires); an agent can serve several clients.
CREATE TABLE agent_assignments (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES client_agents(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  workspace_id TEXT REFERENCES workspaces(id),
  project_id TEXT REFERENCES projects(id),
  role TEXT NOT NULL DEFAULT 'lead' CHECK (role IN ('lead', 'hire')),
  assigned_by TEXT,
  assigned_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE UNIQUE INDEX agent_assignments_live ON agent_assignments (agent_id, organization_id) WHERE ended_at IS NULL;
CREATE INDEX agent_assignments_org ON agent_assignments (organization_id, ended_at);

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
  task_closed INTEGER NOT NULL DEFAULT 0 CHECK (task_closed IN (0, 1)),
  handoff_to TEXT REFERENCES client_agents(id),
  handoff_note TEXT,
  route TEXT,
  unfiled_reason TEXT,
  suggested_organization_id TEXT REFERENCES organizations(id),
  payload_json TEXT,
  context_md TEXT,
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
CREATE INDEX agent_work_items_org ON agent_work_items (organization_id, state, filed_at);
CREATE INDEX agent_work_items_handoff ON agent_work_items (handoff_to, state);

-- Read access to skill paths in the handoff-skills bucket, by path prefix (e.g. community/marketingskills/).
-- A grant names an agent, a client (every agent assigned to it), or both.
CREATE TABLE skill_grants (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES client_agents(id),
  organization_id TEXT REFERENCES organizations(id),
  prefix TEXT NOT NULL,
  granted_by TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (agent_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE INDEX skill_grants_agent ON skill_grants (agent_id, revoked_at);
CREATE INDEX skill_grants_org ON skill_grants (organization_id, revoked_at);
