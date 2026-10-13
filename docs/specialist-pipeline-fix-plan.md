# Specialist pipeline: fix plan

Status: implemented on `cursor/pipeline-fixes-1b22`. The production smoke test is the remaining check after deploy. Follows the specialist pipeline merged in PR #85 (`cda4f2b`).

This plan fixes every problem found in the post-merge review. Work runs in the order below. Each step lists the files, the change, the test that proves it, and the check that says it is done.

## Goal

The social preset (and any other pipeline) runs end to end in production. Each specialist gets its real skill text. Accepting a visual stage saves a real PNG. Settled runs record their true status and receipt, and HQ chat gets a notice when a stage needs accepting.

## Out of scope

- New skill packs or presets.
- Changes to the manager model or the specialist models.
- Rewriting the `cda4f2b` merge commit. Changing it needs a force-push, which the ownership rule does not allow.

## Phase 1: make production work

### 1.1 Deploy the client app worker that runs the cron

**Problem.** The cron that settles specialist runs (`settleRunningSwarms`) only exists in `handoff/wrangler.jsonc`. That config deploys the `handoff` worker, which was not redeployed after #85. Until it is, production still settles runs with the old code: no new statuses, no receipts, no chat notices.

**Change.**
- Check that `AGENT_WAKE_SECRET` and `AGENT_URL` are set on `handoff`. The notice POST to `/hq-notice` is signed with that secret. Set them if they are missing.
- Deploy `handoff` with `wrangler.jsonc`, after Phases 1.2 and 1.3 land so it ships the fixed code.
- Add the `handoff` worker to the deploy checklist in `handoff/README.md`. The checklist must say that cron changes ship with `wrangler.jsonc`, not `wrangler.hq.jsonc`.

**Done when.** `wrangler deployments list` for `handoff` shows a version newer than `cda4f2b`, and a settled specialist run in D1 has `last_receipt` filled in.

### 1.2 Send Flux the multipart input it needs

**Problem.** `@cf/black-forest-labs/flux-2-klein-9b` only accepts `{ multipart: { body, contentType } }`. `renderVisualImages` in `specialist-pipeline.ts` sends `{ prompt }`, so every image call fails. The try/catch means the accept still succeeds, but with no image.

**Change.**
- Narrow `ImageRun` in `specialist-pipeline.ts` to `(prompt: string) => Promise<{ image?: string }>`. That way the pipeline code no longer knows the model's wire format.
- In `handoff/src/app/api/hq-tools/route.ts`, rewrite `fluxRun()` so it:
  - builds a `FormData` with `prompt`, `width` 1024, and `height` 1024;
  - serializes the form with `new Response(form)`, reading the body as a stream and the `content-type` header (which includes the boundary);
  - calls `env.AI.run(model, { multipart: { body, contentType } })` and returns `{ image }`.
- Keep the model id in one constant, `VISUAL_MODEL`, in `specialist-pipeline.ts`, and pass it in.
- When the image call fails, record it in the stage receipt (`image: failed — <reason>`) instead of dropping it silently.

**Tests.**
- `route.test.ts` (new) or a unit test of a pulled-out `fluxInput(prompt)` helper: the input has a `multipart.body` and a `contentType` that starts with `multipart/form-data; boundary=`.
- `specialist-pipeline.test.ts`: a failed image call leaves the stage accepted and writes the failure to the receipt.

**Done when.** Accepting a visual stage in production saves a `.png` file (Phase 2.4 runs this check).

### 1.3 Read the skill excerpt from R2, not the file system

**Problem.** `skillExcerpt` in `client-workflows.ts` reads `SKILL.md` with `node:fs`. A Worker has no file system, so every specialist runs without its skill text. The import also makes the build trace the whole repo, which grows `.open-next/server-functions/default` to about 46MB.

**Change.**
- Add the `SKILLS` R2 binding (`bucket_name: handoff-skills`) to `wrangler.jsonc` and `wrangler.hq.jsonc`, matching `wrangler.agent.jsonc`.
- Add `readSkill?: (skillPath: string) => Promise<string | null>` to the `claimDueWorkflow` input. Delete `skillExcerpt` and the `node:fs` / `node:path` imports. The excerpt becomes `(await input.readSkill?.(path))?.slice(0, 1500) ?? ""`. Keep the guards that require the path to end in `SKILL.md` and reject `..`.
- Add a shared helper, `readSkillFromBucket(bucket, skillPath)`, in `skill-library.ts`. It uses `skillObjectKey`, the same key mapping the agent worker uses.
- Pass `readSkill` from every caller:
  - `hq-tools.ts` (`run_workflow` path), `specialist-pipeline.ts`, and `task-stage.ts`, through `ToolOptions.readSkill`, which comes from `getCloudflareContext().env.SKILLS` in the HQ route;
  - `db/agent-work.ts`, through the agent worker's existing `readSkill`;
  - the cron in `cloudflare-worker.ts`, if it claims workflows.
- When a stage has a skill path but the excerpt comes back empty, note `skill: missing` in the receipt so a bad path shows up.

**Tests.**
- `specialist-assignment.test.ts`: with a fake `readSkill`, the assignment contains the first 1500 characters. Without it, the assignment still builds and has no excerpt section.
- Rejected paths (`../x/SKILL.md`, `foo.md`) never call `readSkill`.

**Done when.** `rg "node:fs" handoff/src/lib` returns nothing outside tests, and the built `default` server function is under 15MB.

## Phase 2: stop confusing failures

### 2.1 Find the JSON in a mixed reply

**Problem.** `stripJsonFence` in `swarm/src/ai/check.ts` only strips a fence that wraps the whole reply. A model that writes "Here is the page:" followed by a JSON block gets `check_failed`.

**Change.** Replace it with `extractJson(text)`, which tries these in order:
1. The whole text, trimmed.
2. The first fenced block labeled `json`, or with no label.
3. The first balanced `{…}` or `[…]` span, found by scanning brackets and skipping string contents.

`checkSpecialist` and the handoff parse both use it. A reply with two JSON objects uses the first one, and the receipt notes `extra text ignored`.

**Tests.** Add cases to `check.test.ts`: prose then a fence, prose then bare JSON, a brace inside a string, two objects, and no JSON at all (still `check_failed`).

### 2.2 Make the chat notice independent of library internals

**Problem.** `HqChat.postNotice` calls the private `_hydrateMessages`, which could break silently when the `agents` package updates.

**Change.**
- Load the stored messages through the public API the package provides (`this.messages` after `onStart`, or the documented getter in the installed `agents` version). Check this against the package's current docs first (Context7).
- If no public way exists, keep the private call behind one helper with a version note, and pin the `agents` minor version in `package.json`.

**Tests.** Add a test to `worker.test.ts`:
- a signed POST to `/hq-notice` puts a notice message in the user's `HqChat` (read with `runInDurableObject`);
- an unsigned POST returns 401.

### 2.3 Build pipeline stages all at once

**Problem.** `startPipeline` inserts stages one at a time and calls `abandonPipeline` if one fails. If the cleanup also fails, a half-built group is left behind and blocks the client.

**Change.** Build the group row and every stage row first. Insert them all in one `sql.batch` (D1 batch, which is a transaction). Start stage 0 only after the batch commits. `appendPipelineStage` does the same for its single insert plus the group update.

**Tests.** In `specialist-pipeline.test.ts`, make the third insert throw. Afterwards there is no group and no stage rows.

### 2.4 Production smoke test of the social preset

**Run once after Phase 1 is deployed**, against a test client that is wiped afterwards:
1. Start the social preset from HQ chat.
2. Wait for stage 1 to settle. Check that the status is `waiting_accept`, the receipt is filled in, and an HQ chat notice arrived.
3. Accept stage 1. Check that stage 2's assignment contains the accepted page and the skill excerpt.
4. Accept through the visual stage. Check that a `.png` file is saved with type `image/png`.
5. Run `pipeline_status` and check that the output is capped (Phase 3.1).

Record the outcome in `handoff/CHANGELOG.md`. A failure here becomes a fix in this plan before it closes.

## Phase 3: smaller improvements

### 3.1 Cap `pipeline_status` output

`showPipeline` limits each stage's output preview to 600 characters and the whole result to 6000. It adds `… (N more characters, open the workflow to read all)` when it cuts. Test: a group with long pages stays under the cap.

### 3.2 Staff-log entries for pipeline actions

Write an `activities` row for each of these, using the existing insert pattern in `hq-tools.ts`:
- `pipeline.started`
- `pipeline.stage_added`
- `pipeline.stage_accepted`
- `pipeline.abandoned`

Each row includes the group id and the stage title. Test: each tool writes its row exactly once, including on an idempotent retry.

### 3.3 Settle sooner

Today a finished run waits for the next one-minute cron, so each stage adds up to a minute of delay.

**Change.**
- The swarm POSTs a signed callback to the `handoff` worker when a run ends: `POST /api/swarm-settled`, signed with `SWARM_RUN_SECRET`, body `{ runId }`.
- The route settles that one run with the same code `settleRunningSwarms` uses, through a pulled-out `settleOne(runId)`.
- The cron stays as the fallback.

**Tests.** A good signature settles the run. A bad signature returns 401. A run that is already settled does nothing.

### 3.4 Upgrade the swarm to wrangler 4

Raise `swarm/package.json` to `wrangler@^4`. Run `wrangler types` again, fix any config or type drift, run the swarm tests, and deploy.

### 3.5 Keep merges authored by makemoney2023

Future merges do not use the GitHub merge button. Instead:
- Merge locally with the `GIT_AUTHOR_*` and `GIT_COMMITTER_*` vars from `.cursor/rules/ownership.mdc`.
- Push to `main`, or use squash-merge with the PR author's identity.

Add this to the ownership rule. `cda4f2b` stays as it is.

## Order and commits

Each step is one commit, authored as makemoney2023, on branch `cursor/pipeline-fixes-1b22`, with one PR to `main`.

1. 1.3 (R2 skill excerpt). The bindings change, so it goes first.
2. 1.2 (Flux multipart).
3. 2.1, 2.2, 2.3, then 3.1 and 3.2.
4. 3.3 (settle callback; touches the swarm and handoff).
5. 3.4 (wrangler 4).
6. 3.5 (rule doc).
7. Deploy `handoff` (1.1), HQ, the agent, and the swarm. Run the 2.4 smoke test.

## Verification before done

- `handoff`: `npm test`, `npx tsc --noEmit`, and lint on changed files.
- `swarm`: `npm test` and `npx tsc --noEmit`.
- The built HQ bundle is under 15MB.
- The 2.4 smoke test passes in production.
- `handoff/CHANGELOG.md` has an entry. `docs/hq-agent-spec.md` and `handoff/README.md` (deploy checklist) are updated.
