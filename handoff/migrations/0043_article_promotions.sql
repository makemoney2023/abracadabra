-- Local article promotion drafts. Creating one does not call the social provider.
CREATE TABLE article_promotion_idempotency (
  id TEXT PRIMARY KEY,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (actor_kind, actor_id, external_id)
);
CREATE INDEX article_promotion_idempotency_source ON article_promotion_idempotency (source_item_id, source_version);
