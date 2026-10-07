-- Which round clients can see. The working version can move ahead of it.
ALTER TABLE deliverables ADD COLUMN published_version INTEGER;

-- A row that was already sent keeps that round as the one clients can see.
UPDATE deliverables
SET published_version = version
WHERE published_at IS NOT NULL AND published_version IS NULL;
