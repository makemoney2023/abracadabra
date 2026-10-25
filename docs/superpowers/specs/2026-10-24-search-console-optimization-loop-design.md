# Spec: Search Console data + optimization loop in HQ

Status: **SPEC v2 (Oct 24, 2026). All five review decisions are made (see section 15). Ready for Christopher's build OK.** Nothing is built, migrated, deployed, or set up in Google Cloud or Cloudflare until Christopher approves the build, and each production step, in his own words.
Requested by SEO & Analytics. Christopher: "Yes go ahead and get the engineering lead to spec it out".
Author: Engineering Lead, 2026-10-24. Grounded in `makemoney2023/abracadabra` main (HQ app in `handoff/`, latest migration `0052_agent_social_approve.sql`).

---

## 1. What we are building (one paragraph)

HQ pulls each client's Google Search Console (GSC) data every day with one HQ-owned, read-only Google service account. Clients see their own search performance and indexing status in their HQ space, with plain-language explanations. Agents (SEO & Analytics) read the same data through an authenticated HQ API, so no agent ever holds a Google key. A daily rules pass turns problems and opportunities into HQ board cards for the SEO agent. Nothing is published automatically: fixes ship as PRs or cards that Christopher approves. GA4 follows later on the same pipe.

Non-goals (v1): writing to GSC (sitemap submit, removals), Bing Webmaster, rank tracking outside GSC, auto-publishing any change, client self-service connect without staff mapping.

---

## 2. Decisions at a glance

| Question | Decision |
|---|---|
| Secrets | One Cloudflare Worker secret `GOOGLE_SA_KEY_JSON` on the **`handoff`** Worker only (the one with the cron and the queue consumer). Not on `handoff-hq`. JWT (RS256) signed with WebCrypto, exchanged for a 1-hour access token, cached in memory per isolate. No token or key ever stored in D1, R2 or logs. |
| Where data lives | **Decided:** small config/state tables in the existing `handoff` D1 (migrations `0053`, `0054`). High-volume daily facts in a **new dedicated D1 database `handoff-search`** (binding `SEARCH_DB`) so the shared `handoff` DB (10 GB hard cap, time-travel restores) is never put at risk. Raw full-dimension exports gzipped in R2 (`FILES` bucket, prefix `search-raw/`). Option B (no new database) was rejected; see Appendix A. |
| Retention | Daily facts 16 months (matches GSC). Monthly rollups 36 months. Raw R2 exports 16 months (R2 lifecycle rule). Inspection history 24 months. All purged when the org is purged. |
| Scheduler | New daily Cron Trigger on `handoff` (`30 8 * * *` UTC, about 4:30 a.m. Toronto) that only **enqueues** work. A new Cloudflare Queue `search-sync` (+ DLQ) does the pulls and the 16-month backfill fan-out with throttling. Workflows considered and not chosen (see 7). |
| Agent access | `GET /api/agent-search/...` with the agent bearer token, scoped to clients the agent is assigned to, plus an env allow-list (`SEARCH_AGENT_READERS=seo-analytics,engineering-lead`). |
| Client view | New space page `/w/[slug]/search` (shadcn), org-scoped via the space's `organization_id`. **Visible to the space's client owners by default; an owner can grant other members (or new invitees) access** (section 6.1). Staff view on the client page. |
| Loop | Daily rules create cards **on the client's own board, visible to the whole client org**, written in client language with a short offer of the work Abracadabra can do; internal analysis stays staff-only. Assigned to `seo-analytics`, deduped by a findings table with fingerprints and cooldowns, capped at 5 new cards per client per day. URL Inspection budget 200 checks per property per day. Off per client until staff turn it on. |
| Cost | About $0 extra: GSC and GA4 APIs are free; usage fits inside the Workers Paid plan inclusions (D1, Queues, R2). |
| Effort | About 14.5 engineering days for GSC (PRs 1-5), plus 3-4 days for GA4 (PR 6). Christopher setup about 30-45 minutes. |
| Flags | `SEARCH_CONSOLE` (off by default, like `SOCIAL_AGENT_ACTIONS`), per-org `loop_enabled` (off by default). |

---

## 3. What exists today (grounding)

- **Workers.** `handoff/wrangler.jsonc` (`handoff`, custom domain handoff.abra-ca-dabra.app) and `handoff/wrangler.hq.jsonc` (`handoff-hq`, hq.abra-ca-dabra.app). Both use `main: cloudflare-worker.ts`, D1 `handoff` (binding `DB`), R2 `FILES`/`SKILLS`/`BRANDING`, `nodejs_compat` + `global_fetch_strictly_public`.
- **Cron.** Only `handoff` has `triggers.crons: ["* * * * *", "0 * * * *"]`. `handoff-hq` has none. `handoff/cloudflare-worker.ts` wraps the OpenNext handler (`fetch: handler.fetch`) and adds its own `scheduled()` and `queue()` exports. This is the OpenNext-supported "custom worker entry" pattern; OpenNext itself does not generate scheduled handlers, so we extend this file.
- **scheduled()** runs scan filing, swarm settle, `refreshDueSocialPosts`, `wakeDueAgents(sql, env, event.cron, now)`, cloud-run expiry, build retries in sequence. `dueOrganizations` in `src/lib/agent-wake.ts` only acts on `* * * * *` and `0 * * * *`, so a new cron string wakes no agents (covered by a test in PR 2).
- **Queues.** `handoff` consumes `lead-intake` and `github-events`. `src/lib/queue-dispatch.ts` routes `github-events` explicitly and **sends every other queue to lead intake by default**. A new queue must get its own branch before that default (test in PR 2).
- **Tenancy.** `organizations` (0005, plus `parent_organization_id` 0027). `workspaces.organization_id` links a client space to its org. Client users have `memberships` per workspace (`client_owner`/`client_member`). `src/lib/authz.ts` `can(caller, action, {workspaceId})` decides access. Pages resolve the space with `workspacesFor(sql, caller)` (e.g. `src/app/w/[slug]/social/page.tsx`). `src/db/isolation.test.ts` is the existing tenant isolation suite.
- **Agents.** `client_agents` (token hash, `kind` client/function since 0049), `agent_assignments` (org, role lead/hire). `agentForToken()` and `assignmentFor()` in `src/lib/agent-work-filing.ts`. Function agents (`seo-analytics`, `engineering-lead`, ...) are hires on every client.
- **Board.** `createAgentTask()` in `src/lib/agent-board.ts`; `tasks.created_by_kind` allows only `staff`/`agent`; activity log in `activities` (`actor_kind` staff/agent/system). `audit_events` needs a non-null `workspace_id`, so org-level events go to `activities`.
- **Migrations.** `handoff/migrations/0001...0052`, applied by `migrate()` in `src/db/migrate.ts` (STEPS list with an existence probe per step). Next numbers: **0053, 0054**.
- **Signing precedent.** `src/lib/github/sign.ts` signs an RS256 JWT for the GitHub App (node:crypto `createSign`). Google uses the same JWT shape.
- **UI.** shadcn components in `src/components/ui` (card, table, tabs, badge, tooltip, select, skeleton, empty, ...). There is **no `chart` component and no `recharts`** yet; PR 3 adds the shadcn `chart` component (adds `recharts` as a dependency).
- **Env pattern.** `workerEnv()` / `flagEnabled()` in `src/lib/worker-env.ts`.

---

## 4. Architecture

```
            Cron 30 8 * * * (handoff)                     Staff "Sync now"/"Backfill" (handoff-hq)
                       |                                              |
                       v                                              v
             enqueue jobs per property  ----------------->  Queue: search-sync  (DLQ: search-sync-dlq)
                                                                      |
                                                     consumer on handoff (max_concurrency 2)
                                                                      |
         GOOGLE_SA_KEY_JSON (secret) -> JWT (WebCrypto) -> oauth2 token (cached ~55 min)
                                                                      |
            searchAnalytics.query / sitemaps.list / urlInspection.index.inspect / sites.list
                                                                      |
              +-----------------------+------------------------------+--------------------+
              v                       v                              v                    v
     SEARCH_DB facts (D1)    handoff DB config/state (0053)   R2 search-raw/*.jsonl.gz   activities (audit)
              |                       |
              +---- rules pass -------+--> findings (0054) --> tasks (cards for seo-analytics)
              |
     /w/[slug]/search (client)   /clients/... (staff)   GET /api/agent-search/* (agents)
```

### 4.1 Google auth (`src/lib/search/google-auth.ts`)
- Secret: the whole service-account JSON in `GOOGLE_SA_KEY_JSON` on `handoff`. Only `client_email`, `private_key`, `token_uri` are read.
- Build JWT `{iss: client_email, scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat+3600}`, sign RS256 with `crypto.subtle.importKey("pkcs8", ...)` + `sign("RSASSA-PKCS1-v1_5")` (pure WebCrypto; no Node polyfill; mirrors the shape of `src/lib/github/sign.ts`).
- POST `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`. Cache `{token, expiresAt}` in a module variable per isolate and scope; refresh 5 minutes early. Never persisted.
- Scopes: `https://www.googleapis.com/auth/webmasters.readonly` now; `https://www.googleapis.com/auth/analytics.readonly` added in PR 6. Requested separately so each token carries only what the call needs.
- Errors redact everything except HTTP status and Google's `error` code.

### 4.2 GSC client (`src/lib/search/gsc.ts`)
- `sites.list` (what the SA can see, with `permissionLevel`): used for onboarding discovery and access-loss detection.
- `searchanalytics.query` on `https://www.googleapis.com/webmasters/v3/sites/{encoded siteUrl}/searchAnalytics/query`, `type: web` (later `image`, `video`, `news`, `discover` optional), `rowLimit: 25000`, page with `startRow` until a short page. **One day per request** (cheapest load and respects Google's ~50k rows per day per search type cap). `dataState: "all"` for the last 3 days (marked `is_final = 0`), `final` otherwise.
- `sitemaps.list` per property (path, lastSubmitted, lastDownloaded, isPending, errors, warnings, contents).
- `urlInspection.index.inspect` (`inspectionUrl`, `siteUrl`, `languageCode: en-US`): verdict, coverageState, indexingState, robotsTxtState, pageFetchState, lastCrawlTime, googleCanonical, userCanonical, sitemap list, referring URLs (count only).
- Domain properties use `sc-domain:example.com`; URL-prefix properties `https://www.example.com/`. Always URL-encoded in paths.

### 4.3 Quotas we design around (Google, checked 2026-10-24)
- Search Analytics: 1,200 QPM per site **and 1,200 QPM per user**. Our one service account is one "user" across every client, so the queue throttles globally to **≤ 300 QPM** (concurrency 2, small batches, `retry` with delay on 429/quota). Per project 40,000 QPM / 30M QPD. Load quota: page+query grouping is the most expensive, so we keep date ranges to one day and never re-query final days.
- URL Inspection: **2,000/day and 600/min per property**; 10M/day per project. We default to a budget of **200/day per property** (configurable up to 1,800, leaving headroom for SEO & Analytics' manual checks in the GSC UI).
- Other resources (sites, sitemaps): 20 QPS / 200 QPM per user.

### 4.4 What we pull each day (per property)
Window: D-4 .. D-1 every day (GSC lags 2-3 days; re-pulling 4 days catches late data; rows upserted by natural key so re-pulls are idempotent).

| Request (one day each) | Dimensions | Stored in |
|---|---|---|
| Site totals | `date` | `search_daily_site` |
| Pages | `date, page` | `search_daily_page` |
| Queries | `date, query` | `search_daily_query` |
| Query x page | `date, query, page` | `search_daily_query_page` (capped: top 5,000 rows/day by impressions) + full set to R2 |
| Country x device | `date, country, device` | `search_daily_segment` |
| Full grain | `date, query, page, country, device` | **R2 only** (`search-raw/<org>/<property>/<yyyy-mm-dd>.jsonl.gz`) |

Note for the UI and reports: GSC drops anonymized queries from query-level rows, so query totals are lower than site totals. Site totals come from the `date`-only request so headline numbers match the GSC UI.

### 4.5 Backfill (16 months)
On property connect, staff click "Backfill" (or it starts automatically after mapping): the producer enqueues one message per (property, day, request kind) for ~486 days, **newest day first** so the UI is useful within minutes. About 486 x 5 = ~2,400 calls per property (more with pagination for big sites). At the 300 QPM global throttle, a small site backfills in ~8-10 minutes; queue retries handle quota errors. Progress in `search_sync_runs`. The full-grain R2 export is optional for backfill (flag) because it is the most expensive query.

### 4.6 URL Inspection priority (budget per property per day)
1. URLs new in the sitemap or with a changed `<lastmod>` since last check (HQ fetches the public sitemap XML itself).
2. Pages whose impressions fell more than 50% week over week, or dropped to zero after having impressions.
3. Pages a finding or card asks to re-check (after a fix ships).
4. Top 50 pages by clicks, weekly.
5. Round-robin over remaining sitemap URLs not inspected in 14 days.
Result: latest state per URL in `search_url_state`, transitions in `search_url_events`.

---

## 5. Data model

### 5.1 `handoff` DB, migration `0053_search_console.sql` (additive only)
```sql
-- Search Console connections, sync state. One row per GSC property mapped to one organization by staff.
CREATE TABLE search_properties (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL DEFAULT 'gsc' CHECK (provider IN ('gsc', 'ga4')),
  site_url TEXT NOT NULL,                 -- 'sc-domain:example.com' | 'https://www.example.com/' | 'properties/123' (GA4)
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'access_lost', 'paused', 'removed')),
  permission_level TEXT,                  -- from sites.list, e.g. siteRestrictedUser
  inspect_budget INTEGER NOT NULL DEFAULT 200 CHECK (inspect_budget BETWEEN 0 AND 1800),
  loop_enabled INTEGER NOT NULL DEFAULT 0 CHECK (loop_enabled IN (0, 1)),
  backfill_state TEXT NOT NULL DEFAULT 'none' CHECK (backfill_state IN ('none', 'running', 'done', 'failed')),
  last_success_at INTEGER, last_error TEXT, consecutive_failures INTEGER NOT NULL DEFAULT 0,
  data_through TEXT,                      -- last final date, 'YYYY-MM-DD'
  mapped_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (provider, site_url)             -- a property belongs to exactly one org
);
CREATE INDEX search_properties_org ON search_properties (organization_id);

CREATE TABLE search_sync_runs (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES search_properties(id),
  kind TEXT NOT NULL CHECK (kind IN ('daily', 'backfill', 'inspect', 'sitemaps')),
  day TEXT,                               -- 'YYYY-MM-DD' for one-day jobs
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  rows_written INTEGER NOT NULL DEFAULT 0, api_calls INTEGER NOT NULL DEFAULT 0,
  error TEXT, started_at INTEGER, finished_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX search_sync_runs_property ON search_sync_runs (property_id, created_at);

-- Who besides client owners may see search data in a space (decision 3). Owners always can; no row = no access.
-- A grant names a live membership, or a pending invite (membership_id filled in when the invite is accepted).
CREATE TABLE search_access_grants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  membership_id TEXT REFERENCES memberships(id),
  invite_id TEXT REFERENCES invites(id),
  granted_by TEXT NOT NULL,               -- user id of the owner or staff member
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (membership_id IS NOT NULL OR invite_id IS NOT NULL)
);
CREATE UNIQUE INDEX search_access_grants_live ON search_access_grants (workspace_id, membership_id) WHERE revoked_at IS NULL AND membership_id IS NOT NULL;
CREATE INDEX search_access_grants_invite ON search_access_grants (invite_id);
```
`migrate.ts` STEP: `{ file: "0053_search_console.sql", table: "search_sync_runs" }`.

### 5.2 `handoff` DB, migration `0054_search_findings.sql` (PR 5)
```sql
CREATE TABLE search_findings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES search_properties(id),
  rule TEXT NOT NULL CHECK (rule IN ('low_ctr', 'striking_distance', 'index_loss', 'content_gap', 'cro')),
  subject_key TEXT NOT NULL,              -- normalized page URL, or query-cluster key
  fingerprint TEXT NOT NULL,              -- sha256(org|rule|subject_key)
  status TEXT NOT NULL CHECK (status IN ('open', 'carded', 'snoozed', 'resolved', 'dismissed')),
  severity REAL NOT NULL,                 -- estimated clicks at stake per 28 days
  evidence_json TEXT NOT NULL,            -- metrics, date range, source ('GSC, 2026-09-20..2026-10-17')
  task_id TEXT REFERENCES tasks(id),
  first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
  cooldown_until INTEGER, resolved_at INTEGER,
  client_title TEXT,                      -- client-facing card title (plain language), copy of tasks.title
  client_summary TEXT,                    -- client-facing body: what we noticed, why it matters
  client_offer TEXT,                      -- short offer of the work Abracadabra can do
  internal_note TEXT,                     -- staff-only analysis; never rendered in the client portal or client feeds
  UNIQUE (organization_id, fingerprint)
);
CREATE INDEX search_findings_task ON search_findings (task_id);
```
STEP: `{ file: "0054_search_findings.sql", table: "search_findings" }`.

### 5.3 New D1 database `handoff-search` (binding `SEARCH_DB`), own migrations dir `handoff/migrations-search/`
Applied by a new `migrateSearch()` (same STEPS pattern as `src/db/migrate.ts`). Every row carries `organization_id` and `property_id`; every read path filters by both.
```sql
-- s0001_facts.sql
CREATE TABLE search_queries (id INTEGER PRIMARY KEY, property_id TEXT NOT NULL, text TEXT NOT NULL, UNIQUE (property_id, text));
CREATE TABLE search_pages   (id INTEGER PRIMARY KEY, property_id TEXT NOT NULL, url TEXT NOT NULL, in_sitemap INTEGER NOT NULL DEFAULT 0,
                             sitemap_lastmod TEXT, UNIQUE (property_id, url));
-- position stored as impression-weighted sum so any roll-up is exact: avg_position = pos_sum / impressions
CREATE TABLE search_daily_site    (organization_id TEXT NOT NULL, property_id TEXT NOT NULL, day TEXT NOT NULL, search_type TEXT NOT NULL DEFAULT 'web',
                                   clicks INTEGER NOT NULL, impressions INTEGER NOT NULL, pos_sum REAL NOT NULL, is_final INTEGER NOT NULL,
                                   PRIMARY KEY (property_id, search_type, day));
CREATE TABLE search_daily_page    (organization_id TEXT NOT NULL, property_id TEXT NOT NULL, day TEXT NOT NULL, page_id INTEGER NOT NULL,
                                   clicks INTEGER NOT NULL, impressions INTEGER NOT NULL, pos_sum REAL NOT NULL, PRIMARY KEY (property_id, day, page_id));
CREATE TABLE search_daily_query   (organization_id TEXT NOT NULL, property_id TEXT NOT NULL, day TEXT NOT NULL, query_id INTEGER NOT NULL,
                                   clicks INTEGER NOT NULL, impressions INTEGER NOT NULL, pos_sum REAL NOT NULL, PRIMARY KEY (property_id, day, query_id));
CREATE TABLE search_daily_query_page (organization_id TEXT NOT NULL, property_id TEXT NOT NULL, day TEXT NOT NULL, query_id INTEGER NOT NULL, page_id INTEGER NOT NULL,
                                   clicks INTEGER NOT NULL, impressions INTEGER NOT NULL, pos_sum REAL NOT NULL, PRIMARY KEY (property_id, day, query_id, page_id));
CREATE TABLE search_daily_segment (organization_id TEXT NOT NULL, property_id TEXT NOT NULL, day TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL,
                                   clicks INTEGER NOT NULL, impressions INTEGER NOT NULL, pos_sum REAL NOT NULL, PRIMARY KEY (property_id, day, country, device));
CREATE TABLE search_monthly_page  (... month TEXT ..., same measures);   -- roll-ups kept 36 months
CREATE TABLE search_monthly_query (... month TEXT ..., same measures);
CREATE TABLE search_sitemaps (property_id TEXT NOT NULL, path TEXT NOT NULL, organization_id TEXT NOT NULL, last_submitted TEXT, last_downloaded TEXT,
                              is_pending INTEGER, errors INTEGER, warnings INTEGER, submitted_urls INTEGER, fetched_at INTEGER NOT NULL, PRIMARY KEY (property_id, path));
CREATE TABLE search_url_state (property_id TEXT NOT NULL, page_id INTEGER NOT NULL, organization_id TEXT NOT NULL, verdict TEXT, coverage_state TEXT,
                               indexing_state TEXT, robots_state TEXT, fetch_state TEXT, google_canonical TEXT, user_canonical TEXT,
                               last_crawl_at TEXT, inspected_at INTEGER NOT NULL, PRIMARY KEY (property_id, page_id));
CREATE TABLE search_url_events (id INTEGER PRIMARY KEY, property_id TEXT NOT NULL, page_id INTEGER NOT NULL, organization_id TEXT NOT NULL,
                                from_state TEXT, to_state TEXT NOT NULL, at INTEGER NOT NULL);
-- indexes: (organization_id, property_id, day) on each daily table for the portal's date-range reads.
```
Writes use `db.batch()` of upserts (D1 counts a batch as one query against the 1,000-queries-per-invocation limit; each statement stays under 100 bound params, so ~10 rows per multi-row `INSERT`).

### 5.4 Volume and size estimates (16 months = ~486 days)
| Client size | query-days | query x page rows (capped) | D1 bytes incl. indexes (~120 B/row) |
|---|---|---|---|
| Pilot / small (abra-ca-dabra.app, 50-300 queries/day) | ~0.1 M | ~0.2 M | ~40-60 MB |
| Typical SMB (1-3k queries/day) | ~1 M | ~2 M | ~0.4 GB |
| Larger (10k+ queries/day) | ~5 M | 2.4 M (cap 5k/day) | ~1-1.2 GB |
With 20 typical clients `handoff-search` sits around 6-8 GB at full 16-month depth, which is why it is its own database (the `handoff` DB keeps its headroom). If it ever nears 8 GB, shard by adding `handoff-search-2` (D1 is designed for many 10 GB databases) or lower the query x page cap. R2 raw files: tens of MB per client per year.

### 5.5 Retention job (daily, after sync)
- Delete daily rows older than 16 months after rolling them into `search_monthly_*` (top 1,000 pages/queries per month), in chunks of 1,000 rows.
- `search_url_events` older than 24 months deleted.
- R2 lifecycle rule on prefix `search-raw/` expires objects after 490 days (bucket config, needs your OK).
- Org purge (`src/lib/retention.ts` `purgeWorkspace` / org archive): delete that org's rows in both DBs and R2 prefix; property row set `removed`.

Database choice is decided: new D1 `handoff-search` (decision 1). The rejected alternative is kept in Appendix A for the record.

---

## 6. Tenant isolation and access

- **Mapping is staff-only.** A property becomes visible to an org only after a staff user maps it (`search_properties.organization_id`) from the client's staff page. Suggestion helper: `sites.list` entries whose domain matches `organizations.domain`, but staff confirm. `UNIQUE(provider, site_url)` stops one property being mapped to two orgs.
- **Client portal.** `/w/[slug]/search`: resolve the workspace through `workspacesFor(sql, caller)` exactly like `social/page.tsx`, require `can(caller, "search.view", {workspaceId})` (section 6.1), take `organization_id` from that workspace row only, never from the URL or query string. Every SEARCH_DB query goes through one helper `searchScope(orgId, propertyId)` that injects both filters. A caller without `search.view` gets 404 on the page (same as other hidden space pages) and 403 on its server actions; the nav link is hidden.
- **Agents.** `/api/agent-search/*`: `agentForToken()`, then `assignmentFor(agent, orgId)` must exist, then the agent id must be in `SEARCH_AGENT_READERS`. 403 otherwise. Client resolved with `resolveClientRef()` (domain, org id, or space slug), same as the board.
- **Staff.** Super admin and assigned operators see all mapped orgs.
- **Tests (required in PRs 3 and 4).** Extend `src/db/isolation.test.ts` style: two orgs with data; owner of org A gets 404 on org B's space search page and sees only A's rows; a `client_member` of A **without** a grant gets 404 on the page and 403 on the data actions; the same member **with** a live grant sees A's data; after the grant or the membership is revoked, access is gone on the next request; a grant in a space of org A never opens org B; an invite-time grant only takes effect once that invite is accepted; a member cannot grant themselves or others (403); `authz.test.ts` gets the `search.view` and `search.grant` matrix; agent assigned to A only gets 403 for B; agent not in allow-list gets 403; a forged `?client=` or `organization_id` param is ignored; a revoked token gets 401; a property in `access_lost` shows the banner, not an error; a removed property's data is not returned.
- **Least privilege.** Read-only scopes only. The SA is added to each GSC property as a **Restricted** user (enough for searchAnalytics, sitemaps list, URL Inspection). GA4: Viewer.
- **Secret handling.** Only on `handoff`. `handoff-hq` never sees the key: its "Sync now" button only enqueues a message. The key never leaves the Worker; no route returns or logs it.
- **Key rotation.** Every 90 days, or at once if leaked: create new key in GCP, `wrangler secret put GOOGLE_SA_KEY_JSON` on `handoff` (your approval), verify one sync, then delete the old key in GCP. The token cache picks up the new key on the next isolate. Rotation reminder as an HQ card.
- **Audit.** `activities` rows (org-scoped, `actor_kind` system/staff/agent): `search.property_mapped`, `search.property_unmapped`, `search.backfill_started/finished`, `search.access_lost`, `search.access_restored`, `search.finding_carded`, and `search.agent_read` (one row per agent per org per day, not per request). Sync errors to `search_sync_runs.error` (redacted).
- **Client removes access.** Google returns 403 (or the property disappears from `sites.list`). We mark `access_lost` on the first 403 confirmed by `sites.list`, stop pulls and inspections, post an HQ notice to staff (`postHqNotice`), show the client "We lost access to Search Console on <date>. Data shown is through <date>. Re-add <SA email> to restore." Existing data stays under normal retention unless the client asks for deletion (staff action "Remove data" deletes rows + R2 prefix). When access returns, the next daily run detects it and back-fills the gap.

### 6.1 Owner-only by default, owners can invite others (decision 3)

- **Default.** Search data in a space is visible to that space's `client_owner` memberships, plus staff (super admin, assigned operators). A `client_member` sees nothing until an owner grants it.
- **Authz.** Two new actions in `src/lib/authz.ts`:
  - `search.view`: `staffOnWorkspace || owner || (client && hasLiveSearchGrant)`. `Caller` gets `searchGrants: string[]` (workspace ids with a live grant on a non-revoked membership), loaded with the memberships in `currentCaller()` (`src/lib/current.ts`).
  - `search.grant`: `staffOnWorkspace || owner` (same rule as `invite.member` and `member.remove`).
- **Owner UI** (`/w/[slug]/people`, shadcn): each member row gets a "Can see search data" `switch` (owners show "Always", no switch). The invite form gets a "Can see search data" `checkbox`; checking it writes a grant with `invite_id`, and `acceptInvite()` in `src/lib/store/invites.ts` fills in `membership_id` when that invite is accepted. Revoking the invite or the membership ends the grant. One-line explainer: "Owners always see search results. Turn this on for anyone else who should."
- **Data.** `search_access_grants` (migration 0053, above). Owners cannot be ungranted; a member promoted to owner has access anyway; a demoted owner loses access unless granted.
- **Audit.** Workspace-scoped `audit_events` rows: `search.access_granted`, `search.access_revoked`, `search.access_invited` (grant on an invite), `search.access_activated` (invite accepted), with `actor_user_id`, `subject_type = 'membership' | 'invite'`, metadata `{email}`.
- **Agents unaffected.** `/api/agent-search/*` uses agent tokens, assignments and the `SEARCH_AGENT_READERS` allow-list (section 9). Member grants neither widen nor narrow agent access.
- **Cards are separate.** Loop cards on the client board are visible to the whole client org through the board (decision 5). They carry client-written summaries only, never the raw query/page tables, which stay owner-only (section 10.1).

---

## 7. Scheduler

- **Daily cron** `30 8 * * *` added to `handoff/wrangler.jsonc` `triggers.crons`. In `cloudflare-worker.ts` `scheduled()`, branch first: `if (event.cron === SEARCH_SYNC_CRON) { await enqueueDailySearchSync(...); return; }` so the existing per-minute and hourly jobs are untouched. The handler only enqueues (fast, well under cron CPU limits).
- **Queue `search-sync`** (+ `search-sync-dlq`): producer binding `SEARCH_SYNC` on `handoff` and `handoff-hq`; consumer on `handoff` only with `max_batch_size: 5`, `max_batch_timeout: 5`, `max_concurrency: 2`, `max_retries: 5`. Message: `{propertyId, kind, day?, request?}`. `dispatchQueue()` gets an explicit `search-sync` branch **before** the lead-intake default.
- **Order per daily run:** sites.list (access check) -> sitemaps -> analytics D-4..D-1 -> inspections (budgeted) -> retention -> rules pass (PR 5).
- **Why not Workflows:** Workflows would give durable step state for backfill, but needs a Workflow class exported from the custom entry next to the OpenNext handler and a new binding type we do not use yet. Queues are already in production here, give retries and a DLQ, and backfill is naturally one-message-per-day. Revisit if backfills grow complex.
- **Why not a separate Worker:** fewer moving parts to deploy; HQ code (D1 helpers, migrate, activities) is reused directly. If the `handoff` bundle or CPU becomes an issue, the consumer can move to a small `handoff-search` Worker later with the same queue.
- Note: `handoff` and `handoff-hq` share `main` but only `handoff` has crons and consumers, so the secret, cron and consumer all live on `handoff`.

---

## 8. Client view (shadcn) `/w/[slug]/search`

- Header: property name, data through `<date>` (with "Google data is 2-3 days behind"), range picker (`select`: 7/28/90 days, 3/6/12/16 months), compare to previous period.
- KPI `card`s: clicks, impressions, CTR, average position, each with delta.
- Trend chart (shadcn `chart`, line, clicks + impressions; position on its own axis inverted).
- `tabs`: **Queries** and **Pages** (`table`, sortable, `pagination`; country/device filter via `select`), **Indexing** (status `badge` per page: Indexed / Excluded-expected / Needs attention, with the plain-language reason in a `tooltip`), **Sitemaps** (last read, errors, warnings).
- Empty and loading: `empty`, `skeleton`. Banner (`alert-dialog` not needed; inline card) for `access_lost` or `backfill running`.
- Who sees it: owners and granted members (section 6.1). Members without access don't see the nav link.
- Staff view on the client's HQ page: same components plus mapping, budget, loop toggle, Sync now, Backfill, last runs, and the list of granted members.
- Plain-language coverage reasons (`src/lib/search/coverage-reasons.ts`), each tagged expected / watch / fix:
  - Submitted and indexed: "In Google. Nothing to do."
  - Page with redirect: "Usually expected. This old address forwards to the right page."
  - Alternate page with proper canonical tag: "Expected. Google uses the main version of this page."
  - Excluded by 'noindex' tag: "We told Google to skip this page. Expected for private or thank-you pages; a problem if it should rank."
  - Duplicate without user-selected canonical / Google chose different canonical: "Google sees this as a copy of another page. Watch."
  - Crawled - currently not indexed: "Google read it but chose not to list it yet. Usually a content quality or uniqueness signal. Fix."
  - Discovered - currently not indexed: "Google knows the page but hasn't read it yet. Common for new pages; fix if it lasts weeks."
  - Not found (404) / Soft 404: "The page is missing or looks empty. Fix or redirect."
  - Blocked by robots.txt / Server error (5xx) / Redirect error: "Google couldn't read the page. Fix."
  - URL is unknown to Google: "Google hasn't found it. Check the sitemap and internal links."

---

## 9. Agent API

All `GET`, bearer agent token, host hq.abra-ca-dabra.app. `client=<domain | org id | space slug>` required. Responses carry `source: "Google Search Console"`, `property`, `range`, `data_through`, `is_final` so reports never present partial data as final.

| Route | Returns |
|---|---|
| `/api/agent-search/properties?client=` | mapped properties, status, data_through, backfill state |
| `/api/agent-search/summary?client=&start=&end=&compare=1` | totals + deltas, daily series |
| `/api/agent-search/queries?client=&start=&end=&page=&limit=&min_impressions=` | query rows (avg position computed from pos_sum) |
| `/api/agent-search/pages?client=&start=&end=&query=` | page rows |
| `/api/agent-search/query-pages?client=&start=&end=` | query x page (capped table) |
| `/api/agent-search/indexing?client=&state=` | latest URL states + plain reason, recent transitions |
| `/api/agent-search/sitemaps?client=` | sitemap status |
| `/api/agent-search/findings?client=&status=` | loop findings with evidence and card ids |
| `/api/agent-search/raw?client=&day=` | short-lived signed link to that day's R2 export (existing download-signing pattern in `src/lib/downloads.ts`) |

Limits: max 16-month range, `limit` <= 5,000, 60 requests/minute per agent. Documented in `GET /api/agent-skill-guide` under a new "Search data" section.

---

## 10. Optimization loop (PR 5)

Runs after each successful daily sync, per property with `loop_enabled = 1`. Daily limits (decision 4, Engineering's choice as delegated by Christopher): **200 URL Inspection checks per property per day** and **at most 5 new loop cards per client per day** (3 per rule). Window: last 28 final days vs previous 28. Every card says where the numbers came from and the date range.

| Rule | Trigger (defaults, tunable per org) | Card for `seo-analytics` |
|---|---|---|
| `low_ctr` | Page (or page's top query) with >= 300 impressions/28d, avg position <= 10, CTR < 50% of the site's own median CTR at that position bucket (fallback: a standard CTR curve) | "Rewrite title/meta: <page>" with top queries, current title/description (fetched), CTR vs expected |
| `striking_distance` | Queries at weighted position 5-20 with >= 100 impressions/28d, grouped per ranking page | "Expand content: <page>" listing the query cluster and positions |
| `index_loss` | URL moved from indexed (PASS) to not indexed; newly `Crawled - currently not indexed`; or page impressions fell to 0 for 7 days after >= 50/week | "Indexing: <page> (<reason>)" with plain explanation and inspection link |
| `content_gap` | Query cluster with >= 50 impressions/28d where the best page ranks > 20 or is the home page, and no sitemap URL matches the cluster's main terms (slug/title token overlap below threshold) | "New post idea: <cluster>" with queries, impressions, nearest existing page |
| `cro` (GA4, PR 6) | Landing page with >= 100 sessions/28d and lead conversion rate < 50% of site median | "CRO: <page>" with sessions, conversions, channel split incl. AI referrals |

- **Dedupe.** Fingerprint `sha256(org|rule|subject_key)`; `subject_key` is the normalized URL (lowercase host, no query string, consistent trailing slash) or the sorted top terms of a query cluster. One finding per fingerprint (`UNIQUE`). If the finding already has an open card, update `evidence_json` and add at most one card note per week; no new card. After the card is Done, the finding is `resolved` and re-checked after 21 days; it only re-opens if the condition still holds and severity has not dropped. Dismissed findings (staff or agent marks "won't fix") cool down 90 days unless severity doubles.
- **Caps.** Max 5 new cards per client per day, 3 per rule; highest `severity` (estimated clicks at stake) first; the rest stay `open` for the next day.
- **Card creation (decision 5: the client's own board).** System inserts the task in the client's open project on the client's own board (same project rules as `createAgentTask`), `created_by_kind = 'agent'`, `assignee_agent_id = 'seo-analytics'`, stage `todo`, activity `actor_kind = 'system'`. The card title and the create activity carry **client copy only** (10.1). Evidence and analysis go to `search_findings.internal_note` / `evidence_json` and a staff-only activity. No change to `tasks` schema. The SEO agent then follows the normal flow (skills, PR or content draft, Christopher's approval). **The loop never edits a site, opens a PR, or publishes.**

### 10.1 Client-visible cards (decision 5)

Christopher: "Clients own board" and "All clients should be able to see the improvement cards so we can upsell them on more work for us." So loop cards are sales-facing as well as work items.

- **Who sees them.** Everyone in the client org who can see the board (all members, not only owners). Deliberately different from the raw search data, which stays owner-only (6.1).
- **Client copy from reviewed templates, not raw agent text.** Per rule, `src/lib/search/card-copy.ts` fills:
  - `client_title`: plain and specific, e.g. "Get more clicks from people who already see your Services page".
  - `client_summary`: 2-4 sentences on what we noticed and why it matters, with at most one or two rounded headline figures for that page (e.g. "about 1,200 search views last month, few clicks"). No query tables, ids, internal terms (CTR, "striking distance", fingerprints, thresholds, agent names) or raw agent reasoning.
  - `client_offer`: one short line on what Abracadabra can do, with a soft call to action, e.g. "We can rewrite this page's Google title and description and track the result. Reply here or ask us to go ahead." No prices unless Christopher adds them to the templates.
  - Titles by rule: low CTR -> "Make this page more clickable in Google"; striking distance -> "<Page> is close to page one for <topic>"; index loss -> "Google stopped showing <page>"; content gap -> "People search for <topic> and you don't have a page for it yet"; CRO (GA4) -> "Turn more visitors on <page> into enquiries".
- **Internal analysis stays internal.** `evidence_json` (metrics, date range, source) and `internal_note` (rule, thresholds, reasoning) live on the finding and in an activity of kind `search.finding_evidence` that the client portal and client-facing feeds exclude (explicit exclude list, tested). Staff and the assigned agent read them in HQ and via `/api/agent-search/findings`.
- **Copy guard.** Before insert, a check rejects client fields containing internal words (blocklist: "CTR", "fingerprint", "rule", agent ids, HQ admin URLs, query lists over 3 items) and falls back to the plain template. Unit tests per rule.
- **What clients can do.** Read the card, comment, or ask for the work through existing client channels. Accepting an offer creates normal work. **Nothing is auto-published, and every fix still needs Christopher's approval.**
- **Pilot first.** On abra-ca-dabra.app (our own org) during the shadow week, staff read every generated card before any client org gets `loop_enabled`.
- **Kill switch.** `loop_enabled` per property, and `SEARCH_CONSOLE=off` stops everything.

---

## 11. GA4 later (PR 6)

- Same SA, added as **Viewer** on each GA4 property; scope `analytics.readonly`; enable "Google Analytics Data API" in the same GCP project. Property stored as `search_properties` row with `provider = 'ga4'`, `site_url = 'properties/<id>'`.
- Daily `runReport` per day: `date, landingPagePlusQueryString, sessionDefaultChannelGroup, sessionSource` with metrics `sessions, engagedSessions, keyEvents` (and the lead key event, e.g. `generate_lead`, via `keyEvents:<name>`).
- AI referral classification in our code (not only GA4's channel): source matches `chatgpt.com|chat.openai.com|perplexity.ai|gemini.google.com|bard.google.com|copilot.microsoft.com|bing.com/chat|claude.ai` -> `ai_referral`. Shown side by side with organic, count and rate (per the measurement skill).
- Tables in `handoff-search`: `ga4_daily_landing (org, property, day, page_id, channel, ai_source, sessions, engaged, leads)`.
- GA4 Data API is free; quota is tokens per property (standard properties ~200k core tokens/day), far above a daily pull.

---

## 12. Cost

| Item | Expected | Why |
|---|---|---|
| GSC API, GA4 Data API, URL Inspection | $0 | Free, quota-limited only |
| Google Cloud project + service account | $0 | No billable services used |
| Workers (cron + consumer) | $0 extra | A few thousand invocations/day, inside Workers Paid inclusions |
| Queues | $0 extra | ~10-20k messages/day at 20 clients (x3 ops) vs 1M ops/month included; backfills ~2.5k messages each |
| D1 (`handoff-search`) | $0 to ~$1-3/month at scale | Paid plan includes 25B rows read, 50M rows written, 5 GB storage per month; ~6-8 GB at 20 clients is ~$0.75/GB-month over 5 GB |
| R2 raw exports | $0 | Well under 10 GB free storage and free Class A/B ops |
Assumes the account stays on Workers Paid (it is, given current Queues and D1 usage).

---

## 13. Delivery plan (phased PRs, each with tests and rollback)

| PR | Scope | Migrations / infra | Tests | Rollback | Est. |
|---|---|---|---|---|---|
| **0. Setup (Christopher)** | GCP project, API, SA, key, secret, GSC user (checklist below) | Secret `GOOGLE_SA_KEY_JSON` on `handoff` | Engineering verifies with one `sites.list` call from a staff-only diagnostics route (no data shown publicly) | Delete key in GCP, `wrangler secret delete` | 30-45 min |
| **1. Foundations** | `src/lib/search/google-auth.ts` (WebCrypto JWT, token cache), `gsc.ts` client (pagination, retries, quota backoff), `coverage-reasons.ts`, flag `SEARCH_CONSOLE`, staff mapping UI + `sites.list` discovery | **0053_search_console.sql** (handoff); STEP added to `migrate.ts` | JWT signing against a generated test key, token cache expiry, pagination, 403/429 handling, redaction (no key/token in errors), mapping uniqueness | Flag off; tables are additive and unused; D1 bookmark before deploy; `wrangler rollback` | 2.5 days |
| **2. Sync pipeline** | Cron `30 8 * * *`, queue `search-sync` + DLQ, `dispatchQueue` branch, daily pulls, backfill fan-out, R2 raw export, retention, `migrateSearch()` | New D1 `handoff-search` + binding `SEARCH_DB` on both Workers; **s0001_facts.sql**; queue create; R2 lifecycle rule; wrangler.jsonc/hq.jsonc changes | Cron branch does not call wakes; unknown queue no longer reaches lead intake; idempotent re-pull of D-4..D-1; batch param limits; retention chunking; backfill newest-first; access_lost transition | Flag off stops enqueue; remove cron entry; queue messages drain to DLQ; DB untouched by app if flag off | 3.5 days |
| **3. Client + staff view** | `/w/[slug]/search`, staff tab, shadcn `chart` (adds `recharts`), indexing explanations, banners, owner-only access + member grants on `/w/[slug]/people` | none | Tenant isolation suite (cross-org 404, forged params, non-owner without grant 404/403, grant/revoke/invite-accept), owner grant UI and audit rows, render tests, empty/loading states, number formatting (CTR, weighted position) | Flag hides nav link and route 404s | 3 days |
| **4. Agent API** | `/api/agent-search/*`, allow-list, rate limit, daily `search.agent_read` activity, skill-guide section | none | 401/403 matrix, assignment + allow-list, limits, signed raw links expire | Flag returns 404 | 1.5 days |
| **5. Optimization loop** | Rules, findings, dedupe, caps, client-facing card copy + offer, staff-only evidence, cards on the client board for `seo-analytics`, per-property `loop_enabled` | **0054_search_findings.sql** | Each rule on fixtures; fingerprint stability; no duplicate cards across runs; cooldown/re-open; caps (5/client/day); client copy templates and blocklist guard; `search.finding_evidence` never appears in client views; never creates PRs or posts | `loop_enabled=0` everywhere; findings table additive | 3 days |
| **6. GA4 (later)** | GA4 property mapping, daily runReport, AI-referral classification, `cro` rule, client view tab | **s0002_ga4.sql** (search DB) | Same isolation and quota tests; AI-referrer classifier table | Flag `GA4_DATA=off` | 3-4 days |

Totals: GSC (PRs 1-5) ~14.5 engineering days (PR 3 and PR 5 each +0.5 day for member grants and client card copy); with GA4 ~18. Pilot on abra-ca-dabra.app after PR 3 (data visible), loop on after PR 5 with one week of "shadow mode" (findings recorded, no cards) to tune thresholds.

Standing rules apply to every PR: no merge or deploy without your explicit OK; migrations called out and applied by `migrate()`/`migrateSearch()` after deploy; D1 bookmark before any manual DB change; secrets, new databases, queues, crons and R2 lifecycle rules need your approval.

---

## 14. Setup checklist for Christopher (pilot: abra-ca-dabra.app)

Do these signed in as **magic@abra-ca-dabra.app** (owner of the GSC property). About 30-45 minutes.

1. **Create the project.** console.cloud.google.com -> project picker -> New project -> name `abracadabra-hq-search` -> Create. (Billing not required for these APIs.)
2. **Enable the API.** APIs & Services -> Library -> "Google Search Console API" -> Enable. (Later for GA4: "Google Analytics Data API" -> Enable.)
3. **Create the service account.** IAM & Admin -> Service Accounts -> Create -> name `hq-search-reader`, ID `hq-search-reader` -> Create and continue -> **skip granting project roles** (it needs none) -> Done. Copy its email (`hq-search-reader@abracadabra-hq-search.iam.gserviceaccount.com`).
4. **If key creation is blocked.** New Google Cloud organizations enforce the policy "Disable service account key creation" by default. If step 5 shows that error: IAM & Admin -> Organization Policies -> `iam.disableServiceAccountKeyCreation` (and/or `iam.managed.disableServiceAccountKeyCreation`) -> override **for this project only** -> Not enforced. Leave it enforced everywhere else.
5. **Create a JSON key.** Service account -> Keys -> Add key -> Create new key -> JSON -> Create. A file downloads. Keep it off shared drives and chat; do not email it.
6. **Store it as a Cloudflare secret (your approval step).** From a machine with wrangler logged in to the Abracadabra account, in `handoff/`: `npx wrangler secret put GOOGLE_SA_KEY_JSON --config wrangler.jsonc` and paste the whole JSON when prompted (or `< key.json`). Only on the `handoff` Worker. Then delete the downloaded file. (Or tell Engineering Lead to run it with you present; the value is never printed.)
7. **Add the service account to Search Console.** search.google.com/search-console -> property `sc-domain:abra-ca-dabra.app` -> Settings -> Users and permissions -> Add user -> paste the SA email -> Permission **Restricted** -> Add.
8. **Tell Engineering Lead "done".** We verify with one `sites.list` call (should show `sc-domain:abra-ca-dabra.app` as `siteRestrictedUser`), then map it to the Abracadabra org.
9. **Later, GA4.** analytics.google.com -> Admin -> Property access management -> + -> add the SA email -> role **Viewer**. Send us the GA4 property ID (Admin -> Property details).
10. **Calendar:** rotate the key every 90 days (new key -> secret put -> verify -> delete old key). We'll add a reminder card.

For each new client: they add the same SA email as a Restricted user on their GSC property (and Viewer on GA4). Staff then map the property in HQ. No new keys per client.

---

## 15. Decisions (Oct 24, 2026)

All five review decisions are made. Christopher's words are quoted. His answers approve the spec, not a build.

| # | Question | Christopher's answer | Decision |
|---|---|---|---|
| 1 | Where the daily search data lives | "New database on CloudFlare" | New D1 database `handoff-search` (binding `SEARCH_DB`). Option B rejected (Appendix A). |
| 2 | PR order and pilot | "Ok" | PR order 1-6 as written; pilot on abra-ca-dabra.app. Approves the plan only; building still needs his OK. |
| 3 | Who in a client org sees search data | "Only account owners but other can be invited" | Owners by default; owners (or staff) grant other members or invitees; audited; agent API unaffected (6.1). |
| 4 | Daily limits | "Daily limits your choice" | Engineering's choice, delegated by Christopher: 200 URL Inspection checks per property per day; at most 5 new loop cards per client per day (3 per rule). Staff can tune per property later. |
| 5 | Where loop cards go | "Clients own board"; "All clients should be able to see the improvement cards so we can upsell them on more work for us" | Cards on the client's own board, visible to the whole client org, written for clients with a short offer of our work; internal analysis staff-only; nothing auto-published; fixes still need his approval (10.1). |

**Next step:** Christopher's OK to start building (PR 1, then the setup checklist in section 14). Each merge and deploy still needs his explicit OK.

## 16. Risks

- One SA has read access to every client's search data: mitigated by read-only scope, Restricted permission, secret on one Worker, rotation, audit, and per-org mapping.
- GSC per-user QPM is shared across all clients (one SA): global throttle; if we outgrow it, add a second SA/project and shard properties.
- Query anonymization and the 50k rows/day cap mean very large sites never get every query; documented in UI and API.
- Thresholds may create noisy cards: shadow mode + caps + per-org tuning.
- New dependency `recharts` via shadcn `chart`: small bundle increase on the client page only.

---

## Appendix A. Rejected: Option B (facts in the `handoff` database)

Put the fact tables in `handoff` (migration 0053) with stricter caps (query x page top 1,000/day, 13-month daily retention). Simpler to ship (one migrate runner), but every client's growth eats the 10 GB shared with all of HQ, and a bad bulk delete would contend with the app. **Rejected Oct 24, 2026** (decision 1: "New database on CloudFlare").
