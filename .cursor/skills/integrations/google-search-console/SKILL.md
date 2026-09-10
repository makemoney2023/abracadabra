---
name: google-search-console
description: >-
  Use when querying Google Search Console performance (queries, pages, CTR,
  position), sitemaps, site properties, or URL inspection via GSC MCP or the
  Search Console API; also for SEO Phases 14–16 and organic cadence checks.
---

# Google Search Console

Live organic search performance and indexing signals.  
**Auth first:** `skills/integrations/google-auth/`.

## Access order

1. **MCP (preferred):** e.g. `mcp-server-gsc` (`npx -y mcp-server-gsc`) with `GOOGLE_APPLICATION_CREDENTIALS`.
2. **REST:** `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` (Discovery service `searchconsole` v1).

## Env

| Variable | Purpose |
|----------|---------|
| `GSC_SITE_URL` | Property URL: `https://www.example.com/` or `sc-domain:example.com` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account JSON |

URL-encode `siteUrl` in REST paths (`https://www.example.com/` → `https%3A%2F%2Fwww.example.com%2F`).

## Scopes

- `https://www.googleapis.com/auth/webmasters.readonly` (preferred for agents)
- `https://www.googleapis.com/auth/webmasters` (write — sitemaps submit)

## MCP tools (typical)

| Tool | Use |
|------|-----|
| `search_analytics` | Clicks, impressions, CTR, position by dimensions |
| `enhanced_search_analytics` | High row limits, regex filters, quick wins |
| `detect_quick_wins` | Position 4–20 / low CTR opportunities |
| list sites / sitemaps | Property + sitemap inventory |
| URL inspection | Index status for a URL (when exposed) |

Discover exact names with `GetMcpTools` before calling.

## Search Analytics body (REST)

```json
{
  "startDate": "2026-06-01",
  "endDate": "2026-06-30",
  "dimensions": ["query", "page"],
  "type": "web",
  "rowLimit": 1000,
  "dataState": "final"
}
```

**Dimensions:** `query`, `page`, `country`, `device`, `searchAppearance`, `date`, `hour`.  
**Filters:** `dimensionFilterGroups` with `contains` / `equals` / regex operators.  
**rowLimit:** 1–25000 (default 1000).  
**dataState:** `final` (default) vs `all` (includes fresh/partial).

## Digital-worker starter queries

| Goal | Dimensions | Tips |
|------|------------|------|
| Top queries | `query` | Sort by clicks; note CTR vs position |
| Page performance | `page` | Pair with on-page SEO packs |
| Query × page | `query`,`page` | Cannibalization / intent mismatch |
| Device split | `device` | Mobile CTR issues |
| Quick wins | query+page | Impressions high, position ~4–15, CTR low |

## Workflow for seats

1. Confirm `GSC_SITE_URL` matches a verified property.
2. Load this skill + google-auth.
3. Prefer `final` data for executive reporting; label `all` if used.
4. Record site URL, date range, and `tool_status` on handoff.
5. Pair findings with craft packs (`notfair-seo/seo-analysis`, `marketingskills/seo-audit`) — do not replace them.

## Pair with craft packs

- `skills/community/notfair-seo/seo-analysis/`
- `skills/community/marketingskills/seo-audit/`
- Owners: `seo-manager`, `content-strategist`, `cmo`, `head-of-data`

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Wrong property string | Domain properties need `sc-domain:` prefix |
| End date = today for `final` | GSC final data lags ~2 days; use through `yesterday` or earlier |
| Inventing rankings | Export or degrade — never fabricate |
| Ignoring encoding | Always encode `siteUrl` in REST |

## More detail

See [reference.md](reference.md).
