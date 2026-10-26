---
name: abracadabra-seo-search-console-in-hq
description: "Read a client's synced Google Search Console data inside HQ and turn it into improvement cards: GET /api/agent-search (totals, change, series, opportunities), /api/agent-search/rows (queries, pages, query x page pairs, country and device, filters, custom dates, pagination), /api/agent-search/indexing (stored URL Inspection and sitemaps), POST /api/agent-search/inspect (re-check asks), the search_update dispatch when a sync lands or keeps failing, and POST /api/agent-search/cards with its daily limits. Use when a client's search data updated, when planning SEO work for a client, or when asked how a client is doing in Google. Triggers: Search Console, GSC, clicks, impressions, CTR, position, striking distance, low CTR, traffic drop, search opportunities, search_update."
metadata:
  version: 1.0.0
  parent: abracadabra/seo-geo-aeo/SKILL.md
---

# Search Console data in HQ: read it, then act on it

Read the parent skill `abracadabra/seo-geo-aeo/SKILL.md` first. HQ syncs each client's Search Console data every day with one read-only service account. You never hold a Google key and never call Google yourself. Everything below uses your own agent token against `$HQ` (https://hq.abra-ca-dabra.app).

## 1. Know when there is new data

When a sync run finishes with no failed job, HQ writes one `search_update` entry per run for the client's lead agent and any SEO agent on that client:

```
GET $HQ/api/agent-work?dispatches=1[&since=<ms>]
```

Each `search_update` row has `reason` (`search_data`, or `search_failing` after 3 failed sync attempts in a row: the data may be stale; tell Client Services, never the client), `organization_id`, `title` (a one-line summary), `search.property_id`, `search.site_url`, `search.data_through`, `search.opportunities` (the top 5), and `search.read` (the URL to read next). There is no card yet. A failed run sends nothing; the next good run does.

## 2. Read the full picture

```
GET $HQ/api/agent-search?client=<organization id | domain | space slug>[&property=<id>][&range=7d|28d|90d|16m | &start=YYYY-MM-DD&end=YYYY-MM-DD][&compare=previous|yoy|none | &compare_start=&compare_end=][&include_partial=1]
```

- `org` works as an alias for `client`. Default range is 28d. Bad values are 400. Another client is 403. A property that is not this client's is 404.
- Windows end on the newest day Google has finalized; `partial_days` lists the newer days it may still change. `include_partial=1` adds them.
- Custom dates are clamped to the 16 months HQ keeps (`clamped: true`, `retention_floor`). `compare=yoy` compares the same dates a year earlier, as far back as HQ keeps.
- `totals` are site totals (every click). `query_totals` sums the query rows; the gap (`anonymized_click_share`) is rare queries Google hides for privacy. Never treat query rows as the whole site.
- `series` is the daily clicks and impressions for the window.
- Per property, `state` is `ok`, `empty` (synced, no rows in the window yet), `pending` (the client has not granted access; nothing is read) or `unavailable` with `reason` `no_db`, `not_ready` (the first sync has not run) or `error`. Report the state; don't guess numbers.
- `totals` and `previous` are clicks, impressions, CTR (clicks / impressions) and position (impression-weighted). `change` is a ratio for clicks and impressions, points for CTR and places for position (lower is better). 16m has no previous period.
- `data_through` is the newest final day. The newest 2-3 days can still change.
- `url_inspection` shows the property's daily URL Inspection budget (200 by default) and what was used today. Inspection runs inside the sync; agents do not spend it.
- `latest_update` is the newest sync event for the client.

## 2b. Dig into rows

```
GET $HQ/api/agent-search/rows?client=<...>&dimension=query|page|query_page|country|device|country_device
    [&page=<exact url> | &page_prefix=<url prefix>][&query_contains=a,b][&query_words=how,vs][&query_exclude=brand][&query_preset=questions]
    [&min_impressions=N][&max_clicks=0][&sort=clicks|impressions|ctr|position][&limit=1-1000][&cursor=<next_cursor>]
    plus the same date params as above
```

- `query_page` is for cannibalization: two pages sharing a query. Google gives HQ its top 5,000 query x page pairs a day.
- No regex (D1 has none): `query_contains` is any-of substrings, `query_words` any-of whole words, `query_preset=questions` adds how, what, why, when, where, who, which, can, does, is, should, best, vs, versus. Up to 10 terms each.
- `max_clicks=0` lists pages or queries with impressions and no clicks.
- Each row has `previous` and `change` when a comparison is on. Page with `next_cursor` until it is null; a cursor only works with the same query.
- Country and device are site level. Stored: query, page, query x page, country x device, web search only. No search appearance, and no AI Overview or AI Mode split (Search Console does not separate them).

## 2c. Indexing and re-checks

```
GET  $HQ/api/agent-search/indexing?client=<...>[&url=<exact> | &url_prefix=][&verdict=PASS|NEUTRAL|FAIL][&canonical_mismatch=1][&limit][&cursor]
POST $HQ/api/agent-search/inspect   {"client":"<domain>","urls":["https://..."]}
```

- Indexing returns stored URL Inspection results (verdict, coverage, Google's canonical vs the page's, last crawl, in sitemap), the sitemap list, and the inspection budget. `url=` adds that URL's coverage history. It never calls Google.
- Inspect asks HQ to re-check up to 20 URLs per property per day. They go first in the next daily inspection pass, inside the property's budget. Read the result next day with `indexing?url=`.

## 3. Read the opportunities

Thresholds are for 28 days and scale with the range.

| type | What it means | Usual fix |
|---|---|---|
| `low_ctr` | Query at position 10 or better, 300+ impressions, CTR under half of what that position usually gets | Rewrite title and meta description for the query's intent |
| `striking_distance` | Query at position 4-20 with 100+ impressions | Strengthen the ranking page: depth, answer-first sections, internal links |
| `query_drop` | Query lost 30%+ and 5+ clicks vs the previous period (10+ clicks before) | Check rankings, SERP changes, and the page that ranks |
| `page_drop` | Page lost 30%+ and 5+ clicks vs the previous period | Check indexing (URL Inspection results), recent edits, its top queries |
| `site_drop` | Whole property lost 20%+ of clicks (20+ before) | Find the pages and queries that dropped first; check for a Google update |

`clicks_at_stake` estimates clicks a period to gain (low CTR, striking distance) or already lost (drops). Bigger first. `why` is one sentence of evidence.

## 4. Turn an opportunity into a card

Pick the ones worth doing. Not every opportunity needs a card.

```
POST $HQ/api/agent-search/cards
{"client":"<domain>","opportunity_id":"low_ctr:1a2b3c4d","note":"<what you will do and how you will measure it>","assignee":"<agent_id>"}
```

- The opportunity must be in the current data (404 otherwise: read again).
- At most **5 search cards per client per UTC day** (429). Spend them on the biggest `clicks_at_stake`.
- One open card per opportunity (409 returns the existing `task_id`). A Done card frees it.
- The card goes through the normal agent card path: the client's HQ board, Todo, with the evidence in its note. A hire's card is its own; a lead can assign it.
- Nothing is published, scheduled or sent to the client. Then follow the board as usual: attach skills, move to Doing, file work with `POST /api/agent-work`.

## Rules

1. Numbers are staff-only. Never quote them to the client as-is; client updates go through Client Services.
2. Never invent a finding. Cite the opportunity id and the numbers HQ returned.
3. Nothing public without Christopher's approval in his own words (parent skill, hard rule 1).
4. No Google keys, no direct Search Console calls, no DNS changes.
