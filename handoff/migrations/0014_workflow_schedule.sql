-- When a workflow should run next. scheduled_at keeps its task off the skill wake.
ALTER TABLE client_workflows ADD COLUMN next_run_at INTEGER;
ALTER TABLE client_workflows ADD COLUMN every_ms INTEGER;
ALTER TABLE client_workflows ADD COLUMN scheduled_at INTEGER;
