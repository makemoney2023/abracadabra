---
name: google-analytics
description: >-
  Use when querying GA4 reports, property summaries, realtime metrics, funnels,
  or conversions via Google Analytics MCP or the GA4 Data API; also when digital
  workers need live sessions, events, or KPI pulls for Phases 18–22.
---

# Google Analytics (GA4)

Pull live GA4 data for measurement, SEO/paid diagnosis, and operating cadence.  
**Auth first:** `skills/integrations/google-auth/`.

## Access order

1. **MCP (preferred):** official [`analytics-mcp`](https://github.com/googleanalytics/google-analytics-mcp) (`pipx run analytics-mcp`) with `GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT`.
2. **REST / client:** `BetaAnalyticsDataClient` → `analyticsdata.googleapis.com`.

## Env

| Variable | Purpose |
|----------|---------|
| `GA4_PROPERTY_ID` | Numeric property id (not the G-XXXXXXXX measurement id) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account JSON |
| `GOOGLE_CLOUD_PROJECT` | GCP project for MCP / quota |

## MCP tools (typical)

| Tool | Use |
|------|-----|
| `get_account_summaries` | List accounts / properties |
| `run_report` | Core report (dimensions + metrics + date ranges) |
| `run_realtime_report` | Last ~30–60 minutes |
| `run_funnel_report` | Funnel steps |
| `run_conversions_report` | Conversion events |

Discover exact tool names with `GetMcpTools` before calling.

## Core report recipe (Data API)

Property resource: `properties/{GA4_PROPERTY_ID}`.

```python
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest

client = BetaAnalyticsDataClient()
response = client.run_report(
    RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[Dimension(name="sessionDefaultChannelGroup")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="engagedSessions"),
            Metric(name="conversions"),
        ],
        date_ranges=[DateRange(start_date="28daysAgo", end_date="yesterday")],
    )
)
```

## Digital-worker starter queries

| Goal | Dimensions | Metrics |
|------|------------|---------|
| Channel mix | `sessionDefaultChannelGroup` | `sessions`, `engagedSessions`, `conversions` |
| Landing pages | `landingPage` | `sessions`, `bounceRate`, `conversions` |
| Campaign | `sessionSource`, `sessionMedium`, `sessionCampaignName` | `sessions`, `conversions` |
| Events | `eventName` | `eventCount`, `totalUsers` |
| Geo | `country` | `activeUsers` |

## Workflow for seats

1. Confirm `GA4_PROPERTY_ID` (or run `get_account_summaries`).
2. Load this skill + google-auth.
3. Run the smallest report that answers the phase question.
4. Cite property id, date range, and `tool_status: ok|unavailable` on the handoff.
5. Never invent rows — if blocked, use tracking-plan / export stubs from craft packs.

## Pair with craft packs

- `skills/community/marketingskills/analytics/` — tracking plan, GTM/GA4 implementation
- Position owners: `analytics-engineer`, `head-of-data`, `seo-manager`, `cmo`, `paid-media-manager`, `lifecycle-marketer`

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Using Measurement ID `G-…` as property id | Use Admin → Property Settings numeric id |
| Comparing overlapping date ranges without labeling | State ranges explicitly on handoff |
| Reporting realtime as historical | Use `run_report` for closed periods |
| Skipping auth skill | Always resolve credentials first |

## More detail

See [reference.md](reference.md) for dimensions/metrics notes and MCP setup.
