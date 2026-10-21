-- The folder an agent filed into ("Social/Facebook", or the default "Finished work/<date> <title>").
-- Additive only. Files already carry their folder in relative_path; this keeps it on the filing for listings.
ALTER TABLE agent_work_items ADD COLUMN folder TEXT;
CREATE INDEX agent_work_items_folder ON agent_work_items (workspace_id, folder);
