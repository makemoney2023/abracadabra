CREATE TABLE swarm_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  workflow_id TEXT REFERENCES client_workflows(id),
  swarm_workflow_id TEXT,
  execution_id TEXT,
  template_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'not_started')),
  trigger TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE UNIQUE INDEX swarm_runs_execution
  ON swarm_runs (execution_id)
  WHERE execution_id IS NOT NULL AND length(execution_id) > 0;

CREATE INDEX swarm_runs_project_started
  ON swarm_runs (project_id, started_at);

CREATE INDEX swarm_runs_org_started
  ON swarm_runs (organization_id, started_at);
