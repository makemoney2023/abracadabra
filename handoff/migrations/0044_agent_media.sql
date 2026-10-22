-- Stills and clips a Grok agent asked HQ to generate. The bytes live in R2 under r2_key.
-- A repeat (agent_id, external_id) returns the first row. The agent never receives a provider URL.
-- task_id is null when the file is not for a card. Generating a file does not post it to social.
CREATE TABLE agent_media (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES client_agents(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  task_id TEXT REFERENCES tasks(id),
  model TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  state TEXT NOT NULL CHECK (state IN ('ready', 'running', 'failed')),
  content_type TEXT,
  byte_length INTEGER,
  r2_key TEXT,
  job_id TEXT,
  name TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (agent_id, external_id)
);

CREATE INDEX agent_media_task ON agent_media (task_id, created_at);
