# Google Search Console — Reference

Docs via Context7: `/websites/developers_google_webmaster-tools_v1`, `/ahonn/mcp-server-gsc`.

## MCP config example

```json
{
  "mcpServers": {
    "gsc": {
      "command": "npx",
      "args": ["-y", "mcp-server-gsc"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/gsc-sa.json"
      }
    }
  }
}
```

## Services

| Service | Capability |
|---------|------------|
| Search Analytics | Performance query |
| Sites | List / manage properties |
| Sitemaps | List / submit / delete |
| URL Inspection | Index status for a URL |

## Filter example

```json
{
  "dimensionFilterGroups": [
    {
      "groupType": "and",
      "filters": [
        {
          "dimension": "country",
          "operator": "equals",
          "expression": "usa"
        }
      ]
    }
  ]
}
```

Country codes in the API are often ISO-3166-1 alpha-3 (e.g. `usa`) depending on client — match the MCP/tool docs in use.

## Quick wins heuristic

High impressions + position roughly 4–20 + low CTR → title/meta/intent fix candidates. Always verify against page content before recommending rewrites.

## Handoff audit fields

```yaml
tool_status: ok
tools_used:
  - google-search-console
gsc_site_url: "sc-domain:example.com"
date_range: "2026-06-01/2026-06-28"
data_state: final
```
