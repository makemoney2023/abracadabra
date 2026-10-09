# MCP connectors implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Super admins see the Cloudflare MCP portal's servers on HQ and turn each one on or off for the shared service-token grant. HQ-started swarm runs call that same portal. Search Console is the first hosted adapter behind it.

**Architecture:** HQ talks to `MCP_PORTAL_URL` with the Access service token and the portal's own tools `portal_list_servers` and `portal_toggle_single_server`. The catalog id `portal` is the only new swarm server, and the swarm injects the Access headers only after `SWARM_RUN_SECRET` checks out. `handoff-connectors` is a separate Worker the portal links; HQ never rewrites the portal's server mapping.

**Tech Stack:** Next.js 16, React 19, Vitest, the existing swarm Worker, a new Cloudflare Worker for connectors, D1 for `connector_grants`.

**Design:** [`docs/superpowers/specs/2026-10-09-mcp-connectors-design.md`](../specs/2026-10-09-mcp-connectors-design.md). Requirements MCP-001 through MCP-028. This plan replaces the connector half of step 16 in [`docs/hq-agent-spec.md`](../../hq-agent-spec.md). The agent still opens one portal URL.

---

## Repository boundary

Work is in [`handoff/`](../../../handoff/), [`swarm/`](../../../swarm/), and a new `connectors/` worker at the repo root. Do not put `CLOUDFLARE_API_TOKEN` on HQ. Do not call `PUT` on the portal resource from application code. Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>` with `GIT_AUTHOR_*` and `GIT_COMMITTER_*` on the commit command. Do not change git config.

## File structure

| Path | Responsibility |
| --- | --- |
| `handoff/src/lib/portal-session.ts` | List and toggle against the portal grant |
| `handoff/src/lib/portal-session.test.ts` | Fixture parses, empty config, toggle error |
| `handoff/src/lib/mcp-catalog.ts` | Catalog id `portal` |
| `handoff/src/lib/mcp-catalog.test.ts` | Portal URL resolution |
| `handoff/src/lib/client-workflows.ts` | Empty stored ids become `portal` when the URL is set; save/execute send the run secret |
| `handoff/src/app/mcp/page.tsx` | Server list |
| `handoff/src/app/mcp/actions.ts` | Super-admin toggle |
| `handoff/src/app/staff-links.ts` | System nav item |
| `handoff/src/app/staff-nav.tsx` | `Plug` icon |
| `connectors/src/index.ts` | Bearer gate and `/mcp/{id}` dispatch |
| `connectors/src/registry.ts` | Module list |
| `connectors/src/search-console.ts` | Two tools, grant lookup |
| `connectors/test/` | 401, unknown id, missing grant, ignored site URL |
| `handoff/migrations/0020_connector_grants.sql` | Grant table. Next free number after `0019_project_description.sql`. |
| `swarm/src/do/WorkflowDO.ts` | Drop `portal` unless the run secret matches; inject Access headers |

## Global constraints

- On/off is the service-token grant. Detaching a server is not the switch.
- `portal_toggle_single_server` arguments are `server_id` and `action` (`toggle` or `untoggle`).
- An elicitation URL is an error string on the page.
- Access secrets and `SWARM_RUN_SECRET` never land in D1, Durable Object storage, R2, or the PDF.
- `swarm-demo` still resolves on the swarm origin and does not need the run secret.
- Tests mock `fetch`. They do not call the live portal or Google.

---

### Task 1: Portal session client

**Files:**
- Create: `handoff/src/lib/portal-session.ts`
- Test: `handoff/src/lib/portal-session.test.ts`

- [x] **Step 1: Write the failing test**

Cover four cases:

1. Empty `MCP_PORTAL_URL` returns `{ ok: true, servers: [] }` and the mock fetch is not called.
2. A fixture whose `tools/call` result content is `[{"server_id":"handoff","name":"Handoff","enabled":true}]` parses to one server.
3. The same row under `result.servers`, and a row that only has `id`, also parse. A row with no id is dropped.
4. `setPortalServer({ serverId: "handoff", enabled: false })` posts `portal_toggle_single_server` with `action: "untoggle"`, then lists again. A body that includes `https://mcp.example/authorize` returns `{ ok: false }` and does not report the server as off.

- [x] **Step 2: Run the test and confirm it fails** because the module is missing.

```bash
cd handoff && npx vitest run src/lib/portal-session.test.ts
```

- [x] **Step 3: Implement the client**

`listPortalServers(env, fetchImpl)` and `setPortalServer(env, input, fetchImpl)`. POST JSON-RPC to `MCP_PORTAL_URL` with the two Access headers and `Accept: application/json, text/event-stream`. Initialize is best-effort, matching `swarm/src/mcp/client.ts`: send `initialize`, keep `mcp-session-id` when present, ignore a failed `notifications/initialized`.

- [x] **Step 4: Re-run the test until it passes.**

### Task 2: `/mcp` page

**Files:**
- Create: `handoff/src/app/mcp/page.tsx`
- Create: `handoff/src/app/mcp/actions.ts`
- Modify: `handoff/src/app/staff-links.ts`
- Modify: `handoff/src/app/staff-nav.tsx`
- Test: `handoff/src/app/staff-links.test.ts`
- Test: `handoff/src/app/mcp/actions.test.ts`

- [x] **Step 1: Write the failing tests**

`staff-links.test.ts` expects System to be GitHub then `/mcp`, and every nav href to have an icon.

`actions.test.ts` expects a non-super-admin caller to get the not-found path `requireHqSuperAdminPage` already uses, and a super admin toggle to call `setPortalServer` with the posted `serverId` and `enabled`.

- [x] **Step 2: Run those tests and confirm the nav assertion fails.**

- [x] **Step 3: Add the nav item and the page**

System group, label `MCP`, href `/mcp`, icon `Plug`. The page calls `requireHqSuperAdminPage`, then `listPortalServers`. Empty URL and empty list use the copy in MCP-009 and MCP-010. Each row is a form posting `serverId` and the next `enabled` value. The action revalidates `/mcp`.

- [x] **Step 4: Re-run the nav test, the action test, and eslint on the new files.**

### Task 3: Catalog id `portal`

**Files:**
- Modify: `handoff/src/lib/mcp-catalog.ts`
- Modify: `handoff/src/lib/mcp-catalog.test.ts`
- Modify: `handoff/src/lib/client-workflows.ts`
- Modify: `handoff/src/lib/lead-swarm.ts`
- Test: `handoff/src/lib/client-workflows.test.ts`
- Test: `handoff/src/lib/lead-swarm.test.ts`

- [x] **Step 1: Write the failing tests**

1. `allowedMcpIds(["portal", "swarm-demo"])` returns both. `["https://evil.example/mcp"]` is still null.
2. Resolving `portal` with portal URL `https://mcp.example/mcp` yields that exact URL. An http portal URL is null. Resolving `swarm-demo` still appends `/demo-mcp/mcp` to the swarm origin.
3. `runClientWorkflow` with `mcp_server_ids` null and a configured portal URL posts `mcpServers: [{ id: "portal", name: "MCP portal", url }]` and no `headers`. The save and execute requests send `Authorization: Bearer test-run-secret`.
4. The same run with portal URL empty still posts no `mcpServers`.
5. A stored `["swarm-demo"]` stays demo-only even when the portal URL is set.

- [x] **Step 2: Run the catalog and workflow tests and confirm the new cases fail.**

- [x] **Step 3: Implement resolution and the secret header**

`mcpServersFor` takes the swarm origin and an optional portal URL. `runLeadSwarm` accepts an optional `runSecret` and sets the Authorization header when it is non-empty. `runClientWorkflow` passes `env.MCP_PORTAL_URL` and `env.SWARM_RUN_SECRET` from the existing server env helper used by other HQ calls. Add both names to `handoff/.env.example` as empty values, with a comment that they match the agent Access token and the swarm run bearer.

- [x] **Step 4: Re-run `npx vitest run src/lib/mcp-catalog.test.ts src/lib/client-workflows.test.ts src/lib/lead-swarm.test.ts`.**

### Task 4: Swarm secret gate

**Files:**
- Modify: `swarm/src/do/WorkflowDO.ts`
- Modify: `swarm/src/index.ts`
- Test: add a node test next to the existing swarm tests, named `src/mcp/portal-gate.test.ts`, that exercises a pure helper rather than the Durable Object.

- [x] **Step 1: Write the failing test**

Extract `portalAllowed(authorization, secret)` and `serversForRun(servers, allowed)`:

1. A matching bearer allows the run.
2. A missing or wrong bearer does not.
3. When the run is not allowed, the `portal` entry is removed and `swarm-demo` remains.
4. `headersFor(server, env, allowed)` adds the two Access headers only for id `portal` when allowed and both env values are set. A `headers` field already on that server is not copied.

- [x] **Step 2: Run `npm test` in `swarm/` and confirm the new file fails.**

- [x] **Step 3: Use the helper in `WorkflowDO` before `collectNodeTools`.**

Compare the secret with a constant-time equal on equal-length hashes (SHA-256 of the provided bearer and of `SWARM_RUN_SECRET`) so a short guess does not exit early on length alone. Add `SWARM_RUN_SECRET`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` to the swarm `Env` and document them in `swarm/README.md` and `swarm/DEPLOYMENT.md`.

- [x] **Step 4: Re-run `npm test` and `npx tsc --noEmit` in `swarm/`.**

### Task 5: Connector grants

**Files:**
- Create: `handoff/migrations/0020_connector_grants.sql`
- Modify: `handoff/src/db/migration-sql.ts`
- Modify: `handoff/src/db/migrate.ts`
- Create: `handoff/src/lib/connector-grants.ts`
- Test: `handoff/src/lib/connector-grants.test.ts`
- Modify: the client page and `handoff/src/app/clients/actions.ts`

- [x] **Step 1: Write the failing test**

`saveConnectorGrant` upserts one row for the organization and `search-console`. A second save replaces `resource`. A staff caller who cannot see the client is refused. An empty resource deletes the row.

- [x] **Step 2: Run it and confirm failure.**

- [x] **Step 3: Add the migration, the save function, and a text field on the client page labeled with the connector id.** The field posts through a staff action that calls `requireHqStaffPage`. Show the saved resource on the next render.

- [x] **Step 4: Re-run the grant test and the migrate test.**

### Task 6: `handoff-connectors`

**Files:**
- Create: `connectors/` Worker (package, `wrangler.jsonc`, `src/index.ts`, `src/registry.ts`, `src/search-console.ts`, tests)

- [x] **Step 1: Write the failing tests**

1. No bearer, or the wrong bearer, is 401 and the Google fetch mock is not called.
2. `POST /mcp/missing` is 404.
3. `tools/list` on `/mcp/search-console` returns `search_analytics` and `inspect_url`.
4. `tools/call` with no grant returns a JSON-RPC error and does not call Google.
5. `tools/call` with `site_url` set and a grant row calls Google with the grant's `resource` only.
6. A second module registered in the test registry is listed at its own path.

- [x] **Step 2: Run the connector tests and confirm failure.**

- [x] **Step 3: Implement the Worker**

D1 binding for grants, secret `CONNECTOR_TOKEN`, secret `GOOGLE_SEARCH_CONSOLE_SA`. The Google call can be a thin `fetch` to the Search Console API using a JWT from the service account. Keep the HTTP shape in one function so the test injects a fake fetch. Hostname in the wrangler config is `connectors.abra-ca-dabra.app` as a route comment until the operator attaches the zone. Do not create the DNS record from this task.

- [x] **Step 4: Re-run the connector tests.**

### Task 7: Docs and operator note

**Files:**
- Modify: `handoff/README.md` Agent section
- Modify: `swarm/README.md` MCP section
- Modify: `handoff/CHANGELOG.md`
- Modify: `connectors/README.md` (create)

- [x] **Step 1: Document the page, the catalog id, the run secret, and the operator link for Search Console (MCP-028).**

- [x] **Step 2: Run the full handoff vitest suite, swarm `npm test`, swarm `tsc`, connector tests, and eslint on the touched files. Record the counts in the changelog.**

## Operator check after secrets exist

This is not a unit test. After `MCP_PORTAL_URL` and the Access token are set on HQ:

1. Open `/mcp` as a super admin and confirm the linked servers render.
2. Turn a non-Handoff server off, start a swarm, and confirm that server's tools are absent from the run.
3. Turn it on and confirm the next run can call one of its tools.
4. Leave Handoff on. The agent wake still has `client_context`.

## Deferred

- Per-tool allowlists on `/mcp`. Those stay in the Cloudflare portal mapping.
- A Cloudflare API read of sync status and `authentication_status`.
- Google Analytics as a remote server.
