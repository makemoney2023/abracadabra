# Grok agent media generation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an assigned Grok agent generate a still or a clip through HQ, using Cloudflare's image and video models, and keep the bytes for that client.

**Revised the same day:** The agent picks the model from `fits` on `GET /api/agent-media/models` (`?fits=` filters). HQ does not substitute a default. `task_id` is optional. A generated file is not a social post. Filing it with `media_ids` is ordinary held work, and social posting is a later choice.

**Architecture:** Grok agents stay outside the Worker. They keep using a `caw_` bearer against `hq.abra-ca-dabra.app`. HQ already has the Workers AI binding, so a new agent route calls `env.AI.run` and writes the bytes into the client space. The agent never receives a Cloudflare token. The swarm stays off. Video does not travel back through the JSON filing body.

**Tech Stack:** Next.js route on `handoff-hq`, Workers AI binding (`env.AI.run`), D1, R2 bucket `handoff`, existing `caw_` auth in `agentForToken`.

---

## Baseline (researched 2026-10-22)

Grok agents are Client Services teammates and hires. Each has a `caw_` bearer, stored as SHA-256 on `client_agents`. They are not a process inside `handoff-agent`. `agent.abra-ca-dabra.app` does not serve these routes.

### How a job reaches the agent

`AGENT_MODE=agents` (`handoff/src/lib/agent-mode.ts`) stops new swarm runs, Cursor builds, and capped-build retries. A move to Doing, or a client change request, calls `dispatchTask` and writes `client_agent.dispatch`. The agent reads that list with `GET /api/agent-work?dispatches=1`. The dispatch names the task, the reason (`build`, `run`, or `changes`), and the skill packs on the card. With no live lead, the dispatch says Client Services must assign one.

Committed `handoff/wrangler.jsonc` and `handoff/wrangler.hq.jsonc` do not set `AGENT_MODE`. Unset means `legacy`. Production can set the var in the dashboard. This plan assumes production is `agents`, which is the mode the operator described. Confirm that var on `handoff` and `handoff-hq` before shipping the route.

### What the agent can already call

All of these are HTTPS on `https://hq.abra-ca-dabra.app`, bearer `caw_`, and the client must be a live assignment (`agentForToken` in `handoff/src/lib/agent-work-filing.ts`).

| Area | Routes |
|---|---|
| Work | `POST/GET /api/agent-work`, `GET/POST /api/agent-work/:id` |
| Board | `GET /api/agent-board`, `POST /api/agent-board/tasks`, `POST /api/agent-board/tasks/:id` |
| Projects, contacts | `/api/agent-projects`, `/api/agent-contacts` |
| Skills | `/api/agent-skills`, `/api/agent-skill-library` |
| Social | `/api/agent-social/*` (writes need `SOCIAL_AGENT_ACTIONS=on`, which is set) |

`POST /api/agent-work` files finished work. It is held until Client Services approves it. A `task_id` moves the card to Waiting on Client Services. Attachments are text, or a base64 data URL. `adaptArtifact` keeps `image/png`, `image/jpeg`, `image/webp`, `image/gif`, and a real PDF. Any other data URL, including `video/mp4`, is stored as markdown. The body cap is `AGENT_WORK_MAX_MB` (10). Social routes edit captions and plans for pieces that already have media. They do not create a new picture or clip.

### What generates media today

The swarm specialists are Workers AI text models (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, then `@cf/zai-org/glm-4.7-flash`). They do not call an image or video model. When a visual stage is accepted, HQ calls one still model, `@cf/black-forest-labs/flux-2-klein-9b`, through `fluxRun()` and `renderVisualImages`. `videoPrompt` is parsed and dropped. `accept_workflow` is in `SWARM_TOOLS_OFF`, so that still path does not run while `AGENT_MODE=agents`.

`handoff-hq` already binds `ai` as `AI`. The binding's fallback `run(model, input)` accepts catalog ids that are not in the Workers AI type list, such as `google/veo-3.1-fast`. No agent route passes one.

MuAPI render roles are a different vendor, and the HQ grant for portal server `muapi` is off. This plan does not turn MuAPI on.

## Model set for the first route

Ship a fixed allowlist the agent can read. Do not accept an arbitrary model string.

Stills, called with JSON `{ prompt }` unless the row says multipart:

| Id | Notes |
|---|---|
| `@cf/black-forest-labs/flux-2-klein-9b` | Multipart prompt, same shape as `fluxInput`. Default still. |
| `@cf/black-forest-labs/flux-2-dev` | JSON prompt. |
| `@cf/leonardo/lucid-origin` | JSON prompt. |
| `@cf/leonardo/phoenix-1.0` | JSON prompt. |
| `black-forest-labs/flux-2-pro-preview` | Catalog. JSON prompt. |
| `google/nano-banana-2` | Catalog. JSON prompt. |
| `xai/grok-imagine-image` | Catalog. JSON prompt. |
| `pruna/p-image` | Catalog. JSON prompt. |

Clips. These return a URL or a job, not a small base64 string:

| Id | Notes |
|---|---|
| `google/veo-3.1-fast` | Default clip. |
| `xai/grok-imagine-video` | Text or a first frame. |
| `black-forest-labs/flux-3-video` | Text, image, or extend. |
| `pruna/p-video` | Text. |
| `alibaba/wan-2.7-i2v` | Needs an image URL HQ already stored. |

Add a model only by editing the allowlist and its test. The full Cloudflare catalog stays out of the request body.

## Request shape

`GET /api/agent-media/models` returns the allowlist: id, kind (`image` or `video`), and whether a reference image is required.

`POST /api/agent-media` body:

```json
{
  "external_id": "grok-run-123:hero",
  "client": "org-id-or-domain",
  "task_id": "task-id",
  "model": "google/veo-3.1-fast",
  "prompt": "A quiet shop counter at opening",
  "image_media_id": null,
  "aspect_ratio": "1:1",
  "duration_seconds": 6
}
```

`task_id` is required and must be an open card on a client this agent is assigned to. `external_id` makes a repeat return the first result. `image_media_id` is a still this same route already stored, used as the starting frame for an image-to-video model.

Response for a finished still:

```json
{
  "ok": true,
  "state": "ready",
  "media_id": "…",
  "kind": "image",
  "content_type": "image/png",
  "bytes": 120034,
  "name": "hero.png"
}
```

Response when the clip is still running:

```json
{ "ok": true, "state": "running", "job_id": "…", "media_id": "…" }
```

`GET /api/agent-media/:media_id` returns the same record. HQ polls the provider. The agent polls this route. Do not ask the agent to call Cloudflare.

`POST /api/agent-work` gains optional `media_ids: string[]`. Those stored objects are copied into the filing's folder as real files. The agent does not re-send the bytes. A data URL for video stays rejected.

## File map

| File | Responsibility |
|---|---|
| `handoff/src/lib/agent-media-models.ts` | Allowlist, kind, input shape per model. |
| `handoff/src/lib/agent-media.ts` | Authz, idempotency, `AI.run`, R2 write, job row. |
| `handoff/src/lib/agent-media.test.ts` | Allowlist, auth, image store, video job, filing attach. |
| `handoff/src/app/api/agent-media/models/route.ts` | GET list. |
| `handoff/src/app/api/agent-media/route.ts` | POST generate. |
| `handoff/src/app/api/agent-media/[mediaId]/route.ts` | GET status. |
| `handoff/migrations/0044_agent_media.sql` | `agent_media` rows. `0041` was already used. |
| `handoff/src/lib/agent-work-filing.ts` | Accept `media_ids` and attach stored bytes. |
| `handoff/src/lib/workflow-files.ts` | Store `video/mp4` bytes as a file, not markdown. |
| `handoff/README.md` | One section under client agent work filing. |
| `handoff/CHANGELOG.md` | Delta at the top. |

Do not change `swarm/`. Do not call `fluxRun` from the new route. Do not put `AI_GATEWAY_API_KEY` or a Cloudflare token in the agent response.

## Tasks

### Task 1: Allowlist

**Files:** `handoff/src/lib/agent-media-models.ts`, `handoff/src/lib/agent-media-models.test.ts`

- [x] **Step 1:** Write a test that the default still is `@cf/black-forest-labs/flux-2-klein-9b`, the default clip is `google/veo-3.1-fast`, an unknown id is rejected, and `google/veo-3.1-fast` is `video`.
- [x] **Step 2:** Run `cd handoff && npx vitest run src/lib/agent-media-models.test.ts` and confirm the failure.
- [x] **Step 3:** Add the tables above as data. Export `mediaModel(id)` and `listMediaModels()`.
- [x] **Step 4:** Re-run the test.

### Task 2: Store a still

**Files:** migration `0044_agent_media.sql`, `handoff/src/lib/agent-media.ts`, `handoff/src/lib/agent-media.test.ts`, `handoff/src/app/api/agent-media/route.ts`, `handoff/src/app/api/agent-media/models/route.ts`

Table `agent_media`: `id`, `external_id`, `agent_id`, `organization_id`, `task_id`, `model`, `kind`, `state` (`ready` or `running` or `failed`), `content_type`, `byte_length`, `r2_key`, `error`, `created_at`. Unique `(agent_id, external_id)`.

- [x] **Step 1:** Test that a token with no assignment gets 401, a task on another client gets 403, and a known still model with a fake `AI.run` writes one R2 object and returns `state: ready` plus `media_id`. A second POST with the same `external_id` does not call `AI.run` again.
- [x] **Step 2:** Run the test and confirm it fails.
- [x] **Step 3:** Implement. Multipart only for `flux-2-klein-9b`, via the existing `fluxInput`. Every other still is `env.AI.run(model, { prompt })`. Decode the image bytes the binding returns (`image` base64 or raw bytes). Write them with the space's object store. Cap the prompt at 2,000 characters and the output at 8 MB.
- [x] **Step 4:** Re-run the test. Log `client_agent.media` with model, task id, and byte length. Do not log the prompt.

### Task 3: Store a clip without blocking the filing cap

**Files:** `handoff/src/lib/agent-media.ts`, `handoff/src/app/api/agent-media/[mediaId]/route.ts`, tests in `agent-media.test.ts`

- [x] **Step 1:** Test that a video model returns `state: running` and `job_id` when `AI.run` returns a job handle, and that GET later stores `video/mp4` bytes when the handle completes. Test that a finished URL is fetched by HQ and stored the same way. Test that the agent response has no provider URL and no base64 video.
- [x] **Step 2:** Run the test and confirm it fails.
- [x] **Step 3:** Implement the poll on GET. Duration is 4, 6, or 8 seconds; reject anything else. If the binding blocks until the file exists, store it and return `ready` from POST. One clip per `external_id`.
- [x] **Step 4:** Extend `storeWorkflowOutput` so a `video/mp4` byte buffer is stored as `video/mp4`, and `itemForPath` records that content type. A `data:video/mp4` string still becomes markdown, so the agent cannot sneak a clip through the old attachment field.
- [x] **Step 5:** Re-run the test.

### Task 4: Attach stored media to a filing

**Files:** `handoff/src/lib/agent-work-filing.ts`, `handoff/src/lib/agent-work-filing.test.ts`

- [x] **Step 1:** Test that `POST /api/agent-work` with `media_ids: [id]` and no attachment body writes the stored still or clip into the filing folder, held like any other agent batch. A media id from another agent or another client is 403 and stores nothing. A `running` id is 409.
- [x] **Step 2:** Run the test and confirm it fails.
- [x] **Step 3:** Load the `agent_media` row, copy its R2 bytes into the filing through `storeWorkflowOutput`, and leave the original row in place so a later clip can use `image_media_id`.
- [x] **Step 4:** Re-run `npx vitest run src/lib/agent-media.test.ts src/lib/agent-work-filing.test.ts src/lib/agent-media-models.test.ts`.

### Task 5: Docs

**Files:** `handoff/README.md` (Client agent work filing), `handoff/CHANGELOG.md`

- [x] **Step 1:** Document the three routes, the `caw_` bearer, the required `task_id`, the allowlist, and that clips come back as `media_id` values to pass on `POST /api/agent-work`. State the size and duration caps.
- [x] **Step 2:** Changelog delta dated 2026-10-22: what changed, why, touchpoints, data-flow (agent HTTPS → HQ `AI.run` → R2 → filing), API impact (new routes plus `media_ids`).

## Out of scope

- Re-enabling the swarm or `accept_workflow` image rendering.
- Letting the agent pick a model that is not on the allowlist.
- Creating a Zernio social piece from the new file. After the filing is approved, the existing social tools can reference the stored object. That wiring is a follow-up.
- MuAPI, xAI keys, and Vercel AI Gateway. Those are different callers. This route uses the Workers AI binding on `handoff-hq`.

## Verification

```bash
cd handoff && npx vitest run src/lib/agent-media-models.test.ts src/lib/agent-media.test.ts src/lib/agent-work-filing.test.ts
```

No live Cloudflare call in unit tests. A manual check, after `AGENT_MODE=agents` is confirmed on `handoff-hq`, is one still and one six-second clip on a test card, then a filing that contains both files and no markdown dump of the video.
