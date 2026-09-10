# Google Analytics — Reference

Docs via Context7: `/googleanalytics/google-analytics-mcp`, `/websites/developers_google_analytics_devguides_reporting_data_v1`.

## Official GA MCP setup

```bash
claude mcp add analytics-mcp \
  --scope user \
  -e "GOOGLE_APPLICATION_CREDENTIALS=PATH_TO_CREDENTIALS_JSON" \
  -e "GOOGLE_PROJECT_ID=YOUR_PROJECT_ID" \
  -- pipx run analytics-mcp
```

Cursor: add equivalent MCP entry with the same env vars.

## run_report parameters (MCP / SDK)

| Param | Required | Notes |
|-------|----------|-------|
| `property_id` | yes | Numeric GA4 property |
| `date_ranges` | yes | `YYYY-MM-DD` or relative (`28daysAgo`) |
| `dimensions` | no | e.g. `date`, `country`, `eventName` |
| `metrics` | no | e.g. `sessions`, `activeUsers` |
| `limit` / `offset` | no | Pagination |
| `order_bys` | no | Sort |
| `filter_expression` | no | Dimension/metric filters |

## Relative dates

GA4 Data API accepts relative dates such as `yesterday`, `7daysAgo`, `28daysAgo`, `today`.

## Quota / sampling

- Prefer narrow date ranges and fewer dimensions when exploring.
- If the response indicates sampling, note it on the handoff.
- Realtime ≠ historical; do not mix without labeling.

## Handoff audit fields

```yaml
tool_status: ok  # or unavailable
tools_used:
  - google-analytics
ga4_property_id: "123456789"
date_range: "2026-06-01/2026-06-30"
```
