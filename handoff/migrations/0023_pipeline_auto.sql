-- auto_continue files each finished page and starts the next stage.
-- brief is the instruction later stages keep, including Facts: and Do not use:.
ALTER TABLE workflow_groups ADD COLUMN auto_continue INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_groups ADD COLUMN brief TEXT;
