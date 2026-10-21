-- Built work: websites and other things we built, filed by agents (POST /api/agent-work built_work) and shown as cards
-- in the client space. Additive only. Visibility follows the filing's batch: held until Client Services approves,
-- hidden when the filing is superseded or withdrawn. The screenshot is a file of that batch (stored in R2).
-- Work finished before it was filed (already_delivered: true, or kind "catalog"): approval publishes it as approved
-- (delivered), not in_review, and posts no client update.
ALTER TABLE agent_work_items ADD COLUMN already_delivered INTEGER NOT NULL DEFAULT 0 CHECK (already_delivered IN (0, 1));
CREATE TABLE built_work (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES agent_work_items(id),
  batch_id TEXT REFERENCES batches(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT REFERENCES projects(id),
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  live_url TEXT,
  preview_url TEXT,
  repo_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'preview', 'in_progress', 'archived')),
  screenshot_file_id TEXT REFERENCES files(id),
  created_at INTEGER NOT NULL,
  CHECK (live_url IS NOT NULL OR preview_url IS NOT NULL)
);
CREATE INDEX built_work_item ON built_work (work_item_id);
CREATE INDEX built_work_space ON built_work (workspace_id, created_at);
