-- Search Console data in HQ, part 1 (PR 1 of the Search Console spec). Additive only: three new tables, no change to existing rows.
-- search_properties: one Google Search Console property (sc-domain:example.com or https://www.example.com/) mapped by staff
-- to exactly one organization. status pending until HQ's service account can see it, active when it can, access_lost when
-- the client removed the service account, paused or removed by staff. inspect_budget is URL Inspection calls per day
-- (default 200, Google allows 2,000). loop_enabled turns the optimization loop on for the property (default off).
-- provider ga4 is reserved for the GA4 phase (site_url then holds properties/<id>).
CREATE TABLE search_properties (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL DEFAULT 'gsc' CHECK (provider IN ('gsc', 'ga4')),
  site_url TEXT NOT NULL CHECK (length(site_url) BETWEEN 3 AND 300),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'access_lost', 'paused', 'removed')),
  permission_level TEXT,
  inspect_budget INTEGER NOT NULL DEFAULT 200 CHECK (inspect_budget BETWEEN 0 AND 1800),
  loop_enabled INTEGER NOT NULL DEFAULT 0 CHECK (loop_enabled IN (0, 1)),
  backfill_state TEXT NOT NULL DEFAULT 'none' CHECK (backfill_state IN ('none', 'running', 'done', 'failed')),
  last_checked_at INTEGER,
  last_success_at INTEGER,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  data_through TEXT,
  mapped_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- A property belongs to one organization at a time. A removed mapping frees the property for a new one.
CREATE UNIQUE INDEX search_properties_site ON search_properties (provider, site_url) WHERE status <> 'removed';
CREATE INDEX search_properties_org ON search_properties (organization_id);

-- One pull job (daily, backfill, inspect, sitemaps). Written by the sync pipeline (PR 2); created here so the schema lands once.
CREATE TABLE search_sync_runs (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES search_properties(id),
  kind TEXT NOT NULL CHECK (kind IN ('daily', 'backfill', 'inspect', 'sitemaps')),
  day TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  rows_written INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX search_sync_runs_property ON search_sync_runs (property_id, created_at);

-- Who besides client owners may see search data in a space (Christopher, 2026-10-24: owners only, others by invitation).
-- Owners always can. No live row means no access. A grant names a live membership, or a pending invite whose
-- membership_id is filled in when the invite is accepted. Read by search.view in PR 3; no reader in PR 1.
CREATE TABLE search_access_grants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  membership_id TEXT REFERENCES memberships(id),
  invite_id TEXT REFERENCES invites(id),
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (membership_id IS NOT NULL OR invite_id IS NOT NULL)
);
CREATE UNIQUE INDEX search_access_grants_live ON search_access_grants (workspace_id, membership_id) WHERE revoked_at IS NULL AND membership_id IS NOT NULL;
CREATE INDEX search_access_grants_invite ON search_access_grants (invite_id);
