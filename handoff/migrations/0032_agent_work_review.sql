-- Agent filings wait for Client Services before client members see them. Additive only.
-- batches.held_at set: client members don't see the batch or its files. Staff and the space's operators still do.
-- Client Services approval clears it. NULL is every batch filed before this, so nothing old is hidden.
ALTER TABLE batches ADD COLUMN held_at INTEGER;

-- review_state NULL: filed before review existed, already visible. held waits on Client Services.
-- approved is published to the client. superseded, retracted, and discarded never reach the client.
ALTER TABLE agent_work_items ADD COLUMN review_state TEXT CHECK (review_state IS NULL OR review_state IN ('held', 'approved', 'superseded', 'retracted', 'discarded'));
ALTER TABLE agent_work_items ADD COLUMN deliverable_id TEXT REFERENCES deliverables(id);
ALTER TABLE agent_work_items ADD COLUMN folder TEXT;
ALTER TABLE agent_work_items ADD COLUMN superseded_by TEXT;
ALTER TABLE agent_work_items ADD COLUMN reviewed_at INTEGER;

CREATE INDEX agent_work_items_review ON agent_work_items (task_id, review_state);
