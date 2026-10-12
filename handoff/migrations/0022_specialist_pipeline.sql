-- Specialist pipeline stages. stage_order is the line. accepted_at unlocks the next stage.
ALTER TABLE workflow_groups ADD COLUMN pipeline TEXT;
ALTER TABLE workflow_groups ADD COLUMN started_by TEXT;
ALTER TABLE client_workflows ADD COLUMN stage_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_workflows ADD COLUMN kind TEXT;
ALTER TABLE client_workflows ADD COLUMN skill_path TEXT;
ALTER TABLE client_workflows ADD COLUMN accepted_at INTEGER;
ALTER TABLE client_workflows ADD COLUMN last_receipt TEXT;
