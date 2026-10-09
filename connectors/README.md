# handoff-connectors

One Worker for products that have an API and no remote MCP URL. The Cloudflare MCP portal links each module at `https://connectors.abra-ca-dabra.app/mcp/{id}`.

The first module is `search-console` (`search_analytics`, `inspect_url`). It reads `connector_grants.resource` for the organization and ignores any site URL the model sends. A missing grant returns a JSON-RPC error and does not call Google.

Every request needs `Authorization: Bearer $CONNECTOR_TOKEN`. The Google service-account JSON is `GOOGLE_SEARCH_CONSOLE_SA` on this worker only.

```bash
npm install
npm test
npx wrangler secret put CONNECTOR_TOKEN
npx wrangler secret put GOOGLE_SEARCH_CONSOLE_SA
npm run deploy
```

The zone route for `connectors.abra-ca-dabra.app` is attached by the operator. This config does not create that DNS record.

Image, video, and voice keys are specified to land on this worker as `FAL_KEY`, `INFSH_API_KEY`, and `ELEVENLABS_API_KEY`. That module is not built yet. The design is [docs/superpowers/specs/2026-10-09-studio-secrets-design.md](../docs/superpowers/specs/2026-10-09-studio-secrets-design.md).
