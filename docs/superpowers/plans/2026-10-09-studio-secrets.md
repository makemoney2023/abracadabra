# Studio secrets implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HQ renders stills, video, and voice with keys that stay on `handoff-connectors`. A Cursor cloud run builds the site or app from finished files. A client repo receives a variable name only when the running product calls a vendor with the client's own credential.

**Architecture:** Module `studio` on the existing connector worker writes bytes to R2 and returns an object key. The agent skill stays `mode: complete`. The cloud-run create body keeps `agentId` and does not gain `envVars`. Client runtime secrets are a name, a host, and a set flag in D1.

**Tech Stack:** The connector Worker, Vitest, D1, R2 binding on `handoff-connectors`, the existing cloud-run launch in `handoff/src/lib/cursor-build.ts`.

**Design:** [`docs/superpowers/specs/2026-10-09-studio-secrets-design.md`](../specs/2026-10-09-studio-secrets-design.md). Requirements STU-001 through STU-024. This plan amends the social-pack example in [`docs/hq-agent-spec.md`](../../hq-agent-spec.md) section 6.1. It does not change the Cursor create shape except to lock it with a test.

---

## Repository boundary

Work is in [`connectors/`](../../../connectors/) and [`handoff/`](../../../handoff/). Do not put `FAL_KEY`, `INFSH_API_KEY`, or `ELEVENLABS_API_KEY` on `handoff`, `handoff-hq`, or `handoff-agent`. Do not add `envVars` to the cloud-run create. Do not commit a filled env file. Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>` with `GIT_AUTHOR_*` and `GIT_COMMITTER_*` on the commit command. Do not change git config.

## File structure

| Path | Responsibility |
| --- | --- |
| `connectors/src/studio.ts` | `generate_image` and `generate_video`; grant profile; R2 put; result without a vendor URL |
| `connectors/src/studio.test.ts` | Missing grant, ignored key argument, object key result |
| `connectors/src/registry.ts` | Register the module |
| `connectors/wrangler.jsonc` | R2 binding for the file bucket |
| `connectors/README.md` | Secret names and the operator commands |
| `handoff/src/lib/cursor-build.ts` | Prompt denylist for studio assignment lines |
| `handoff/src/lib/cursor-build.test.ts` | Create body has no `envVars`; denylist blocks the run |
| `handoff/src/lib/runtime-secrets.ts` | Name, host, set flag |
| `handoff/migrations/0021_client_runtime_secrets.sql` | The table. Next free number after `0020_connector_grants.sql`. Confirm before writing. |
| `handoff/.env.example` | Empty names, comment that the value is a connector secret |
| `handoff/README.md` | One paragraph: generation in HQ, names only in a client repo |

## Global constraints

- Studio keys are Worker secrets on `handoff-connectors` only.
- The tool result is `objectKey`, `role`, `contentType`, `model`, `costCents`. No vendor URL, no key.
- `organizationId` is stamped. The grant's `resource` is the profile. A mismatch makes no vendor call.
- `cursorPrompt` rejects `FAL_KEY=`, `INFSH_API_KEY=`, `ELEVENLABS_API_KEY=`, and `CURSOR_API_KEY=`.
- The create JSON keeps `agentId` and omits `envVars` and `mcpServers`.
- A `client_runtime` row has no value column. The client page does not render one.
- Tests use fixtures. They do not call fal, inference.sh, ElevenLabs, or `api.cursor.com`.

## Tasks

### Task 1: Studio module, failing test first

**Files:** `connectors/src/studio.ts`, `connectors/src/studio.test.ts`, `connectors/src/registry.ts`

- [ ] **Step 1:** Write the test. A call with no grant returns an error and does not call `fetch`. A call whose arguments include `apiKey` or `image_url` ignores them and uses the grant profile. A successful fixture returns `objectKey` and the stored bytes, and the result string has no `http`.

- [ ] **Step 2:** Run `npm test` in `connectors/` and confirm the new test fails because the module is absent.

- [ ] **Step 3:** Implement `studio` and register it. Map `brand-stills`, `hero-still`, and `ad-creative` to the image endpoint, and `hero-video` and `ad-video` to the video endpoint. Read `FAL_KEY` from the worker env inside the module. The handler that talks to fal is one function so the test can inject a fake fetch.

- [ ] **Step 4:** Bind the handoff file bucket on the connector worker as R2. Put bytes at the object key. Do not log the request headers.

- [ ] **Step 5:** `npm test` and `npx tsc --noEmit` in `connectors/` pass.

### Task 2: Prompt and launch lock

**Files:** `handoff/src/lib/cursor-build.ts`, `handoff/src/lib/cursor-build.test.ts`

- [ ] **Step 1:** Add a test whose brief contains `FAL_KEY=test`. `cursorPrompt` returns null. Starting a build with that brief blocks as `prompt_rejected` and does not call fetch. Add a test that the JSON body of a successful start has `agentId` and has no `envVars` key.

- [ ] **Step 2:** Run the test file and confirm the denylist assertion fails.

- [ ] **Step 3:** Extend `cursorPrompt` with the four assignment names from the constraints. Leave the create body as it is.

- [ ] **Step 4:** `npm test` in `handoff/` for that file passes.

### Task 3: Client runtime names

**Files:** migration, `handoff/src/lib/runtime-secrets.ts`, the client page that already lists connector grants

- [ ] **Step 1:** Test that inserting a value-shaped field is impossible (the function's input has no value), that `set_at` null blocks a build whose brief names that variable, and that the page model exposes name, host, and set flag only.

- [ ] **Step 2:** Confirm the migration number is free. Write `client_runtime_secrets` as specified.

- [ ] **Step 3:** Wire the block into the existing build gate beside `prompt_rejected`. Reason string `runtime_secret_unset`.

- [ ] **Step 4:** Staff can add a name and a host, and can mark the row set. There is no input for the secret value.

- [ ] **Step 5:** `npm test` and eslint on the touched files pass.

### Task 4: Docs and the skill mode

**Files:** `handoff/.env.example`, `handoff/README.md`, `connectors/README.md`, `handoff/CHANGELOG.md`

- [ ] **Step 1:** Document the empty secret names and the operator `wrangler secret put` commands.

- [ ] **Step 2:** State in the Handoff README that image and video generation runs in HQ, and that a client repo's `.env.example` lists runtime names with empty values.

- [ ] **Step 3:** When the skill index marks `ai-image-generation`, the planner treats it as `complete`. A website skill stays `plan`. Cover that with the existing planner test if one asserts the social-pack mode; otherwise add one fixture.

- [ ] **Step 4:** Changelog entry for the behavior, with the date, the touchpoints, and the commands that passed.

### Task 5: Operator check

Do this after deploy. It is not part of the automated suite.

- [ ] Put `FAL_KEY` on `handoff-connectors`. Link `/mcp/studio` on the portal with **Require user auth** off.
- [ ] Set one client's grant `resource` to `brand-stills`.
- [ ] Run one still. Confirm the deliverable has an object key and the tool result the model saw has no URL and no key.
- [ ] Confirm the cloud-run request body in the test fixture still has no `envVars`.

## Done when

- A media skill stores a file without a cloud run.
- A website build's prompt lists paths and contains no studio assignment.
- A runtime name with `set_at` null stops the launch.
- Studio key names are absent from `handoff-agent` and from the Cursor create body.
