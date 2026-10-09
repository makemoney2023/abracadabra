# MuAPI on the swarm — design specification

**Date:** 2026-10-09
**Product:** The agent swarm, Handoff HQ, and the agency Cloudflare MCP portal
**Status:** Specified, not linked and not built
**Requirements:** MUAPI-001 through MUAPI-024
**Lives in:** [`swarm/`](../../../swarm/), [`docs/`](../../), and the portal at `https://mcp.abra-ca-dabra.app/mcp`
**Plan:** [`docs/superpowers/plans/2026-10-09-muapi-swarm.md`](../plans/2026-10-09-muapi-swarm.md)
**Extends:** [`docs/hq-agent-spec.md`](../../hq-agent-spec.md) section 2.4 and [`docs/superpowers/specs/2026-10-09-mcp-connectors-design.md`](2026-10-09-mcp-connectors-design.md)

## Executive summary

MuAPI is the agency's render API for stills, video, and ad assets. The swarm decides the ad. MuAPI renders it. The swarm's agents are Workers AI text models. They write the avatar, the offer, the angle, the hook, and the prompts. They receive pixels only by calling MuAPI tools.

Those tools arrive through the one portal the agent and HQ-started swarm runs already open. MuAPI is a remote MCP server (`https://api.muapi.ai/mcp`). Linking it is a portal change. HQ does not rewrite the portal's server list. The MuAPI API key is the portal's stored bearer for that server. It is not a Worker secret, and it is not pasted into a canvas URL.

```text
Ad brief
  → swarm strategy workflow (existing advertising skills, text only)
  → staff approve the packet
  → /mcp turns the muapi server on for the service-token grant
  → swarm render workflow calls the allowlisted MuAPI tools through the portal
  → CDN URLs come back as the node output
  → /mcp turns muapi off again
```

Catalog estimates below were read from `GET https://api.muapi.ai/api/v1/agent-skills` on 2026-10-09. Re-check that list and the Playground before spending credits. Model ids move.

## Current state

Checked against the repo and the MuAPI docs on 2026-10-09.

- The portal hostname is `https://mcp.abra-ca-dabra.app/mcp`. Super admins list and toggle its servers at HQ `/mcp`. A toggle calls `portal_toggle_single_server`. HQ does not `PUT` the portal's `servers` array.
- HQ-started swarm runs whose stored server ids are null or empty resolve to the catalog id `portal` when `MCP_PORTAL_URL` is set (`handoff/src/lib/client-workflows.ts`). The swarm adds the Access headers only when the execute request presents `SWARM_RUN_SECRET` (`swarm/src/mcp/portal-gate.ts`).
- A node sees every tool on the servers it is allowed to use. There is no per-node tool filter. With `muapi` toggled on, every node on every HQ run, and every agent wake, would see the MuAPI tools.
- The canvas Plug dialog stores a name and a URL. It has no header field (`swarm/frontend/src/components/McpDialog.tsx`). The worker will send `headers` when they are already on the server config.
- Each node may call at most 3 tools per round, for at most 4 rounds, hard-capped at 8 (`swarm/src/ai/agents.ts`). A tool result is cut to 4,000 characters. The model is Llama 3.1 8B (with GLM fallbacks).
- The worker loads one `SKILL.md` body from R2 when a node's instructions name that path. Sibling reference files are not loaded.
- Auto pack templates chain a skill folder in filename order. That order skips the advertising sequence in `.cursor/skills/community/advertising-skills/AGENTS.md`.
- MuAPI's hosted MCP (19 tools) is Streamable HTTP at `https://api.muapi.ai/mcp`, with `Authorization: Bearer <key>`. Clients that cannot send a header can use `https://api.muapi.ai/mcp/<key>`. That second form puts the key in the URL.
- MuAPI's design-agent recipes (`ad-creative`, `product-ad-cinematic`, `ugc-ads-workflow`, `product-campaign`, and the rest) are markdown for MuAPI's own planner. They say `propose_plan` and `generate_image`. They run at `POST /api/v1/creative-agent/sessions/{id}/run-skill`. That API is not one of the hosted MCP tools.
- Generation is submit-then-poll. A submit returns `request_id`. The file URL is on `muapi_predict_result` when `status` is `completed`.

## Goals

- Link MuAPI on the existing portal as server id `muapi`, with a static bearer, **Require user auth** off, and an allowlist of render tools.
- Keep the API key on the portal. Swarm Durable Object storage, R2, logs, and the PDF never contain it.
- Give staff three hand-authored swarm templates: strategy (text), render (one asset per node), and poll (finish a job that was still processing).
- Stop a strategy node from calling MuAPI, and stop a render node from calling any tool outside its job.
- Fail a render node when a required tool is absent, with the missing name in the error. The node does not invent a CDN URL.
- Leave `/mcp` as the on/off switch. After the link, `muapi` starts off for the service-token grant.

## Non-goals

- Calling MuAPI's design-agent `run-skill` from the swarm. Those recipes stay available for a person who wants MuAPI's planner to run a whole campaign. v1 renders with the hosted MCP tools.
- A `handoff-connectors` adapter. MuAPI already serves remote MCP.
- A `connector_grants` row. One agency wallet pays for every client. There is no per-client MuAPI property to store.
- Rewriting the portal's `servers` array from HQ or from the swarm.
- A headers field on the Plug dialog. Local trials may still paste a URL. Production runs use the portal.
- Enabling MuAPI key management, top-up, face swap, or file upload through the portal.
- Raising the swarm's hard cap of 8 tool rounds. A video that is still processing returns its `request_id` for the poll template.
- Per-client portals, or a second portal only for media.

## Portal link

MuAPI is the `remote` kind in hq-agent-spec section 2.4.

| Field | Value |
|---|---|
| Server name and id | `muapi` |
| Upstream | `https://api.muapi.ai/mcp` |
| Auth | `auth_type: bearer`. `auth_credentials` is the MuAPI API key. The portal sends `Authorization: Bearer <key>`. |
| Require user auth | Off (`on_behalf: false`). A service token cannot finish a per-user OAuth grant. |
| Access | The server's Access application allows the same service token the agent already uses. |
| Allowlist | `default_disabled: true`, then the tools in the next table turned on. |
| Grant after linking | Off, until a person turns it on at `/mcp`. |

Dashboard path, from the Cloudflare MCP portals docs: **Zero Trust → Access controls → MCP servers → Add MCP server**, then attach that server on the portal `mcp.abra-ca-dabra.app`. Set the bearer with the server's stored credential. The add dialog's OAuth / dynamic-client-registration path does not apply. MuAPI's MCP auth is the bearer header, not an OAuth login.

A portal update whose body includes `servers` replaces the whole mapping. Omitting `handoff` or `search-console` detaches them. Prefer the dashboard's per-server tools panel. An API `PUT` starts from a `GET` of the current portal and keeps every other server's fields.

The first connection test uses a MuAPI key created with `is_test: true` (sandbox). Sandbox image and video calls return the model's example media and do not charge. Replacing that credential with a live key is a second operator step, after `/mcp` shows the server and a sandbox render returns an example URL.

### Tools the portal may enable

Aliases stay the upstream names. A portal prefix would make the swarm templates miss. After linking, a `tools/list` through the portal must show these names exactly.

| Tool | Render job |
|---|---|
| `search_models` | Hero node checks the live text-to-image catalog before it submits. Hosted MCP only. |
| `muapi_image_generate` | Hero still from a prompt. |
| `muapi_image_edit` | Hero still when the brief already has a product image URL. Crops of that still. |
| `muapi_video_generate` | Text-to-video when the spot has no still. |
| `muapi_video_from_image` | Animate the approved still. |
| `muapi_predict_result` | Poll. The only way a node may claim a finished URL. |
| `muapi_enhance_upscale` | Optional upscale of the approved still, its own node. |
| `muapi_enhance_bg_remove` | Optional cutout, its own node. |
| `muapi_audio_create` | Instrumental bed (Suno) for the spot. |
| `muapi_account_balance` | Read the wallet before a live render. |

Leave these off. They are out of the advertising job, or they spend or administer the account.

| Tool | Why it stays off |
|---|---|
| `muapi_account_topup` | Opens a Stripe checkout. |
| `muapi_keys_list`, `muapi_keys_create`, `muapi_keys_delete` | Account administration. |
| `muapi_upload_image` | Base64 in an 8B tool call. Upload happens before the run. |
| `muapi_enhance_face_swap`, `muapi_enhance_ghibli` | Not part of the ad templates. |
| `muapi_edit_lipsync`, `muapi_edit_clipping` | Not part of the ad templates. |
| `muapi_audio_from_text` | Not part of the ad templates. |

Context optimization that hides tools behind `portal_query_tools` stays off for this portal. The swarm discovers tools with `tools/list` and does not call `portal_query_tools`.

### Shared grant

While `muapi` is on, every HQ-started swarm run and every agent wake can see the allowlisted tools. The per-node filter in this spec is what stops a strategy node from calling them. Staff still turn the server off at `/mcp` when no render is in progress, so a wake that ignores its skill cannot spend the wallet.

One MuAPI account pays for every client. The key should be allowed to generate and read results. It should not be allowed to manage keys. Staff treat the wallet as an agency cost.

## What the swarm sends

A product photo is uploaded before the render run:

```bash
curl -X POST https://api.muapi.ai/api/v1/upload_file \
  -H "x-api-key: $MUAPI_API_KEY" \
  -F "file=@product.png"
```

The brief carries the returned URL. REST upload uses `x-api-key`. MCP calls use the bearer the portal stores. Same key, two headers, two doors.

The swarm's tool call shape is already fixed:

```text
[TOOL_CALL]{"server":"<serverId>","tool":"<toolName>","arguments":{}}[/TOOL_CALL]
```

`<serverId>` is the id the worker printed next to the tool. On an HQ run that id is `portal`, because the swarm dials the portal, and the portal proxies to MuAPI. The tool name stays `muapi_image_generate`.

A submit returns `{ "request_id", "status": "processing" }`. The node polls `muapi_predict_result` until `completed`, or until it has no rounds left. A finished output includes the CDN URL. An unfinished output includes the `request_id` and the last status, and no invented URL.

Round budget for a render node is 8 (the existing hard cap). A hero fits in that budget: `search_models`, one submit, then polls. A video often will not. The poll template is the continuation.

## Workflows

Hand-authored templates in `WORKFLOW_TEMPLATES`. They are not rows in `pack-templates.json`, because that file is regenerated from skill folders.

Strategy nodes set `mcpToolNames` to `[]`. Render and poll nodes set `mcpToolNames` to the tools for that job. An empty list means the node gets no tools. A non-empty list is both the filter and the required set: every name must be in the discovered list or the node fails before the model runs.

### `ad-strategy`

Text only. Order matches `.cursor/skills/community/advertising-skills/AGENTS.md`, then the visual prompt skills. Each node's instructions begin `Follow <path>`.

| # | Node | Skill |
|---|---|---|
| 1 | Avatar | `.cursor/skills/community/advertising-skills/skills/foundations/avatar-extraction/SKILL.md` |
| 2 | Offer | `.cursor/skills/community/advertising-skills/skills/foundations/offer-extraction/SKILL.md` |
| 3 | Awareness | `.cursor/skills/community/advertising-skills/skills/copy-chief/schwartz-awareness-mapper/SKILL.md` |
| 4 | Mechanism | `.cursor/skills/community/advertising-skills/skills/copy-chief/mechanism-builder/SKILL.md` |
| 5 | Angles | `.cursor/skills/community/advertising-skills/skills/operator-os/ad-angle-multiplier/SKILL.md` |
| 6 | Thumbstop | `.cursor/skills/community/advertising-skills/skills/operator-os/scroll-stopping-creative/SKILL.md` |
| 7 | Path | `.cursor/skills/community/advertising-skills/skills/operator-os/conversion-path-builder/SKILL.md` |
| 8 | Objections | `.cursor/skills/community/advertising-skills/skills/copy-chief/objection-crusher/SKILL.md` |
| 9 | Language | `.cursor/skills/community/advertising-skills/skills/qa/generic-language-killer/SKILL.md` |
| 10 | Still prompt | `.cursor/skills/community/visual-skills/image/SKILL.md` |
| 11 | Shot prompt | `.cursor/skills/community/visual-skills/video/SKILL.md` |

The angle node picks one angle and carries it forward. The still-prompt node returns one prompt (model, aspect ratio, prompt). The shot-prompt node returns one prompt for that still. Staff approve this packet before any render.

The image and video skills tell a reader to open sibling reference files. The worker loads only the `SKILL.md` body. That is the same limit every pack already has. The render skill below is one self-contained file.

### `ad-render`

Input is the approved packet plus the product image URL. Nodes follow `.cursor/skills/community/muapi-render/SKILL.md`.

| Node | Tools | Job |
|---|---|---|
| Hero | `search_models`, `muapi_image_generate`, `muapi_image_edit`, `muapi_predict_result` | One still. Edit when the brief has an image URL. Generate when it does not. Poll. Return the CDN URL. |
| Spot | `muapi_video_from_image`, `muapi_predict_result` | Animate the hero URL. Poll. Return the video URL or the `request_id`. |
| Crop 1:1 | `muapi_image_edit`, `muapi_predict_result` | Feed and LinkedIn square. |
| Crop 9:16 | `muapi_image_edit`, `muapi_predict_result` | Story and Reels. |
| Crop 1.91:1 | `muapi_image_edit`, `muapi_predict_result` | Feed wide, 1200×628. |
| Music | `muapi_audio_create`, `muapi_predict_result` | Instrumental bed from the packet's tone. Runs beside the hero, not after the video. |

Hero is the parent of Spot and of the three crops. Music shares the run's start with Hero. Upscale and background removal are not in this template. A later node can add them with their own allowlist.

### `ad-poll`

One node. Tools: `muapi_predict_result`. Input is a `request_id` from a render node that was still processing. Output is the CDN URL, or the same id and the latest status.

## Render skill

`.cursor/skills/community/muapi-render/SKILL.md` is the procedure the render and poll nodes load. It states:

- Call only the tools listed for this node, using the server id printed beside each tool.
- One submit, then poll. Do not start a second image or a second video in the same node.
- A product image URL is an input to `muapi_image_edit` or `muapi_video_from_image`. Do not embed file bytes.
- The final answer quotes `request_id`, `status`, and any output URL from the last observation.
- A status other than `completed` is a successful node result. It is not a license to describe a video that was not returned.

## Recipes the swarm does not run

These MuAPI recipes are the right shape when a person wants one planner to spend the whole budget. They are not swarm nodes in v1. Credits are the catalog's `estimated_credits` on 2026-10-09.

| Recipe | Inputs | Credits |
|---|---|---|
| `ad-creative` | product or service, audience, goal, tone, optional product image | ~60 |
| `product-ad-cinematic` | product image URL, brand brief, duration | ~130 |
| `product-video-ad-maker` | product image, scene description | ~150 |
| `ugc-ads-workflow` | product name, human image, product image | ~180 |
| `product-campaign` | product name, message, audience, style, optional product image | ~200 |
| `storyboard` | premise, scene count, style | ~24 |
| `youtube-thumbnail` | title, channel style, subject | ~15 |
| `instagram-post` | brief, brand style, format | ~20 |

`ad-creative` and `product-ad-cinematic` are two-phase: a cheap hero, a human pick, then crops or a video. The swarm templates copy that split by being two workflows with a person between them.

## Requirements

### Portal

- **MUAPI-001.** Server id `muapi` points at `https://api.muapi.ai/mcp`. The URL does not contain the API key.
- **MUAPI-002.** The portal stores the key as bearer `auth_credentials` and sends `Authorization: Bearer`. The key is not a secret on `handoff`, `handoff-agent`, or `swarm`.
- **MUAPI-003.** **Require user auth** is off. The server's Access application includes a Service Auth policy for the agency service token.
- **MUAPI-004.** The server mapping uses `default_disabled: true` and enables only the ten tools in the allowlist table.
- **MUAPI-005.** Tool aliases are the upstream names, with no portal prefix.
- **MUAPI-006.** After the link, the server is off for the service-token grant until a super admin turns it on at `/mcp`.
- **MUAPI-007.** Linking is an operator step. Application code does not `PUT` the portal. A `PUT` that includes `servers` is done from a fresh `GET` and keeps every other server.
- **MUAPI-008.** No `connector_grants` row. The wallet is the agency's.
- **MUAPI-009.** Portal context optimization that replaces `tools/list` with `portal_query_tools` stays off.

### Swarm

- **MUAPI-010.** `AgentNode.mcpToolNames` is an optional string list. Omitted means every discovered tool (today's behavior). `[]` means no tools. A non-empty list is the only names passed to the model.
- **MUAPI-011.** When `mcpToolNames` is non-empty, each name must be among the discovered tools or the node fails before the model runs. The error names the missing tool. The node does not write a fake URL.
- **MUAPI-012.** The field round-trips through the template API, the canvas load and save payload, and the worker's node record.
- **MUAPI-013.** `ad-strategy` is a `WORKFLOW_TEMPLATES` entry with the eleven skills in the table above, each with `mcpToolNames: []`.
- **MUAPI-014.** `ad-render` is a `WORKFLOW_TEMPLATES` entry with the six nodes, edges, and allowlists in the render table. Every render node follows `muapi-render`.
- **MUAPI-015.** `ad-poll` is one node, `muapi_predict_result` only, following the same skill.
- **MUAPI-016.** These three templates are absent from `pack-templates.json`.
- **MUAPI-017.** `muapi-render` is one `SKILL.md`. It does not depend on a sibling file. It tells the model to use the listed server id, to submit once, and to quote `request_id`, `status`, and URL from the observation.
- **MUAPI-018.** Render nodes do not raise the hard cap above 8 rounds. The poll template is how a processing job finishes.
- **MUAPI-019.** Strategy copy is approved by a person before `ad-render` runs. The two templates are separate workflows so one execute cannot spend credits on unapproved copy.

### Operator checks

- **MUAPI-020.** A sandbox key, with `muapi` toggled on, lets `ad-render`'s hero node return an example media URL.
- **MUAPI-021.** With `muapi` toggled off, the hero node fails with the missing tool name and does not call MuAPI.
- **MUAPI-022.** A strategy node on a run where `muapi` is on still receives no MuAPI tools.
- **MUAPI-023.** Durable Object storage for the run does not contain the MuAPI key.
- **MUAPI-024.** Tests use fixtures. They do not call `api.muapi.ai` or `mcp.abra-ca-dabra.app`.

## Config

| Name | Where | Purpose |
|---|---|---|
| MuAPI API key | Portal credential for server `muapi` | Bearer the portal sends upstream. Sandbox key first, live key after the operator check. |
| `MCP_PORTAL_URL` | already on HQ and the swarm | Unchanged. `https://mcp.abra-ca-dabra.app/mcp` once the service token is linked. |
| `SWARM_RUN_SECRET`, Access service token | already on HQ and the swarm | Unchanged. Required before the swarm will dial the portal. |

No new Worker secret. No new D1 table. No new env var in `.env.example`.

## Verification

- `npm test` and `npx tsc --noEmit` in `swarm/` for the allowlist filter, the three templates, and the missing-tool failure.
- The canvas load and save test (or the existing frontend test runner) shows `mcpToolNames` survives a template load and a save payload.
- ESLint on the touched files.
- Operator checks MUAPI-020 through MUAPI-023 after the portal link. The automated suite stays on fixtures.
