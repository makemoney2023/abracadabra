# Studio secrets — design specification

**Date:** 2026-10-09
**Product:** Handoff HQ, `handoff-connectors`, Cursor cloud runs against a client repo
**Status:** Specification. Nothing in this document is built.
**Requirements:** STU-001 through STU-024
**Lives in:** [`connectors/`](../../../connectors/) for the vendor call, [`handoff/`](../../../handoff/) for the deliverable and the cloud-run launch
**Plan:** [`docs/superpowers/plans/2026-10-09-studio-secrets.md`](../plans/2026-10-09-studio-secrets.md)
**Extends:** [`docs/hq-agent-spec.md`](../../hq-agent-spec.md) sections 2.4, 6.1, 7.2, and 15, and [`docs/superpowers/specs/2026-10-09-mcp-connectors-design.md`](2026-10-09-mcp-connectors-design.md)

## Decision

Generate stills, video, voice, and music in HQ. Cursor builds the application or the website and receives the finished files. Studio API keys stay on the `handoff-connectors` worker. A client repository receives a variable name only when the shipped product itself must call a third party at runtime, and the value on that host is the client's own credential.

```text
Skill (image, video, voice)  mode = complete
  → portal tool on handoff-connectors
  → worker secret calls the vendor
  → bytes land in R2 on the client's deliverable
  → build brief lists deliverables/<slug>/ paths
  → Cursor cloud run writes the site or app that references those files
```

The key appears in one place in that chain: the connector worker's secret store.

## Why this split

Image and video generation is an HTTP call. Section 6.2 of the HQ agent spec reserves `mode: plan` for a program the Worker isolate cannot run. A website or an application is that program. A fal or inference.sh render is not. Treating `ai-image-generation` as a build step would open a Cursor run whose job is to hold a key.

The launch HQ sends today is in `handoff/src/lib/cursor-build.ts`: prompt text, one `repos` entry, `autoCreatePR`, `skipReviewerRequest`, `name`, and a client `agentId`. The [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) (checked 2026-10-09) accepts session `envVars`, and it refuses them on any create that also sends `agentId`. `envVars` is in beta: when the account does not have it, the field is ignored and the create still succeeds. A key we believed we passed can be absent, and a key that is present can be written into the pull request. We keep `agentId` because a repeated stage change must hit `409` instead of starting a second agent.

Cursor's own secret stores are the wrong shelf for a studio key:

- Environment-scoped secrets apply to every repository in that environment.
- User and team secrets apply more widely still. A team secret named `FAL_KEY` would be in the shell of every cloud agent, including every client build.
- `.cursor/environment.json` is committed and, when present, overrides the dashboard environment. It is a setup file, not a vault.
- A snapshot can capture a `.env.local` that was on disk when the snapshot was taken. The Secrets tab is the documented place for a value, and even that tab is for the repo the agent is building, not for the agency's generation account.

Finished media already has a home. The deliverable manifest lists paths, the pull copies those files to R2, and the client views them through the media route. The website build references those paths.

Search Console already follows the same shape: the vendor secret is on `handoff-connectors`, the portal holds only the connector bearer, and a grant row names the client's resource. Studio generation is the next module on that worker, not a new place to keep keys.

## Three classes

| Class | Who pays and who owns the credential | Where the value lives | What the client repo contains |
|---|---|---|---|
| `studio` | Abracadabra. One account, many clients. | Worker secret on `handoff-connectors` only. | The finished file, or a path to it in the build brief. |
| `client_runtime` | The client. The running site or app calls the vendor for its own users. | That product's host secret (Cloudflare Worker secret or the host's env store). HQ stores the variable name, the host, and that a value was set. | An empty line in `.env.example`, and code that reads that name. |
| `build_login` | Whichever account can open the preview. Used so the cloud agent can sign in and test. | A Cursor environment-scoped secret on an environment whose repository list is that one client repo. | Nothing. The build brief names the variable and tells the agent to leave the value out of source, logs, and the pull request. |

`studio` never changes class. A studio key is not copied onto a client host to save a step, and it is not added as a Cursor user, team, or environment secret.

Other third-party calls follow the same table. Search Console, and the next data API HQ calls for a client, are `studio` in the sense that the agency holds the credential on the connector worker (the grant row still limits which property is queried). Stripe on a client's checkout is `client_runtime`. A preview password is `build_login`.

## Current state

Checked against the code and the Cursor docs on 2026-10-09.

- `CURSOR_API_KEY` starts cloud runs from the staff app. It is not a secret on `handoff-agent` (`handoff/src/lib/github/secrets.ts`, `docs/hq-agent-spec.md` section 15).
- The create body has no `envVars` and no `mcpServers` (`handoff/src/lib/cursor-build.ts`).
- The build brief is the whole prompt. `cursorPrompt` rejects an empty brief, a brief containing `answers_json` or a `From:` line, and an extra longer than the brief.
- Section 7.2 already tells the cloud agent to commit no secrets.
- `handoff-connectors` has one module, `search-console`. Its vendor secret is `GOOGLE_SEARCH_CONSOLE_SA`. Requests need `CONNECTOR_TOKEN`. The worker binds D1 and does not bind R2 (`connectors/wrangler.jsonc`).
- `connector_grants` is one row per organization and connector. `resource` is the vendor id the tool must use. A missing grant makes no vendor call.
- The HQ agent spec section 6.1 still lists `ai-image-generation` as a build step when images are to be made. This spec replaces that line: generation is `mode: complete`.
- Product films in [`docs/video-pipeline-targets.md`](../../video-pipeline-targets.md) are captured with Playwright and composed in Remotion. That pipeline needs no generation key. Generated b-roll inside a film is a studio call whose output file is what the compose step reads.

## Goals

- One studio account renders stills and video for every client, with a grant that limits the profile.
- The bytes are on the client's deliverable before any cloud run starts.
- A website or app build can name those files and cannot see the key that produced them.
- A shipped product that must call a vendor gets the variable name in git and the client's value on the host.
- Staff can see which names are set. They cannot read the value back from HQ.

## Non-goals

- Building the connector module, the R2 binding, or the grant UI in this change.
- A separate vendor account per client.
- Passing `envVars` on `POST /v1/agents`.
- Writing secrets into GitHub Actions, `.cursor/environment.json`, or a client `.env` file that is committed.
- Letting the client download or reveal the studio key from Handoff.
- Moving Playwright capture or Remotion compose onto the connector worker. Those stay a program in the product repo.
- Choosing fal versus inference.sh in the prompt. The skill names the profile; the module maps the profile to a model.

## Secret placement

### Studio

- **STU-001.** `FAL_KEY` is a Worker secret on `handoff-connectors`. `INFSH_API_KEY` is a second secret on that same worker, used only when the skill's fallback says so. `ELEVENLABS_API_KEY` is the same kind of secret when a skill asks for voice. None of these names are set on `handoff`, `handoff-hq`, or `handoff-agent`.
- **STU-002.** The portal credential for the studio module stays the adapter shape already specified: Access service-token headers plus `Authorization: Bearer` of `CONNECTOR_TOKEN`. The vendor key is not in that credential.
- **STU-003.** `.env.example` in this repo lists the names with empty values and a comment that the value is a connector Worker secret. The example file is the contract. It is not a place a real key is pasted.
- **STU-004.** Rotation is `npx wrangler secret put <NAME>` on `handoff-connectors`. No client repository changes when a studio key rotates.

### Client runtime

- **STU-005.** HQ records `organization_id`, `name`, `host`, and `set_at` for a client runtime secret. The value is not a column, not a log line, and not an activity payload.
- **STU-006.** Staff set the value in the product's host secret store. The build brief lists the names the app reads and states that the values are already on the host.
- **STU-007.** The client repository's `.env.example` contains the name and an empty value. A committed `.env`, `.env.local`, or `.dev.vars` with a non-empty value fails review.
- **STU-008.** The default owner of a `client_runtime` value is the client. An agency key is placed on that host only after a staff note on the task names the reason. A studio generation key is never that agency key.

### Build login

- **STU-009.** A preview password or TOTP secret is an environment-scoped Cursor secret. The environment lists that client repository and no other. HQ does not upload the value through the API in v1. Staff add it in the Cursor dashboard and record the variable name on the task.
- **STU-010.** The cloud-run create body stays without `envVars`. Dropping `agentId` in order to send `envVars` is out of scope.

### Refused locations

These locations do not receive a studio key, a client runtime value, or a build-login value from HQ:

- The Cursor prompt and `build-brief.md`.
- D1, Durable Object storage, R2 object metadata, the PDF, and activity `data_json`.
- A Cursor user secret, team secret, or an environment that contains more than one repository.
- `.cursor/environment.json` and any snapshot step that copies a filled `.env.local` into the image.
- `envVars` or `mcpServers[].env` on the agent create request.

## Studio module

Module id `studio` on the existing worker. Portal server name `studio`. Tools the portal may enable:

| Tool | Inputs the model may send | Result the model receives |
|---|---|---|
| `generate_image` | `organizationId`, `prompt`, `profile` (`brand-stills`, `hero-still`, `ad-creative`) | `objectKey`, `role`, `contentType`, `model`, `costCents` |
| `generate_video` | `organizationId`, `prompt`, `profile` (`hero-video`, `ad-video`) | same shape, `role` is the video role the manifest allows |

- **STU-011.** `organizationId` is stamped from the Durable Object name. A model-supplied value is replaced before the call leaves the agent, the same rule as Handoff and Search Console.
- **STU-012.** The tool ignores any API key, vendor URL, or model id in the arguments. The profile on the grant is the one that runs. A model-supplied profile that does not match the grant is an error and makes no vendor call.
- **STU-013.** No grant row: JSON-RPC error, `agent.note` records `studio`, no vendor call.
- **STU-014.** The connector writes the bytes to R2 with the handoff file bucket binding and returns the object key. The vendor's download URL is not part of the tool result, the activity row, or the build brief.
- **STU-015.** `costCents` and `model` are written on the deliverable activity so a later invoice can show the render. The activity does not include the prompt if the prompt contains client file text; the prompt stored is the one the skill produced.

`connector_grants.resource` for `studio` is the allowed profile. One row means one profile. A second profile is a second grant only after the table allows it. Until then, one profile per client is the rule, and a piece that needs another profile asks staff.

The agent then calls the existing deliverable item tools with that object key as the media path. The cloud run, when one happens later, sees the path.

## What moves to build

- **STU-016.** A skill that only generates media is `mode: complete`. It does not write `build-brief.md` and it does not set the task stage to `build`.
- **STU-017.** A website or application skill stays `mode: plan`. The build brief lists media already stored, by path. The prompt contains no vendor key and no vendor URL.
- **STU-018.** A social pack of captions and images finishes in the Worker. A page on the client's site is a separate piece. Its build starts after the images are stored, and the brief points at those files.
- **STU-019.** Playwright capture and Remotion compose stay in the product repository named by [`docs/video-pipeline-targets.md`](../../video-pipeline-targets.md). Generated b-roll used inside that film is a `generate_video` result whose file the compose step reads. The product repo does not gain `FAL_KEY`.

Section 6.1's social-pack example changes from "`ai-image-generation` (build)" to "`ai-image-generation` (complete, studio connector)". The website example is unchanged.

## Client runtime record

```sql
CREATE TABLE client_runtime_secrets (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  set_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (organization_id, name)
);
```

- **STU-020.** `name` matches `^[A-Z][A-Z0-9_]{1,63}$`. `host` is a short label (`cloudflare:<worker>`, `vercel:<project>`), not a URL with a userinfo part. `set_at` is null until staff mark the host secret as set. The table has no value column.
- **STU-021.** The client page lists the names, the host, and whether `set_at` is set. It has no field that displays a secret and no control that copies one.
- **STU-022.** A build whose brief names a `client_runtime` variable with `set_at` null is blocked with `runtime_secret_unset`. The cloud run does not start.

## Cloud-run guard

- **STU-023.** The create body keeps `agentId` and omits `envVars` and `mcpServers`. A test locks that shape.
- **STU-024.** `cursorPrompt` rejects a brief that contains an assignment to a studio name (`FAL_KEY`, `INFSH_API_KEY`, `ELEVENLABS_API_KEY`) or to `CURSOR_API_KEY`. The task is blocked with `prompt_rejected`, which already exists.

## Failure

| Situation | What staff see | What does not happen |
|---|---|---|
| Studio secret missing on the worker | `agent.note` names the secret. The task asks staff. | No vendor call, no invented file. |
| No grant | `agent.note` names `studio`. | No vendor call. |
| Vendor error | The note includes the vendor status, not the request headers. | No partial file marked ready. |
| Brief contains a studio assignment | `prompt_rejected`. | No cloud run. |
| Runtime name not marked set | `runtime_secret_unset`. | No cloud run. |
| Profile mismatch | Tool error. | The grant's profile is not silently swapped. |

## Verification

When the plan is implemented:

- `npm test` and `npx tsc --noEmit` in `connectors/` for the studio module: missing bearer, missing grant, ignored key argument, result has `objectKey` and no URL.
- `npm test` in `handoff/` for the prompt denylist, the create body, and `runtime_secret_unset`.
- A live render is an operator check after `wrangler secret put`. The automated suite stays on fixtures.

## Operator setup, after the module ships

1. `npx wrangler secret put FAL_KEY` in `connectors/` (and `INFSH_API_KEY` or `ELEVENLABS_API_KEY` only if that fallback is in use).
2. Link `https://connectors.abra-ca-dabra.app/mcp/studio` on the portal. Tools on, aliases bare, **Require user auth** off. Portal headers are the Access pair plus `CONNECTOR_TOKEN`.
3. On the client, set the grant `resource` to the profile that client may spend.
4. Confirm the next wake can call `generate_image` and that the tool result has an object key.
5. For a client runtime secret, paste the client's value into that product's host, then mark the row set. Leave the studio key off that host.
