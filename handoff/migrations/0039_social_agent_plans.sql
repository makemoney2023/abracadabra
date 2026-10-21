-- Agent-managed social publishing. Additive only.
-- Plans, confirmations, and idempotency keys are the shared command record for staff, clients, HQ chat, and Grok agents.
CREATE TABLE social_collections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  deliverable_id TEXT REFERENCES deliverables(id),
  name TEXT NOT NULL,
  goal TEXT,
  starts_at INTEGER,
  ends_at INTEGER,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'active', 'complete', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX social_collections_org ON social_collections (organization_id, status, updated_at);
CREATE TABLE social_variants (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES deliverable_items(id),
  version INTEGER NOT NULL,
  platform TEXT NOT NULL,
  caption TEXT,
  first_comment TEXT,
  title TEXT,
  tags_json TEXT,
  post_type TEXT CHECK (post_type IS NULL OR post_type IN ('feed', 'carousel', 'reel', 'story', 'short')),
  options_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by_kind TEXT NOT NULL CHECK (updated_by_kind IN ('staff', 'client', 'agent', 'system')),
  updated_by_id TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE (item_id, version, platform)
);
CREATE INDEX social_variants_item ON social_variants (item_id, version);
CREATE TABLE social_publish_plans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff', 'client', 'agent', 'system')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  request_json TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  blocked_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  plan_hash TEXT NOT NULL,
  authorization TEXT NOT NULL CHECK (authorization IN ('allowed', 'confirmation_required', 'denied')),
  expires_at INTEGER NOT NULL,
  executed_at INTEGER,
  result_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX social_publish_plans_org ON social_publish_plans (organization_id, created_at);
CREATE TABLE social_action_idempotency (
  id TEXT PRIMARY KEY,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_id TEXT,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (actor_kind, actor_id, external_id)
);
CREATE TABLE social_agent_policies (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  mode TEXT NOT NULL DEFAULT 'draft' CHECK (mode IN ('observe', 'draft', 'schedule_approved', 'managed')),
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE social_confirmations (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES social_publish_plans(id),
  plan_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  approver_kind TEXT NOT NULL CHECK (approver_kind IN ('staff', 'client', 'agent', 'system')),
  approver_id TEXT NOT NULL,
  note TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX social_confirmations_plan ON social_confirmations (plan_id, action);
CREATE TABLE social_attention_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  recovery_action TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE (organization_id, source_kind, source_id, target)
);
CREATE INDEX social_attention_open ON social_attention_items (organization_id, status, created_at);
CREATE TABLE social_post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES social_posts(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'uncertain', 'not_attempted', 'scheduled', 'publishing')),
  public_url TEXT,
  provider_status TEXT,
  error TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE (post_id, account_id)
);
CREATE INDEX social_post_targets_org ON social_post_targets (organization_id, outcome, updated_at);
