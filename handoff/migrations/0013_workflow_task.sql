-- The task whose skill steps the work wake runs for this workflow.
ALTER TABLE client_workflows ADD COLUMN task_id TEXT REFERENCES tasks(id);
