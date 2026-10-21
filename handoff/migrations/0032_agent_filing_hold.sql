-- Agent filings are held for Client Services review, become deliverable versions, and publish on approval.
-- Additive only. Existing batches keep held_at NULL, so everything already in a space stays visible as it is.
-- A batch is visible to client members when held_at IS NULL or released_at IS NOT NULL, and hidden_at IS NULL.
ALTER TABLE batches ADD COLUMN held_at INTEGER;
ALTER TABLE batches ADD COLUMN released_at INTEGER;
ALTER TABLE batches ADD COLUMN hidden_at INTEGER;
ALTER TABLE batches ADD COLUMN work_item_id TEXT;
ALTER TABLE agent_work_items ADD COLUMN deliverable_id TEXT REFERENCES deliverables(id);
ALTER TABLE agent_work_items ADD COLUMN deliverable_version INTEGER;
ALTER TABLE agent_work_items ADD COLUMN supersedes_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agent_work_items ADD COLUMN superseded_by TEXT;
ALTER TABLE agent_work_items ADD COLUMN released_at INTEGER;
ALTER TABLE agent_work_items ADD COLUMN retracted_at INTEGER;
ALTER TABLE agent_work_items ADD COLUMN retract_reason TEXT;
ALTER TABLE agent_work_items ADD COLUMN work_request_id TEXT REFERENCES client_work_requests(id);
-- Large payloads (attachments) wait in R2 under this key while unfiled, never in a D1 row.
ALTER TABLE agent_work_items ADD COLUMN payload_key TEXT;
-- Which filing a deliverable item came from, so a withdrawn filing drops only its own items.
ALTER TABLE deliverable_items ADD COLUMN work_item_id TEXT;
ALTER TABLE tasks ADD COLUMN work_request_id TEXT REFERENCES client_work_requests(id);
ALTER TABLE client_work_requests ADD COLUMN source_thread_id TEXT;
-- draft (default): approval posts a suggested client update for Client Services to draft in magic@. auto: the
-- existing "is ready" email goes to space members.
ALTER TABLE organizations ADD COLUMN client_update_mode TEXT NOT NULL DEFAULT 'draft' CHECK (client_update_mode IN ('draft', 'auto'));
CREATE INDEX agent_work_items_task ON agent_work_items (task_id, state);
CREATE INDEX batches_work_item ON batches (work_item_id);
