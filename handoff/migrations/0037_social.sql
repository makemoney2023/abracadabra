-- Social publishing through Zernio. Additive only.
-- social_profiles: one Zernio profile per client (externalId on Zernio is organizations.id).
-- social_accounts: cache of the accounts and blog sites connected to that profile. Zernio is the source of truth.
-- social_posts: each send of one finished-work piece. The row is written before the Zernio call, so a failed send
-- stays visible (status failed) and a retry never double-posts a row that already has a zernio_post_id.
CREATE TABLE social_profiles (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  zernio_profile_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE social_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  platform TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  synced_at INTEGER NOT NULL
);
CREATE INDEX social_accounts_org ON social_accounts (organization_id, platform);
CREATE TABLE social_posts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  item_id TEXT NOT NULL REFERENCES deliverable_items(id),
  version INTEGER NOT NULL,
  account_ids TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('draft', 'scheduled', 'now')),
  post_type TEXT NOT NULL CHECK (post_type IN ('feed', 'carousel', 'reel', 'story', 'short')),
  skipped TEXT,
  scheduled_for INTEGER,
  timezone TEXT,
  status TEXT NOT NULL CHECK (status IN ('sending', 'draft', 'scheduled', 'published', 'partial', 'failed')),
  zernio_post_id TEXT,
  error TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX social_posts_item ON social_posts (item_id, created_at);
CREATE INDEX social_posts_org ON social_posts (organization_id, created_at);
