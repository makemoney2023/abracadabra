# MCP connectors — design specification

**Date:** 2026-10-09
**Product:** Handoff HQ (`hq.abra-ca-dabra.app`), the HQ agent, and the swarm worker
**Status:** Implemented
**Requirements:** MCP-001 through MCP-028
**Lives in:** [`handoff/`](../../../handoff/), [`swarm/`](../../../swarm/), and a new worker `handoff-connectors`
**Plan:** [`docs/superpowers/plans/2026-10-09-mcp-connectors.md`](../plans/2026-10-09-mcp-connectors.md)
**Extends:** [`docs/hq-agent-spec.md`](../../hq-agent-spec.md) sections 2.3, 2.4, and build step 16

## Executive summary

The agency already has one Cloudflare MCP portal at `https://mcp.abra-ca-dabra.app/mcp`. The HQ agent is specified to open that URL with an Access service token and to use whatever tools the portal publishes. Swarm runs are separate: HQ will only attach catalog ids, and the only catalog id today is `swarm-demo` (`get_time`, `echo`, `word_count`).

This spec makes the portal the tool source for both the agent and HQ-started swarm runs, and gives super admins a page that lists the servers on that grant and turns each one on or off.

```text
Cloudflare MCP portal (one URL, one service-token grant)
  → linked upstream servers (handoff, later search-console, later remote products)
  → portal_list_servers shows each server and whether this grant has it on
  → /mcp renders that list; a switch calls portal_toggle_single_server
  → the next agent wake and the next swarm run see the tools of the servers that are on
```

Clients do not see this page. The canvas Plug button stays a local way to try a Streamable HTTP URL. HQ-started runs do not copy those URLs.

## Current state

Checked against the code on 2026-10-09, and against the Cloudflare MCP Portals docs and the Access OpenAPI for `GET/PUT /accounts/{account_id}/access/ai-controls/mcp/portals/{id}`.

- The portal hostname is live. Production `MCP_PORTAL_URL` is still empty until the service token and the Handoff upstream are linked (`docs/hq-agent-spec.md` section 18).
- `handoff-agent` connects with `addMcpServer` and reads `getAITools()` on each wake (`handoff/src/agent/worker.ts`).
- HQ's catalog is one entry, `swarm-demo`, resolved onto the swarm origin at `/demo-mcp/mcp` (`handoff/src/lib/mcp-catalog.ts`). `create_workflow` stores those ids. Any other address is refused.
- A stored empty list means the swarm run has no MCP servers (`handoff/src/lib/client-workflows.ts`).
- The swarm speaks Streamable HTTP, supports per-server headers, and mounts the demo at `/demo-mcp/mcp` (`swarm/src/mcp/client.ts`, `swarm/src/mcp/demo.ts`). `POST /api/save` and `POST /api/execute` have no shared secret. The worker would attach any URL a caller saved.
- The staff menu System group is GitHub only (`handoff/src/app/staff-links.ts`). GitHub uses `requireHqSuperAdminPage`.
- `handoff-connectors`, `connector_grants`, and `connectors.abra-ca-dabra.app` are specified and not created.

Cloudflare's portal has two different controls. This spec uses the second one for the HQ switch.

| Control | What it changes | Who HQ uses it |
|---|---|---|
| Portal mapping (`servers[]` on the portal, including `default_disabled` and `updated_tools[].enabled`) | Which servers are linked, which tools exist, aliases, and whether **Require user auth** (`on_behalf`) is on | Operator setup in the Cloudflare dashboard or API. HQ does not rewrite this list. A `PUT` that includes `servers` replaces the whole mapping, and omitting a server detaches it. |
| Session grant (`portal_list_servers`, `portal_toggle_single_server`) | Which linked servers are on for one portal authorization grant | The HQ page, the agent, and swarm runs, all with the same Access service token. For stateless MCP, a toggle applies to later requests that use that grant. |

`portal_toggle_single_server` takes `server_id` and `action` (`toggle` or `untoggle`). If the server still needs a per-user OAuth grant, the portal falls back to a browser URL. A service token cannot finish that grant. Servers with `on_behalf: true` are already hidden from a service-token session.

## Goals

- Super admins open `/mcp` and see the servers the service token can list, with a clear on or off state.
- Turning a server off removes its tools from the next agent wake and the next HQ-started swarm run. Turning it on brings them back. The server stays linked on the portal, and its stored admin credential stays put.
- HQ-started swarm runs call the portal, with the Access headers injected inside the swarm worker. The catalog still refuses any URL that is not a catalog id.
- The swarm's public API cannot spend the Access secret. Only a request that presents `SWARM_RUN_SECRET` may run the portal server.
- Search Console is the first adapter on `handoff-connectors`, behind the same portal, and it shows up on `/mcp` once it is linked.

## Non-goals

- Rewriting the portal's server list, tool allowlist, or aliases from HQ.
- Putting `CLOUDFLARE_API_TOKEN` on the HQ worker for this page.
- Per-client portals, or a different on/off set per client. One grant serves the agency.
- Letting the agent turn servers on or off by itself.
- Replacing the canvas Plug button.
- Letting a swarm step call an upstream URL that bypasses the portal.
- Google Analytics. When it is added later, it is a remote portal link, the same shape as any other remote server.

## Requirements

### Portal grant

- **MCP-001.** Listing and toggling use `MCP_PORTAL_URL` with `CF-Access-Client-Id` and `CF-Access-Client-Secret`. An empty URL or a missing header pair returns a configured-empty result and does not call the network.
- **MCP-002.** List calls MCP `tools/call` on `portal_list_servers`. The parser accepts a JSON array in a text content block, or a JSON object whose `servers` array has the same rows. Each row yields `serverId`, `name`, and `enabled`. `server_id` and `id` both count as the id. A row missing an id is dropped.
- **MCP-003.** Toggle calls `portal_toggle_single_server` with `{ server_id, action }` where `action` is `toggle` to turn on and `untoggle` to turn off. The page then lists again and renders that list.
- **MCP-004.** A portal error, a non-JSON body, or a response that contains an elicitation URL leaves the previous switch unchanged and returns the portal's message. The page does not redirect staff to that URL.
- **MCP-005.** Tests use a recorded fixture. They do not call `mcp.abra-ca-dabra.app`.

### HQ page

- **MCP-006.** `/mcp` is in the System group, after GitHub. The label is `MCP`. The icon is `Plug`.
- **MCP-007.** The page and the toggle action use `requireHqSuperAdminPage`. Anyone else gets the same not-found response GitHub settings use.
- **MCP-008.** The page lists `name`, `serverId`, and a switch bound to `enabled`. The Handoff server is a normal row.
- **MCP-009.** When the portal is not configured, the page says the portal URL is empty and renders no switches.
- **MCP-010.** When the list is empty and the portal is configured, the page says no servers are visible to the service token.
- **MCP-011.** A failed toggle shows the error on the page and keeps the switch on the last successful list.
- **MCP-012.** The page does not show bearer tokens, Access secrets, or upstream credentials.

### Swarm runs

- **MCP-013.** The catalog gains `portal`. `swarm-demo` stays. Any other id is still rejected.
- **MCP-014.** Resolving `portal` uses `MCP_PORTAL_URL` and requires `https://`. The URL stored on the run is that configured value. A caller cannot substitute a different host.
- **MCP-015.** A workflow whose stored ids are null or empty resolves to `["portal"]` when the portal URL is configured, and to no servers when it is not. A workflow that already stores ids uses those ids only.
- **MCP-016.** The JSON sent to the swarm for `portal` is `{ id: "portal", name: "MCP portal", url }` with no `headers` field.
- **MCP-017.** Handoff sends `Authorization: Bearer <SWARM_RUN_SECRET>` on the save and execute calls for a run that includes `portal`. The comparison on the swarm is constant-time. A missing secret is treated as absent, not as a crash.
- **MCP-018.** The swarm injects `CF-Access-Client-Id` and `CF-Access-Client-Secret` only when the server id is `portal`, the execute request presented the run secret, and both Access values are set. Headers saved on the workflow are ignored for that id.
- **MCP-019.** An execute without the run secret drops the `portal` server before tool discovery. The rest of the run still starts. `swarm-demo` does not need the secret.
- **MCP-020.** The Access values and the run secret are never written to Durable Object storage, R2, logs, or the PDF.

### Connectors

- **MCP-021.** `handoff-connectors` is one Worker. `POST /mcp/{id}` speaks Streamable HTTP JSON-RPC for a module in the registry. An unknown id is 404.
- **MCP-022.** Every request must send `Authorization: Bearer <CONNECTOR_TOKEN>`. A missing or wrong token is 401 and makes no vendor call.
- **MCP-023.** The first module is `search-console` with tools `search_analytics` and `inspect_url`. Inputs are the query fields those tools need, plus `organizationId`. They do not include a site URL.
- **MCP-024.** The worker reads `connector_grants` for that organization and `search-console`. No row means a JSON-RPC error and no Google call. A model-supplied site URL is ignored. The call uses `resource`.
- **MCP-025.** Grants are migration `0020_connector_grants.sql`. That is the next free number after `0019_project_description.sql`. The statement matches section 2.4 of the HQ agent spec: one row per organization and connector, `resource` required. The same SQL is embedded for the worker migrate step.
- **MCP-026.** A second registry module is reachable at its own path without a change to `handoff-agent` or to the `/mcp` page.
- **MCP-027.** Staff set `resource` on the client page. The control is a single text field for Search Console, saved by a staff action, and shown back on that client.
- **MCP-028.** Linking `search-console` on the portal stays an operator step: upstream `https://connectors.abra-ca-dabra.app/mcp/search-console`, headers `CF-Access-Client-Id`, `CF-Access-Client-Secret`, and `Authorization: Bearer <CONNECTOR_TOKEN>`, **Require user auth** off. After that link, the server appears on `/mcp`.
- **MCP-029.** Public-web research for swarm researcher steps is the remote server `parallel-search`, not a `handoff-connectors` module. Upstream `https://search.parallel.ai/mcp`, `auth_type` `bearer`, **Require user auth** off. The bearer is the Parallel API key. Connection settings pin `mode=fast` and `advanced_settings.max_results=5` through `x-parallel-search-config`. Synced tools are `web_search` and `web_fetch`. Task MCP stays unlinked. Attaching it to the portal keeps every existing `server_id`. The key is never written to the swarm, to HQ, or to git.

## Data model

```sql
CREATE TABLE connector_grants (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  connector_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (organization_id, connector_id)
);
```

No table stores on/off. That state lives on the portal grant.

## Config

| Name | Where | Purpose |
|---|---|---|
| `MCP_PORTAL_URL` | `handoff` and `handoff-agent` and `swarm` | `https://mcp.abra-ca-dabra.app/mcp` once the service token is linked. |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | `handoff`, `handoff-agent`, and `swarm` | The same Access service token. HQ uses it to list and toggle. The swarm uses it only for an authorized `portal` call. |
| `SWARM_RUN_SECRET` | `handoff` (sender) and `swarm` (verifier) | Bearer required before the swarm will attach the portal. |
| `CONNECTOR_TOKEN` | `handoff-connectors` and the portal's stored header for that upstream | Bearer the portal sends to the connector worker. |
| `GOOGLE_SEARCH_CONSOLE_SA` | `handoff-connectors` | Service-account JSON. It is not stored on the portal and not on the agent. |

Add the new names to `handoff/.env.example` and `swarm/.env.example` (or the swarm README env list if that worker has no example file) with empty values. Do not commit secrets.

## Verification

- `npx vitest run` in `handoff/` for the portal client, the catalog, workflow resolution, the page action, and grants.
- `npm test` and `npx tsc --noEmit` in `swarm/` for the secret gate and header injection.
- The connector worker's unit tests for 401, unknown id, missing grant, and ignored site URL.
- ESLint on the touched files.

A live toggle against `mcp.abra-ca-dabra.app` is an operator check after the secrets are set. The automated suite stays on fixtures.
