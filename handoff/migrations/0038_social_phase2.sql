-- Social publishing, phases 2 and 3. Additive only.
-- published_urls: JSON object of accountId -> public post URL, filled by Zernio webhooks and refreshes.
-- social_piece_settings: per-piece overrides kept with the piece: text per network, first comment, YouTube tags.
-- social_webhook_events: Zernio event ids already handled (dedupe; Zernio retries with the same id).
-- social_autopost: per-client auto-schedule. A piece the client approves is scheduled in the next free slot.
ALTER TABLE social_posts ADD COLUMN published_urls TEXT;
CREATE TABLE social_piece_settings (
  item_id TEXT PRIMARY KEY REFERENCES deliverable_items(id),
  texts_json TEXT NOT NULL DEFAULT '{}',
  first_comment TEXT,
  tags TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE social_webhook_events (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE TABLE social_autopost (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  account_ids TEXT NOT NULL DEFAULT '[]',
  weekdays TEXT NOT NULL DEFAULT '1,2,3,4,5',
  times TEXT NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
