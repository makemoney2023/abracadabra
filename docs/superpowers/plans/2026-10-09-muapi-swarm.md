# MuAPI on the swarm — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can run an ad strategy on the swarm, approve it, and render stills, crops, a spot, and music through MuAPI. The MuAPI key lives on the Cloudflare MCP portal. The swarm never stores it.

**Architecture:** An operator links remote MCP server `muapi` (`https://api.muapi.ai/mcp`) on `https://mcp.abra-ca-dabra.app/mcp` with a bearer credential, an allowlist, and **Require user auth** off. HQ `/mcp` remains the on/off switch. The swarm gains `mcpToolNames` so strategy nodes get no tools and each render node gets one job. Three hand-authored templates and one self-contained skill carry the procedure.

**Tech Stack:** The existing swarm Worker (Vitest, Workers AI, Durable Objects), the existing HQ portal page, Cloudflare MCP portals.

**Design:** [`docs/superpowers/specs/2026-10-09-muapi-swarm-design.md`](../specs/2026-10-09-muapi-swarm-design.md). Requirements MUAPI-001 through MUAPI-024.

---

## Repository boundary

Code lands in [`swarm/`](../../../swarm/) and [`.cursor/skills/community/muapi-render/`](../../../.cursor/skills/community/muapi-render/). The portal link is an operator step in the Cloudflare dashboard. Do not `PUT` the portal's `servers` array from application code. Do not add `MUAPI_API_KEY` to a Worker. Do not add a `connector_grants` migration. Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>` with `GIT_AUTHOR_*` and `GIT_COMMITTER_*` on the commit command. Do not change git config.

## File structure

| Path | Responsibility |
| --- | --- |
| `swarm/src/mcp/tool-allow.ts` | Filter discovered tools by `mcpToolNames`. Report missing names. |
| `swarm/src/mcp/tool-allow.test.ts` | Empty list, omitted list, subset, missing name. |
| `swarm/src/types.ts` | `mcpToolNames` on `AgentNode`. Templates `ad-strategy`, `ad-render`, `ad-poll`. |
| `swarm/src/templates/ad-studio.test.ts` | Template order, allowlists, skill paths, absence from the generated pack file. |
| `swarm/src/do/WorkflowDO.ts` | Apply the filter before `runAgent`. Fail the node when a required name is missing. |
| `swarm/frontend/src/components/AgentNode.tsx` | `mcpToolNames` on node data. |
| `swarm/frontend/src/App.tsx` | Copy the field on template load and on the save payload. |
| `.cursor/skills/community/muapi-render/SKILL.md` | One-file render procedure. |
| `swarm/DEPLOYMENT.md` | The MuAPI key is a portal credential, not a worker secret. |

`pack-templates.json` stays generated. Do not hand-edit it. `npx tsx scripts/write-pack-templates.ts` from `handoff/` must not grow an `ad-strategy` row, because that script only reads skill folders.

## Global constraints

- Tests mock nothing on the network. They do not call `api.muapi.ai` or `mcp.abra-ca-dabra.app`.
- Omitted `mcpToolNames` preserves today's behavior: the node sees every discovered tool.
- `[]` means no tools, including when the portal has MuAPI turned on.
- A non-empty list that is not a subset of the discovered names fails the node before the model runs.
- Render nodes stay within the existing cap of 8 tool rounds.
- The API key never appears in source, fixtures, Durable Object storage, R2, or the PDF.

---

### Task 1: Link MuAPI on the portal

Operator step. No code. Covers MUAPI-001 through MUAPI-009 and the live half of MUAPI-020.

- [ ] **Step 1: Create a sandbox key**

In the MuAPI dashboard, create a key with `is_test: true`. Keep it out of git and out of Worker secrets.

- [ ] **Step 2: Add the remote server**

In **Zero Trust → Access controls → MCP servers**, add a server:

- Name and server id: `muapi`
- HTTP URL: `https://api.muapi.ai/mcp`
- Credential: bearer. The stored value is the sandbox key. The portal sends `Authorization: Bearer <key>`.
- Skip OAuth and dynamic client registration. MuAPI's MCP door is the bearer header.

If the add dialog only offers OAuth, set `auth_type` to `bearer` and `auth_credentials` to the key on the server record. Do not put the key in the URL.

- [ ] **Step 3: Attach it to the agency portal**

On portal `mcp.abra-ca-dabra.app`:

- Add server `muapi`.
- Turn **Require user auth** off.
- On that server's Access application, add a Service Auth policy for the same service token the HQ agent already uses.
- Set the mapping to `default_disabled: true`.
- Turn on only: `search_models`, `muapi_image_generate`, `muapi_image_edit`, `muapi_video_generate`, `muapi_video_from_image`, `muapi_predict_result`, `muapi_enhance_upscale`, `muapi_enhance_bg_remove`, `muapi_audio_create`, `muapi_account_balance`.
- Leave aliases equal to those upstream names.
- Leave context optimization off, so `tools/list` returns the enabled tools.

A `PUT` that includes `servers` replaces the whole portal mapping. Start from a `GET` and keep `handoff` and `search-console` with their current fields. Prefer the dashboard tools panel, which edits one server.

- [ ] **Step 4: Confirm the grant, then leave it off**

Open HQ `/mcp` as a super admin. `muapi` is a row. Toggle it on, confirm a `tools/list` through the portal shows the ten names above, then toggle it off. The server stays linked.

- [ ] **Step 5: Record the result**

Note the date, that the row is visible, and that the credential is the sandbox key. Do not paste the key into the note.

### Task 2: Tool allowlist

**Files:**
- Create: `swarm/src/mcp/tool-allow.ts`
- Test: `swarm/src/mcp/tool-allow.test.ts`

Covers MUAPI-010 and MUAPI-011.

- [ ] **Step 1: Write the failing test**

Cover four cases:

1. `toolsForNode(tools, undefined)` returns every tool.
2. `toolsForNode(tools, [])` returns `[]`.
3. `toolsForNode(tools, ['muapi_image_generate', 'muapi_predict_result'])` returns those two, in list order.
4. `missingToolNames(tools, ['muapi_image_generate', 'muapi_predict_result'])` is `[]` when both exist, and `['muapi_predict_result']` when that name is absent. An empty allowlist has no missing names.

- [ ] **Step 2: Run the test and confirm it fails** because the module is missing.

```bash
cd swarm && npx vitest run src/mcp/tool-allow.test.ts
```

- [ ] **Step 3: Implement the two functions**

`toolsForNode` filters by `tool.name`. `missingToolNames` returns allowlist entries that are not in the discovered set. Neither function fetches.

- [ ] **Step 4: Re-run the test until it passes.**

### Task 3: Enforce the allowlist on a node

**Files:**
- Modify: `swarm/src/types.ts` (`mcpToolNames?: string[]` on `AgentNode`)
- Modify: `swarm/src/do/WorkflowDO.ts` (after `collectNodeTools`, before `runAgent`)
- Test: extend `swarm/src/mcp/tool-allow.test.ts` only if the worker needs a pure helper for the error string. The DO stays thin: call `missingToolNames`, and when the result is non-empty throw `Missing MCP tool: <name>` (one name, the first missing).

Covers MUAPI-011 and MUAPI-012's worker half.

- [ ] **Step 1: Write the failing test** for the error string helper if it is separate, or for `missingToolNames` already covering the name. If `WorkflowDO` needs a test seam, extract `assertToolsAllowed(discovered, allow)` in `tool-allow.ts` that throws the `Missing MCP tool:` error. Test that throw.

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Call `assertToolsAllowed` in the node runner** with `node.mcpToolNames` and the tools just discovered. Pass the filtered list into `runAgent`. Leave `maxToolRounds` at its current default for strategy nodes. Render nodes may pass `8`, which is the existing cap in `runAgent` (`Math.min(..., 8)`).

- [ ] **Step 4: Re-run `npm test` in `swarm/`.**

### Task 4: Ad templates

**Files:**
- Modify: `swarm/src/types.ts` (`WORKFLOW_TEMPLATES`)
- Test: `swarm/src/templates/ad-studio.test.ts`

Covers MUAPI-013 through MUAPI-016 and MUAPI-019.

- [ ] **Step 1: Write the failing test**

Import `WORKFLOW_TEMPLATES` and `pack-templates.json`.

1. `ad-strategy` has eleven nodes, in the skill order in the spec, each with `mcpToolNames` deep-equal to `[]`, each instructions string starting `Follow ` and containing that row's `SKILL.md` path.
2. Edges form one chain, node 1 through node 11.
3. `ad-render` has Hero, Spot, three crops, and Music. Hero's allowlist is `search_models`, `muapi_image_generate`, `muapi_image_edit`, `muapi_predict_result`. Spot's is `muapi_video_from_image` and `muapi_predict_result`. Each crop's is `muapi_image_edit` and `muapi_predict_result`. Music's is `muapi_audio_create` and `muapi_predict_result`.
4. Edges: Hero → Spot, Hero → each crop. Music has no incoming edge.
5. Every render node instructions string contains `Follow .cursor/skills/community/muapi-render/SKILL.md`.
6. `ad-poll` has one node whose allowlist is `['muapi_predict_result']` and the same skill path.
7. `pack-templates.json` has no template id `ad-strategy`, `ad-render`, or `ad-poll`.

- [ ] **Step 2: Run the test and confirm it fails.**

```bash
cd swarm && npx vitest run src/templates/ad-studio.test.ts
```

- [ ] **Step 3: Add the three templates** to `WORKFLOW_TEMPLATES`. Lay the strategy nodes on two rows so the canvas can show them. Do not add them to `pack-templates.json`.

- [ ] **Step 4: Re-run the test until it passes.**

### Task 5: Canvas round-trip

**Files:**
- Modify: `swarm/frontend/src/components/AgentNode.tsx`
- Modify: `swarm/frontend/src/App.tsx`
- Test: `swarm/frontend/src/lib/workflow-payload.test.mjs` (create it if the frontend has no payload test yet)

Covers MUAPI-012.

- [ ] **Step 1: Write the failing test**

A template node `{ mcpToolNames: [] }` loaded the way `loadTemplate` maps fields still has `mcpToolNames: []` on node data. `buildWorkflowPayload`'s node includes that array. A node with the field omitted does not gain a spurious empty list.

If `loadTemplate` and `buildWorkflowPayload` are not importable, extract the two mappers into `swarm/frontend/src/lib/workflow-payload.mjs` and call them from `App.tsx`. Test the mappers.

- [ ] **Step 2: Run it and confirm it fails.**

```bash
cd swarm && node --test frontend/src/lib/workflow-payload.test.mjs
```

- [ ] **Step 3: Thread `mcpToolNames` through node data, template load, and the save payload.**

- [ ] **Step 4: Re-run the test, then `npx tsc --noEmit` in `swarm/`.**

### Task 6: Render skill

**Files:**
- Create: `.cursor/skills/community/muapi-render/SKILL.md`

Covers MUAPI-017 and MUAPI-018.

- [ ] **Step 1: Write the skill as one file**

Front matter `name: muapi-render` and a description that says it runs one MuAPI submit and then polls. Body:

- Use the server id printed next to the tool in the prompt. On an HQ run that id is the portal.
- Submit once. Then call `muapi_predict_result` with the returned `request_id`.
- Stop when `status` is `completed` or when no further tool call is available.
- The final answer quotes `request_id`, `status`, and the output URL from the last observation.
- A status other than `completed` is the deliverable. Do not describe media the observation did not return.
- A product image is a URL already in the brief. Pass that URL. Do not embed bytes.
- Hero: call `muapi_image_edit` when the brief has an image URL, otherwise `muapi_image_generate`. Crops call `muapi_image_edit` on the hero URL. Spot calls `muapi_video_from_image` on the hero URL.

No sibling files. The worker loads this body only.

- [ ] **Step 2: Publish**

From `handoff/`, `npm run publish:skills`, so the `SKILLS` bucket has the object. A render node whose skill is missing already fails closed (`swarm/src/ai/skills.ts`). Do not add a fallback prompt.

### Task 7: Docs that follow the code

**Files:**
- Modify: `swarm/DEPLOYMENT.md` secrets table
- Modify: `swarm/README.md` changelog
- Modify: `docs/superpowers/specs/2026-10-09-muapi-swarm-design.md` status line, after the operator check

The spec and this plan already exist. This task only records what shipped.

- [ ] **Step 1: Add a secrets-table row** that the MuAPI key is stored on portal server `muapi` and is not a Worker secret.

- [ ] **Step 2: Changelog the behavior** in `swarm/README.md` (allowlist, three templates, skill path) with the verification commands and their results.

- [ ] **Step 3: Flip the spec status** to linked and built only after Task 1 step 4 and `npm test` in `swarm/` have both been read.

---

## Operator check after the code is deployed

Do this with the sandbox key, then repeat the hero once with a live key if the example URL looks right.

1. Run `ad-strategy` on a real brief. Confirm the nodes return text and the PDF's tool list for those nodes is empty.
2. Turn `muapi` on at `/mcp`.
3. Run `ad-render` with the approved packet and a product image URL from `POST /api/v1/upload_file`.
4. Confirm the hero output is an example URL (sandbox) or a real CDN URL (live key), and that a still-processing spot returns a `request_id`.
5. Run `ad-poll` with that id.
6. Turn `muapi` off at `/mcp`. Run the hero again. The node fails with `Missing MCP tool:` and does not call MuAPI.
7. Search the workflow's Durable Object record and the PDF for the key. It is absent.

Automated tests stay on fixtures (MUAPI-024).
