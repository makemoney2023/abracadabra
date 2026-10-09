# MuAPI on the swarm — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can render stills and motion for any brief through one MuAPI portal server. A website hero that is then animated, and an ad, are the first two workflows. They share render roles. The MuAPI key lives on the Cloudflare MCP portal. The swarm never stores it.

**Architecture:** An operator links remote MCP server `muapi` (`https://api.muapi.ai/mcp`) on `https://mcp.abra-ca-dabra.app/mcp` with a bearer credential, a general render allowlist, and **Require user auth** off. HQ `/mcp` remains the on/off switch. The swarm gains `mcpToolNames` and one `RENDER_ROLES` map. Text nodes get no tools. Each render node takes one role from that map. A later job adds a template. It does not add a server or a tool.

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
| `swarm/src/mcp/render-roles.ts` | `RENDER_ROLES`. The only tool lists render nodes may use. |
| `swarm/src/types.ts` | `mcpToolNames` on `AgentNode`. Templates `website-hero`, `website-hero-render`, `ad-strategy`, `ad-render`, `media-poll`. |
| `swarm/src/templates/media-templates.test.ts` | Shared roles, both example workflows, absence from the generated pack file. |
| `swarm/src/do/WorkflowDO.ts` | Apply the filter before `runAgent`. Fail the node when a required name is missing. |
| `swarm/frontend/src/components/AgentNode.tsx` | `mcpToolNames` on node data. |
| `swarm/frontend/src/App.tsx` | Copy the field on template load and on the save payload. |
| `.cursor/skills/community/muapi-render/SKILL.md` | One-file render procedure. |
| `swarm/DEPLOYMENT.md` | The MuAPI key is a portal credential, not a worker secret. |

`pack-templates.json` stays generated. Do not hand-edit it. `npx tsx scripts/write-pack-templates.ts` from `handoff/` must not grow these template ids, because that script only reads skill folders.

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
- Turn on the general kit: `search_models`, `muapi_image_generate`, `muapi_image_edit`, `muapi_video_generate`, `muapi_video_from_image`, `muapi_predict_result`, `muapi_enhance_upscale`, `muapi_enhance_bg_remove`, `muapi_audio_create`, `muapi_audio_from_text`, `muapi_edit_lipsync`, `muapi_edit_clipping`, `muapi_account_balance`.
- Leave off `muapi_account_topup`, `muapi_keys_list`, `muapi_keys_create`, `muapi_keys_delete`, `muapi_upload_image`, `muapi_enhance_face_swap`, and `muapi_enhance_ghibli`.
- Leave aliases equal to those upstream names.
- Leave context optimization off, so `tools/list` returns the enabled tools.

A `PUT` that includes `servers` replaces the whole portal mapping. Start from a `GET` and keep `handoff` and `search-console` with their current fields. Prefer the dashboard tools panel, which edits one server.

- [ ] **Step 4: Confirm the grant, then leave it off**

Open HQ `/mcp` as a super admin. `muapi` is a row. Toggle it on, confirm a `tools/list` through the portal shows the allowlisted names and none of the tools that stay off, then toggle it off. The server stays linked.

- [ ] **Step 5: Record the result**

Note the date, that the row is visible, and that the credential is the sandbox key. Do not paste the key into the note.

### Task 2: Tool allowlist

**Files:**
- Create: `swarm/src/mcp/tool-allow.ts`
- Test: `swarm/src/mcp/tool-allow.test.ts`

Covers MUAPI-010 and MUAPI-011.

- [x] **Step 1: Write the failing test**

Cover four cases:

1. `toolsForNode(tools, undefined)` returns every tool.
2. `toolsForNode(tools, [])` returns `[]`.
3. `toolsForNode(tools, ['muapi_image_generate', 'muapi_predict_result'])` returns those two, in list order.
4. `missingToolNames(tools, ['muapi_image_generate', 'muapi_predict_result'])` is `[]` when both exist, and `['muapi_predict_result']` when that name is absent. An empty allowlist has no missing names.

- [x] **Step 2: Run the test and confirm it fails** because the module is missing.

```bash
cd swarm && npx vitest run src/mcp/tool-allow.test.ts
```

- [x] **Step 3: Implement the two functions**

`toolsForNode` filters by `tool.name`. `missingToolNames` returns allowlist entries that are not in the discovered set. Neither function fetches.

- [x] **Step 4: Re-run the test until it passes.**

### Task 3: Enforce the allowlist on a node

**Files:**
- Modify: `swarm/src/types.ts` (`mcpToolNames?: string[]` on `AgentNode`)
- Modify: `swarm/src/do/WorkflowDO.ts` (after `collectNodeTools`, before `runAgent`)
- Test: extend `swarm/src/mcp/tool-allow.test.ts` only if the worker needs a pure helper for the error string. The DO stays thin: call `missingToolNames`, and when the result is non-empty throw `Missing MCP tool: <name>` (one name, the first missing).

Covers MUAPI-011 and MUAPI-012's worker half.

- [x] **Step 1: Write the failing test** for the error string helper if it is separate, or for `missingToolNames` already covering the name. If `WorkflowDO` needs a test seam, extract `assertToolsAllowed(discovered, allow)` in `tool-allow.ts` that throws the `Missing MCP tool:` error. Test that throw.

- [x] **Step 2: Run it and confirm it fails.**

- [x] **Step 3: Call `assertToolsAllowed` in the node runner** with `node.mcpToolNames` and the tools just discovered. Pass the filtered list into `runAgent`. Leave `maxToolRounds` at its current default for strategy nodes. Render nodes may pass `8`, which is the existing cap in `runAgent` (`Math.min(..., 8)`).

- [x] **Step 4: Re-run `npm test` in `swarm/`.**

### Task 4: Shared roles and the two example workflows

**Files:**
- Create: `swarm/src/mcp/render-roles.ts`
- Modify: `swarm/src/types.ts` (`WORKFLOW_TEMPLATES`)
- Test: `swarm/src/templates/media-templates.test.ts`

Covers MUAPI-013 through MUAPI-016 and MUAPI-019.

- [x] **Step 1: Write the failing test**

Import `RENDER_ROLES`, `WORKFLOW_TEMPLATES`, and `pack-templates.json`.

1. `RENDER_ROLES` has `still`, `animate`, `edit`, `upscale`, `cutout`, `sound`, `lipsync`, `clip`, and `poll`, with the tool names in the spec's role table.
2. `website-hero` has three text nodes, `mcpToolNames` deep-equal to `[]`, instructions starting `Follow ` for banner-design, the image skill, and the video skill, in that order. Edges chain them.
3. `website-hero-render` has Still then Animate. Still's `mcpToolNames` is `RENDER_ROLES.still` (same array). Animate's is `RENDER_ROLES.animate`. The only edge is Still → Animate. Both instructions contain `Follow .cursor/skills/community/muapi-render/SKILL.md` and `Role: still` or `Role: animate`.
4. `ad-strategy` has eleven nodes, in the skill order in the spec, each with `mcpToolNames` deep-equal to `[]`.
5. `ad-render` Still uses `RENDER_ROLES.still`. Spot uses `RENDER_ROLES.animate`. Each crop uses `RENDER_ROLES.edit`. Music uses `RENDER_ROLES.sound`. Edges: Still → Spot and Still → each crop. Music has no incoming edge. Each render node's instructions name its role and follow `muapi-render`.
6. `media-poll` has one node whose `mcpToolNames` is `RENDER_ROLES.poll`.
7. `pack-templates.json` has none of those five template ids.

- [x] **Step 2: Run the test and confirm it fails.**

```bash
cd swarm && npx vitest run src/templates/media-templates.test.ts
```

- [x] **Step 3: Add `RENDER_ROLES` and the five templates.** Templates import the role arrays. They do not retype the tool names. Lay long text chains on two rows. Do not add them to `pack-templates.json`.

- [x] **Step 4: Re-run the test until it passes.**

### Task 5: Canvas round-trip

**Files:**
- Modify: `swarm/frontend/src/components/AgentNode.tsx`
- Modify: `swarm/frontend/src/App.tsx`
- Test: `swarm/frontend/src/lib/workflow-payload.test.mjs` (create it if the frontend has no payload test yet)

Covers MUAPI-012.

- [x] **Step 1: Write the failing test**

A template node `{ mcpToolNames: [] }` loaded the way `loadTemplate` maps fields still has `mcpToolNames: []` on node data. `buildWorkflowPayload`'s node includes that array. A node with the field omitted does not gain a spurious empty list.

If `loadTemplate` and `buildWorkflowPayload` are not importable, extract the two mappers into `swarm/frontend/src/lib/workflow-payload.mjs` and call them from `App.tsx`. Test the mappers.

- [x] **Step 2: Run it and confirm it fails.**

```bash
cd swarm && node --test frontend/src/lib/workflow-payload.test.mjs
```

- [x] **Step 3: Thread `mcpToolNames` through node data, template load, and the save payload.**

- [x] **Step 4: Re-run the test, then `npx tsc --noEmit` in `swarm/`.**

### Task 6: Render skill

**Files:**
- Create: `.cursor/skills/community/muapi-render/SKILL.md`

Covers MUAPI-017 and MUAPI-018.

- [x] **Step 1: Write the skill as one file**

Front matter `name: muapi-render` and a description that says one node runs one render role, then polls. Body has a section per role in `RENDER_ROLES`:

- Use the server id printed next to the tool in the prompt. On an HQ run that id is the portal.
- Read the node's `Role:` line and follow that section only.
- Submit once. Then call `muapi_predict_result` with the returned `request_id`, unless the role is `poll`.
- `still` calls `muapi_image_edit` when an image URL is already in hand, and `muapi_image_generate` otherwise.
- `animate` calls `muapi_video_from_image` when a still URL is in hand, and `muapi_video_generate` otherwise.
- `edit` calls `muapi_image_edit` on the URL the instructions name.
- `sound` calls `muapi_audio_create` for music and `muapi_audio_from_text` for an effect.
- `upscale`, `cutout`, `lipsync`, and `clip` each call their one tool.
- Stop when `status` is `completed` or when no further tool call is available.
- The final answer quotes `request_id`, `status`, and the output URL from the last observation.
- A status other than `completed` is the deliverable. Do not describe media the observation did not return.
- Inputs are URLs. Do not embed file bytes.

No sibling files. The worker loads this body only.

- [ ] **Step 2: Publish**

From `handoff/`, `npm run publish:skills`, so the `SKILLS` bucket has the object. A render node whose skill is missing already fails closed (`swarm/src/ai/skills.ts`). Do not add a fallback prompt.

Not run on 2026-10-09: `handoff/.env.local` does not have `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_ENDPOINT`. The skill file is in the repo. Publish before the first render run.

### Task 7: Docs that follow the code

**Files:**
- Modify: `swarm/DEPLOYMENT.md` secrets table
- Modify: `swarm/README.md` changelog
- Modify: `docs/superpowers/specs/2026-10-09-muapi-swarm-design.md` status line, after the operator check

The spec and this plan already exist. This task only records what shipped.

- [x] **Step 1: Add a secrets-table row** that the MuAPI key is stored on portal server `muapi` and is not a Worker secret.

- [x] **Step 2: Changelog the behavior** in `swarm/README.md` (shared roles, website-hero and ad templates, skill path) with the verification commands and their results.

- [ ] **Step 3: Flip the spec status** to linked and built only after Task 1 step 4 and `npm test` in `swarm/` have both been read. The swarm code is in. The portal link is not, so the status stays short of "linked".

---

## Operator check after the code is deployed

Do this with the sandbox key. Repeat the website-hero still once with a live key if the example URL looks right.

1. Run `website-hero` on a page brief. Confirm the nodes return text and the PDF's tool list for those nodes is empty.
2. Turn `muapi` on at `/mcp`.
3. Run `website-hero-render` with that packet. Confirm Still returns an example URL (sandbox) or a CDN URL (live key), and Animate returns a video URL or a `request_id` for that still.
4. If Animate is still processing, run `media-poll` with that id.
5. Run `ad-strategy`, then `ad-render`, on a second brief. Confirm the ad Still is the same role as the website Still: one submit, then a poll.
6. Turn `muapi` off at `/mcp`. Run `website-hero-render` again. Still fails with `Missing MCP tool:` and does not call MuAPI.
7. Search the workflow's Durable Object record and the PDF for the key. It is absent.

Automated tests stay on fixtures (MUAPI-024).
