-- Search Console facts (PR 2 of the Search Console spec). This file belongs to the handoff-search D1 database
-- (binding SEARCH_DB), not to handoff. migrateSearch() in src/db/migrate-search.ts applies it after deploy.
-- Every fact row carries organization_id and property_id (search_properties.id in the handoff database).
-- Position is stored as an impression-weighted sum so any roll-up is exact: average position = pos_sum / impressions.

-- Dimension tables: one id per distinct query text and page URL per property.
CREATE TABLE search_queries (
  id INTEGER PRIMARY KEY,
  property_id TEXT NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (property_id, text)
);
-- in_sitemap and sitemap_lastmod come from the property's public sitemap. sitemap_changed_at is set when a URL is new
-- in the sitemap or its lastmod changed, so URL Inspection checks it first.
CREATE TABLE search_pages (
  id INTEGER PRIMARY KEY,
  property_id TEXT NOT NULL,
  url TEXT NOT NULL,
  in_sitemap INTEGER NOT NULL DEFAULT 0,
  sitemap_lastmod TEXT,
  sitemap_seen_at INTEGER,
  sitemap_changed_at INTEGER,
  UNIQUE (property_id, url)
);

-- Daily facts, one Google request per day each. is_final is 0 for the last 3 days (Google may still change them).
CREATE TABLE search_daily_site (
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  day TEXT NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'web',
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  pos_sum REAL NOT NULL,
  is_final INTEGER NOT NULL,
  PRIMARY KEY (property_id, search_type, day)
);
CREATE INDEX search_daily_site_org ON search_daily_site (organization_id, property_id, day);

CREATE TABLE search_daily_page (
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  day TEXT NOT NULL,
  page_id INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  pos_sum REAL NOT NULL,
  PRIMARY KEY (property_id, day, page_id)
);
CREATE INDEX search_daily_page_org ON search_daily_page (organization_id, property_id, day);

CREATE TABLE search_daily_query (
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  day TEXT NOT NULL,
  query_id INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  pos_sum REAL NOT NULL,
  PRIMARY KEY (property_id, day, query_id)
);
CREATE INDEX search_daily_query_org ON search_daily_query (organization_id, property_id, day);

-- Top 5,000 query x page rows per day by impressions. The full set goes to R2 under search-raw/.
CREATE TABLE search_daily_query_page (
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  day TEXT NOT NULL,
  query_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  pos_sum REAL NOT NULL,
  PRIMARY KEY (property_id, day, query_id, page_id)
);
CREATE INDEX search_daily_query_page_org ON search_daily_query_page (organization_id, property_id, day);

CREATE TABLE search_daily_segment (
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  device TEXT NOT NULL,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  pos_sum REAL NOT NULL,
  PRIMARY KEY (property_id, day, country, device)
);
CREATE INDEX search_daily_segment_org ON search_daily_segment (organization_id, property_id, day);

-- Monthly roll-ups, kept 36 months. Daily rows are rolled up, then deleted, once a whole month is older than 16 months.
CREATE TABLE search_monthly_site (
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  month TEXT NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'web',
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  pos_sum REAL NOT NULL,
  PRIMARY KEY (property_id, search_type, month)
);
CREATE INDEX search_monthly_site_org ON search_monthly_site (organization_id, property_id, month);

CREATE TABLE search_monthly_page (
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  month TEXT NOT NULL,
  page_id INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  pos_sum REAL NOT NULL,
  PRIMARY KEY (property_id, month, page_id)
);
CREATE INDEX search_monthly_page_org ON search_monthly_page (organization_id, property_id, month);

CREATE TABLE search_monthly_query (
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  month TEXT NOT NULL,
  query_id INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  pos_sum REAL NOT NULL,
  PRIMARY KEY (property_id, month, query_id)
);
CREATE INDEX search_monthly_query_org ON search_monthly_query (organization_id, property_id, month);

-- A month is rolled up once. A retention run that stops halfway does not roll up again from half-deleted rows.
CREATE TABLE search_rollups (
  property_id TEXT NOT NULL,
  month TEXT NOT NULL,
  rolled_at INTEGER NOT NULL,
  PRIMARY KEY (property_id, month)
);

CREATE TABLE search_sitemaps (
  property_id TEXT NOT NULL,
  path TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  last_submitted TEXT,
  last_downloaded TEXT,
  is_pending INTEGER,
  errors INTEGER,
  warnings INTEGER,
  submitted_urls INTEGER,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (property_id, path)
);

-- Latest URL Inspection result per page, and each change of state.
CREATE TABLE search_url_state (
  property_id TEXT NOT NULL,
  page_id INTEGER NOT NULL,
  organization_id TEXT NOT NULL,
  verdict TEXT,
  coverage_state TEXT,
  indexing_state TEXT,
  robots_state TEXT,
  fetch_state TEXT,
  google_canonical TEXT,
  user_canonical TEXT,
  last_crawl_at TEXT,
  inspected_at INTEGER NOT NULL,
  PRIMARY KEY (property_id, page_id)
);
CREATE INDEX search_url_state_inspected ON search_url_state (property_id, inspected_at);

CREATE TABLE search_url_events (
  id INTEGER PRIMARY KEY,
  property_id TEXT NOT NULL,
  page_id INTEGER NOT NULL,
  organization_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX search_url_events_property ON search_url_events (organization_id, property_id, at);

-- Global Google API throttle: calls per UTC minute across every property and every consumer run.
CREATE TABLE search_api_minute (
  minute INTEGER PRIMARY KEY,
  calls INTEGER NOT NULL
);
