ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX tasks_board ON tasks (organization_id, project_id, stage, status, position);
