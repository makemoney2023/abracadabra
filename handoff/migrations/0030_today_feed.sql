-- Today feed cleanup (HQ Today screen). Additive only.
-- is_internal: a test, internal, or vendor organization. Today, the Pipeline panel and lead counts hide it.
-- Staff can flip it on the client's Settings tab. The backfill flags the obvious test names and the two vendor
-- mailers that intake turned into leads (domains muapi.ai and mail.cursor.com). Nothing is deleted.
ALTER TABLE organizations ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0 CHECK (is_internal IN (0, 1));

UPDATE organizations SET is_internal = 1
WHERE is_internal = 0
  AND (
    name LIKE 'TEST E2E%'
    OR name LIKE 'E2E Test%'
    OR name LIKE '%internal test%'
    OR name LIKE '%(delete me)%'
    OR name LIKE '%DO NOT CONTACT%'
    OR domain IN ('muapi.ai', 'mail.cursor.com')
  );

-- Last successful agent wake. A wake-failure alert on Today clears once this is newer than the last failure.
ALTER TABLE organizations ADD COLUMN agent_wake_ok_at INTEGER;

-- Per staff user: what Today counts as new. last_visit_at is the latest load; seen_at is where "new" starts.
CREATE TABLE staff_feed_seen (
  user_id TEXT PRIMARY KEY,
  seen_at INTEGER,
  last_visit_at INTEGER NOT NULL
);
