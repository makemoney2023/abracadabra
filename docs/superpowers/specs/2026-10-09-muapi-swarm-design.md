# MuAPI on the swarm — design specification

**Date:** 2026-10-09
**Product:** The agent swarm, Handoff HQ, and the agency Cloudflare MCP portal
**Status:** Swarm templates for the full pack catalog are in the worker as of 2026-10-09. Portal server `muapi` is not linked. The render skill is in the repo and is not published to R2 until `npm run publish:skills` runs with R2 credentials.
**Requirements:** MUAPI-001 through MUAPI-025
**Lives in:** [`swarm/`](../../../swarm/), [`docs/`](../../), and the portal at `https://mcp.abra-ca-dabra.app/mcp`
**Plan:** [`docs/superpowers/plans/2026-10-09-muapi-swarm.md`](../plans/2026-10-09-muapi-swarm.md)
**Extends:** [`docs/hq-agent-spec.md`](../../hq-agent-spec.md) section 2.4 and [`docs/superpowers/specs/2026-10-09-mcp-connectors-design.md`](2026-10-09-mcp-connectors-design.md)

## Executive summary

MuAPI is the agency's render API for stills, edits, motion, and sound. Ads are one job. A website hero that is then animated is another. A later job — a thumbnail, a product cutout, a spokesperson clip — uses the same portal server and the same node roles. It does not get its own MCP server.

The swarm's agents are Workers AI text models. They write the brief and the prompts. They receive media only by calling MuAPI tools. Those tools arrive through the one portal the agent and HQ-started swarm runs already open. MuAPI is a remote MCP server (`https://api.muapi.ai/mcp`). Linking it is a portal change. HQ does not rewrite the portal's server list. The MuAPI API key is the portal's stored bearer for that server. It is not a Worker secret, and it is not pasted into a canvas URL.

```text
Any brief
  → text workflow (the skills for that job, no MuAPI tools)
  → staff approve the packet
  → /mcp turns the muapi server on for the service-token grant
  → render workflow, one role per node (still, animate, edit, sound, …)
  → CDN URLs come back as the node output
  → /mcp turns muapi off again
```

A website hero is the small form of that diagram: a wide still, then `muapi_video_from_image` on that URL. An ad is the same still and the same animate role, plus edit nodes for crops and a sound node.

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
- Give every render node one role from a shared list. A new job is a new template that picks roles. It is not a new portal server and not a new tool.
- Ship the pack catalog: website hero and ad are in the worker. Social, blog header, logo sting, brand kit, cutout, product angles, launch set, Amazon listing, storyboard, UGC, spokesperson, and highlight clips are the rest. One shared poll template serves all of them.
- Stop a text node from calling MuAPI, and stop a render node from calling any tool outside its role.
- Fail a render node when a required tool is absent, with the missing name in the error. The node does not invent a CDN URL.
- Leave `/mcp` as the on/off switch. After the link, `muapi` starts off for the service-token grant.

## Non-goals

- Calling MuAPI's design-agent `run-skill` from the swarm. Those recipes stay available for a person who wants MuAPI's planner to run a whole piece. v1 renders with the hosted MCP tools, one role per node.
- A template for every skill in the library. The pack catalog is the set to ship. A job outside that catalog still copies a role. It does not add a portal server.
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

The allowlist is the whole render kit, not an ads kit. Aliases stay the upstream names. A portal prefix would make every role miss. After linking, a `tools/list` through the portal must show these names exactly.

| Tool | What any job can do with it |
|---|---|
| `search_models` | Read the live catalog before a still. Hosted MCP only. |
| `muapi_image_generate` | A new still from a prompt. |
| `muapi_image_edit` | Change a still that already has a URL: crop, reframe, restyle, place a product. |
| `muapi_video_generate` | Motion from a text prompt. |
| `muapi_video_from_image` | Animate a still. This is the website-hero motion step and the ad spot. |
| `muapi_predict_result` | Poll. The only way a node may claim a finished URL. |
| `muapi_enhance_upscale` | A larger still, its own node. |
| `muapi_enhance_bg_remove` | A cutout, its own node. |
| `muapi_audio_create` | Music. |
| `muapi_audio_from_text` | Sound effects or ambience. |
| `muapi_edit_lipsync` | Mouth movement on a clip, driven by an audio URL. |
| `muapi_edit_clipping` | Highlight clips from a long video URL. |
| `muapi_account_balance` | Read the wallet before a live render. |

Leave these off. They administer the account, or they push file bytes through an 8B tool call.

| Tool | Why it stays off |
|---|---|
| `muapi_account_topup` | Opens a Stripe checkout. |
| `muapi_keys_list`, `muapi_keys_create`, `muapi_keys_delete` | Account administration. |
| `muapi_upload_image` | Base64 in an 8B tool call. Upload happens before the run. |
| `muapi_enhance_face_swap` | Swaps a person's face. Not a general render role. |
| `muapi_enhance_ghibli` | One style. `muapi_image_edit` already restyles a URL. |

Context optimization that hides tools behind `portal_query_tools` stays off for this portal. The swarm discovers tools with `tools/list` and does not call `portal_query_tools`.

### Shared grant

While `muapi` is on, every HQ-started swarm run and every agent wake can see the allowlisted tools. The per-node filter in this spec is what stops a strategy node from calling them. Staff still turn the server off at `/mcp` when no render is in progress, so a wake that ignores its skill cannot spend the wallet.

One MuAPI account pays for every client. The key should be allowed to generate and read results. It should not be allowed to manage keys. Staff treat the wallet as an agency cost.

## What the swarm sends

A reference image, a logo, or a product photo is uploaded before the render run:

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

Round budget for a render node is 8 (the existing hard cap). A still fits in that budget: `search_models`, one submit, then polls. Motion often will not. The shared poll template is the continuation.

## Render roles

Roles live in one module, `swarm/src/mcp/render-roles.ts`, exported as `RENDER_ROLES`. Every template imports that object. Two nodes with the same role share the same `mcpToolNames` array. A new job adds a template. It does not copy a private tool list and it does not change the portal.

Text nodes set `mcpToolNames` to `[]`. A render node's `mcpToolNames` is `RENDER_ROLES[role]`. A non-empty list is both the filter and the required set: every name must be in the discovered list or the node fails before the model runs. The node's instructions name the role in the first line after the skill path: `Role: still`.

| Role | Tools | One node does |
|---|---|---|
| `still` | `search_models`, `muapi_image_generate`, `muapi_image_edit`, `muapi_predict_result` | One still. Edit when the brief or the upstream node has an image URL. Generate when it does not. |
| `animate` | `muapi_video_from_image`, `muapi_video_generate`, `muapi_predict_result` | One clip. Image-to-video when a still URL is in hand. Text-to-video when it is not. |
| `edit` | `muapi_image_edit`, `muapi_predict_result` | One change to one URL: crop, reframe, restyle. |
| `upscale` | `muapi_enhance_upscale`, `muapi_predict_result` | One larger still. |
| `cutout` | `muapi_enhance_bg_remove`, `muapi_predict_result` | One cutout. |
| `sound` | `muapi_audio_create`, `muapi_audio_from_text`, `muapi_predict_result` | One music track or one effect. |
| `lipsync` | `muapi_edit_lipsync`, `muapi_predict_result` | One clip whose mouth follows an audio URL. |
| `clip` | `muapi_edit_clipping`, `muapi_predict_result` | Highlights from one long video URL. |
| `poll` | `muapi_predict_result` | Finish a `request_id` that was still processing. |

The HQ agent uses the same names. A skill calls a MuAPI tool only when that skill names it and the portal returned it. Text skills do not name these tools.

## Workflows

Hand-authored templates in `WORKFLOW_TEMPLATES`. They are not rows in `pack-templates.json`, because that file is regenerated from skill folders. Each example is a text workflow and a render workflow, so one execute cannot spend credits on an unapproved packet.

### Website hero

Text template `website-hero`. Render template `website-hero-render`.

| # | Node | Skill or role |
|---|---|---|
| 1 | Direction | `.cursor/skills/community/ui-ux-pro-max-skill/banner-design/SKILL.md` — format is a website hero, wide, headline stays in the page's HTML, the still leaves clear space for type |
| 2 | Still prompt | `.cursor/skills/community/visual-skills/image/SKILL.md` — one prompt |
| 3 | Motion prompt | `.cursor/skills/community/visual-skills/video/SKILL.md` — one prompt that moves that still, slow and loopable |

| Render node | Role | Edge |
|---|---|---|
| Still | `still` | none |
| Animate | `animate` | Still → Animate |

Staff approve the three text outputs, then run the render with that packet. Animate calls `muapi_video_from_image` on the still's URL.

### Ad

Text template `ad-strategy`. Render template `ad-render`. The text order matches `.cursor/skills/community/advertising-skills/AGENTS.md`, then the same image and video skills the hero uses.

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

The angle node picks one angle and carries it forward. The still-prompt node returns one prompt. The shot-prompt node returns one prompt for that still.

| Render node | Role | Edge |
|---|---|---|
| Still | `still` | none |
| Spot | `animate` | Still → Spot |
| Crop 1:1 | `edit` | Still → Crop 1:1 |
| Crop 9:16 | `edit` | Still → Crop 9:16 |
| Crop 1.91:1 | `edit` | Still → Crop 1.91:1 |
| Music | `sound` | none (starts with Still) |

The hero's Still and the ad's Still are the same role. The hero's Animate and the ad's Spot are the same role. The crops are three `edit` nodes with different aspect instructions.

The image and video skills tell a reader to open sibling reference files. The worker loads only the `SKILL.md` body. That is the same limit every pack already has. The render skill below is one self-contained file.

### `media-poll`

One node. Role `poll`. Input is a `request_id` from any render node that was still processing. Output is the CDN URL, or the same id and the latest status. Every pack below shares this template.

### Pack catalog

Website hero and ad are already templates. The rows below are the rest of the set. Each row is a text workflow and a render workflow, except storyboard, which adds a third workflow so staff can pick frames before any clip is generated. Text nodes set `mcpToolNames` to `[]` and start with `Follow `. Render nodes follow `muapi-render`, name their role, and use that role's array from `RENDER_ROLES`.

| Pack | Text template | Render template | Text skills | Render nodes |
|---|---|---|---|---|
| Social | `social-pack` | `social-pack-render` | banner-design, then the image skill | Still (`still`). Then Edit 1:1, Edit 4:5, Edit 9:16, Edit 16:9 (`edit`), each edged from Still |
| Blog header | `blog-header` | `blog-header-render` | image skill. The prompt is a 1200×628 blog or Open Graph header | Still (`still`) |
| Logo sting | `logo-sting` | `logo-sting-render` | brand skill, image skill, video skill | Still (`still`) → Animate (`animate`). Still → Upscale (`upscale`) |
| Brand kit | `brand-kit` | `brand-kit-render` | brand skill, then the image skill. The packet holds three prompts: mark, dark and light lockup, mood board | Mark, Lockup, Mood. All `still`. No edges |
| Page cutout | `page-cutout` | `page-cutout-render` | image skill. Names what stays in frame | Cutout (`cutout`) → Upscale (`upscale`) |
| Product angles | `product-angles` | `product-angles-render` | image skill. Four angle prompts for one product URL | Front, Side, Angle 45, Top. All `edit`. No edges. Each edits the product URL in the brief |
| Launch set | `launch-set` | `launch-set-render` | banner-design, image skill, video skill | Still (`still`) → Animate (`animate`). Still → the four social edits (1:1, 4:5, 9:16, 16:9). Music (`sound`) has no incoming edge |
| Amazon listing | `amazon-listing` | `amazon-listing-render` | image skill. Four prompts: hero, lifestyle, infographic, detail | Hero, Lifestyle, Infographic, Detail. All `still`. No edges. Hero uses the product URL when the brief has one |
| Storyboard | `storyboard` | `storyboard-render`, then `storyboard-animate` | video skill, then the image skill. Four frames | `storyboard-render`: Frame 1 through Frame 4, all `still`, no edges. `storyboard-animate`: Frame 1 through Frame 4, all `animate`, no edges. An animate node whose frame is not in the approved pick list returns `skipped` and does not call a tool |
| UGC spot | `ugc-spot` | `ugc-spot-render` | image skill, video skill | Composite (`edit`) → Animate (`animate`) → Lipsync (`lipsync`). Lipsync returns `skipped` and does not call a tool when the brief has no audio URL |
| Spokesperson | `spokesperson` | `spokesperson-render` | image skill, video skill | Still (`still`) → Animate (`animate`) → Lipsync (`lipsync`). Music (`sound`) has no incoming edge |
| Highlight clips | `highlight-clips` | `highlight-clips-render` | video skill. Names the moments to keep | Clip (`clip`). No still |

Skill paths:

- banner-design: `.cursor/skills/community/ui-ux-pro-max-skill/banner-design/SKILL.md`
- brand: `.cursor/skills/community/ui-ux-pro-max-skill/brand/SKILL.md`
- image: `.cursor/skills/community/visual-skills/image/SKILL.md`
- video: `.cursor/skills/community/visual-skills/video/SKILL.md`

A render node that would call `muapi_image_edit`, `muapi_video_from_image`, `muapi_enhance_upscale`, `muapi_enhance_bg_remove`, `muapi_edit_lipsync`, or `muapi_edit_clipping` reads its URL from the brief or from the parent node's output. Staff upload that file with `POST /api/v1/upload_file` before the render run.

## Render skill

`.cursor/skills/community/muapi-render/SKILL.md` is the procedure every render and poll node loads. The node's `Role:` line picks the section. The skill states:

- Call only the tools listed for this node, using the server id printed beside each tool.
- One submit, then poll. Do not start a second image, video, or audio job in the same node.
- `still` with an image URL calls `muapi_image_edit`. `still` without one calls `muapi_image_generate`.
- `animate` with a still URL calls `muapi_video_from_image`. `animate` without one calls `muapi_video_generate`.
- `edit` calls `muapi_image_edit` on the URL the instructions name.
- `sound` calls `muapi_audio_create` for music and `muapi_audio_from_text` for an effect.
- `upscale`, `cutout`, `lipsync`, `clip`, and `poll` each call the one tool in that role, then poll when the role is not already `poll`.
- An image, video, or audio input is a URL already in the brief or in an upstream output. Do not embed file bytes.
- The final answer quotes `request_id`, `status`, and any output URL from the last observation.
- A status other than `completed` is a successful node result. It is not a license to describe media the observation did not return.
- `storyboard-animate` returns `skipped` and does not call a tool when that frame is not in the approved pick list. UGC `lipsync` does the same when the brief has no audio URL.

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

`ad-creative` and `product-ad-cinematic` are two-phase: a cheap still, a human pick, then more media. The swarm templates copy that split by being a text workflow and a render workflow with a person between them. A website hero uses the same split.

## Requirements

### Portal

- **MUAPI-001.** Server id `muapi` points at `https://api.muapi.ai/mcp`. The URL does not contain the API key.
- **MUAPI-002.** The portal stores the key as bearer `auth_credentials` and sends `Authorization: Bearer`. The key is not a secret on `handoff`, `handoff-agent`, or `swarm`.
- **MUAPI-003.** **Require user auth** is off. The server's Access application includes a Service Auth policy for the agency service token.
- **MUAPI-004.** The server mapping uses `default_disabled: true` and enables only the tools in the allowlist table. That list is the general render kit.
- **MUAPI-005.** Tool aliases are the upstream names, with no portal prefix.
- **MUAPI-006.** After the link, the server is off for the service-token grant until a super admin turns it on at `/mcp`.
- **MUAPI-007.** Linking is an operator step. Application code does not `PUT` the portal. A `PUT` that includes `servers` is done from a fresh `GET` and keeps every other server.
- **MUAPI-008.** No `connector_grants` row. The wallet is the agency's.
- **MUAPI-009.** Portal context optimization that replaces `tools/list` with `portal_query_tools` stays off.

### Swarm

- **MUAPI-010.** `AgentNode.mcpToolNames` is an optional string list. Omitted means every discovered tool (today's behavior). `[]` means no tools. A non-empty list is the only names passed to the model.
- **MUAPI-011.** When `mcpToolNames` is non-empty, each name must be among the discovered tools or the node fails before the model runs. The error names the missing tool. The node does not write a fake URL.
- **MUAPI-012.** The field round-trips through the template API, the canvas load and save payload, and the worker's node record.
- **MUAPI-013.** `RENDER_ROLES` is the only tool list for render nodes. `website-hero-render`'s Still and `ad-render`'s Still both use `RENDER_ROLES.still`. `website-hero-render`'s Animate and `ad-render`'s Spot both use `RENDER_ROLES.animate`.
- **MUAPI-014.** `website-hero` is three text nodes with `mcpToolNames: []`, in the order in the website-hero table. `website-hero-render` is Still → Animate. Both render nodes follow `muapi-render` and name their role.
- **MUAPI-015.** `ad-strategy` is the eleven text skills in the ad table, each with `mcpToolNames: []`. `ad-render` is the six nodes, edges, and roles in the ad render table. Every render node follows `muapi-render` and names its role.
- **MUAPI-016.** `media-poll` is one node, role `poll`, following the same skill. `pack-templates.json` does not contain any id from the pack catalog, including `website-hero`, `website-hero-render`, `ad-strategy`, `ad-render`, and `media-poll`.
- **MUAPI-025.** The pack catalog is hand-authored on `WORKFLOW_TEMPLATES`. Website hero and ad match the tables above them. Every other row matches the catalog: text nodes have `mcpToolNames: []`, render nodes use the named `RENDER_ROLES` array, and edges match the catalog. `storyboard-animate` and the UGC `lipsync` node may return `skipped` without a tool call when the brief does not ask for that frame or has no audio URL.
- **MUAPI-017.** `muapi-render` is one `SKILL.md`. It does not depend on a sibling file. It covers every role in the role table: one submit, the server id printed beside the tool, and a final answer that quotes `request_id`, `status`, and URL.
- **MUAPI-018.** Render nodes do not raise the hard cap above 8 rounds. `media-poll` is how a processing job finishes, for every job.
- **MUAPI-019.** A person approves the text packet before the matching render workflow runs. A new job adds a text template and a render template made of existing roles. It does not add a portal server or a tool.

### Operator checks

- **MUAPI-020.** A sandbox key, with `muapi` toggled on, lets `website-hero-render`'s Still return an example media URL, and lets Animate return a video URL or a `request_id` for that still.
- **MUAPI-021.** With `muapi` toggled off, that Still fails with the missing tool name and does not call MuAPI.
- **MUAPI-022.** A text node on `website-hero` or `ad-strategy`, on a run where `muapi` is on, still receives no MuAPI tools.
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

- `npm test` and `npx tsc --noEmit` in `swarm/` for the allowlist filter, the shared roles, both example workflows, and the missing-tool failure.
- The canvas load and save test (or the existing frontend test runner) shows `mcpToolNames` survives a template load and a save payload.
- ESLint on the touched files.
- Operator checks MUAPI-020 through MUAPI-023 after the portal link. The automated suite stays on fixtures.
