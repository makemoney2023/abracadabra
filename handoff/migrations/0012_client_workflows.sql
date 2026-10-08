-- Workflow groups belong to a client and can belong to a project.
-- A workflow in a group can be assigned to a project of that same client.

CREATE TABLE workflow_groups (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX workflow_groups_org ON workflow_groups (organization_id, project_id);

CREATE TABLE client_workflows (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES workflow_groups(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  last_execution_id TEXT,
  last_status TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX client_workflows_org ON client_workflows (organization_id, project_id);
