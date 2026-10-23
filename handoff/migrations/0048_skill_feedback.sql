-- Did a skill help? One row per skill an agent rated on a filing (POST /api/agent-work skill_feedback).
-- Additive only: a new table, nothing existing changes. Rows are written after the response (best effort).
-- task_id and work_item_id carry no foreign key on purpose: a deleted card keeps its feedback.
CREATE TABLE skill_feedback (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  agent_id TEXT,
  organization_id TEXT,
  task_id TEXT,
  work_item_id TEXT,
  path TEXT NOT NULL,
  prefix TEXT NOT NULL,
  useful INTEGER NOT NULL CHECK (useful IN (0, 1)),
  note TEXT,
  source TEXT NOT NULL
);
CREATE INDEX skill_feedback_at ON skill_feedback (at);
CREATE INDEX skill_feedback_path ON skill_feedback (path, at);
CREATE INDEX skill_feedback_prefix ON skill_feedback (prefix, at);
CREATE INDEX skill_feedback_work_item ON skill_feedback (work_item_id);
