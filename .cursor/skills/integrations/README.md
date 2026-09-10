# Integrations — API / MCP skills for digital workers

Portable how-to skills for calling external tools.  
**Seat map:** [`../org/TOOL-REGISTRY.md`](../org/TOOL-REGISTRY.md)

## Full (Google)

| Skill | Purpose |
|-------|---------|
| [`google-auth`](./google-auth/) | Shared ADC / service-account setup |
| [`google-analytics`](./google-analytics/) | GA4 Data API + official analytics-mcp |
| [`google-search-console`](./google-search-console/) | GSC Search Analytics + GSC MCP |

## Thin adapters

| Skill | Points at |
|-------|-----------|
| [`pagespeed-insights`](./pagespeed-insights/) | PSI / Lighthouse |
| [`google-ads`](./google-ads/) | Ads API / exports |
| [`firecrawl`](./firecrawl/) | `user-firecrawl-mcp` |
| [`parallel-research`](./parallel-research/) | Parallel plugin |
| [`context7-docs`](./context7-docs/) | Context7 MCP |
| [`figma`](./figma/) | Figma MCP + plugin skills |
| [`supabase`](./supabase/) | Supabase MCP |
| [`vercel`](./vercel/) | Vercel MCP |
| [`github`](./github/) | GitHub MCP / `gh` |
| [`stripe`](./stripe/) | Stripe plugin |
| [`fal-media`](./fal-media/) | fal Veo/FLUX |
| [`elevenlabs`](./elevenlabs/) | ElevenLabs TTS |
| [`obsidian-secrets`](./obsidian-secrets/) | Vault / `.env.local` keys |
| [`playwright-browser`](./playwright-browser/) | Browser MCP |
| [`shadcn-ui`](./shadcn-ui/) | shadcn MCP |

## Rules

1. Craft packs stay in `skills/community/*` — these skills are for live access only.
2. Prefer MCP when connected; else documented REST/CLI fallback.
3. Secrets: Obsidian MCP → `.env.local`. Never invent metrics or keys.
4. Handoffs: record `tool_status: ok|unavailable` and ids used (`ga4_property_id`, `gsc_site_url`).
