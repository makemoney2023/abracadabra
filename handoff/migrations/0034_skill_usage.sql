-- Skill library usage: one row per list, search, read, attach, detach, or cite, by an agent or staff chat.
-- Additive only. Rows are written after the response (best effort); a failed write never fails the request.
-- task_id and work_item_id carry no foreign key on purpose: a deleted card keeps its usage history.
CREATE TABLE skill_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('agent', 'staff', 'system')),
  actor_id TEXT,
  organization_id TEXT,
  task_id TEXT,
  work_item_id TEXT,
  event TEXT NOT NULL CHECK (event IN ('list', 'search', 'read', 'attach', 'detach', 'cite')),
  path TEXT,
  prefix TEXT,
  query TEXT,
  result_count INTEGER,
  status INTEGER,
  library_version TEXT,
  source TEXT NOT NULL
);
CREATE INDEX skill_events_at ON skill_events (at);
CREATE INDEX skill_events_path ON skill_events (path, at);
CREATE INDEX skill_events_prefix ON skill_events (prefix, at);
CREATE INDEX skill_events_task ON skill_events (task_id, event);
CREATE INDEX skill_events_actor ON skill_events (actor_id, at);
-- Skill paths a filing says it followed (POST /api/agent-work skills_used), checked against the published index.
ALTER TABLE agent_work_items ADD COLUMN skills_used_json TEXT NOT NULL DEFAULT '[]';
CREATE INDEX skill_events_work_item ON skill_events (work_item_id);
