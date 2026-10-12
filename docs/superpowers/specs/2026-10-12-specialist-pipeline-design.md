# Specialist pipeline — design specification

**Date:** 2026-10-12
**Product:** Handoff HQ (`hq.abra-ca-dabra.app`), the HQ agent, and the swarm worker
**Status:** Proposed, implementation-ready
**Requirements:** SAP-001 through SAP-038
**Lives in:** [`handoff/`](../../../handoff/) and [`swarm/`](../../../swarm/)
**Plan:** [`docs/superpowers/plans/2026-10-12-specialist-pipeline.md`](../plans/2026-10-12-specialist-pipeline.md)

## Executive summary

Every skill in the catalog is a specialist the HQ agent can hire. A pipeline is those specialists in the order the job needs. Posts are one pipeline. An audit, a call plan, a headline, a homepage, and any other skill are pipelines too. One job is a pipeline of one stage. A job with several skills is several stages. The next stage starts only after the HQ agent accepts the page from the stage before it.

Research and every deliverable are written by Llama 3.3 70B. The HQ agent stays on Kimi K2.7 Code, because that model is the manager that calls tools and chooses the next stage. It does not write the specialist page.

```text
staff name the work
  → HQ looks up the skill, or the skills, for that job
  → HQ creates one stage per skill and starts only the first
  → that specialist returns the page that skill defines
  → HQ accepts it
  → the next specialist receives that accepted page and does its own job
  → a headline stays a headline
  → an audit stays an audit
  → posts stay posts
```

A rejected draft stays on that stage. It is not source material for the next specialist.

## Current state

Checked against the code on 2026-10-12.

- Each skill is already one swarm template with no edges (`packTemplatesFromCatalog` in `handoff/src/lib/pack-templates.ts`). Template ids look like `skill-community-marketingskills-copywriting`.
- The due wake runs only the first workflow in a group. `advanceWorkflowChain` saves `last_output` and does not start the next workflow (`handoff/src/lib/client-workflows.ts`).
- A later `run_workflow` still receives every earlier completed output, clipped into a 7,900 character brief (`priorChainText`, `fitSwarmBrief`, `SWARM_INPUT_LIMIT`). "Completed" means the swarm finished. Nobody has to accept it.
- Chain order is "name or template contains research, then oldest." There is no stage number.
- Copy, visuals, and the language pass refuse to start unless the brief contains `Facts:` and `Do not use:` (`needsSourcePacket`, `sourcePacketReady`).
- The swarm loads up to 24,000 characters of `SKILL.md` from R2 and asks `@cf/meta/llama-3.1-8b-instruct-fp8`, then `@cf/zai-org/glm-4.7-flash`, then `@cf/meta/llama-3.2-3b-instruct` (`swarm/src/ai/agents.ts`, `swarm/src/ai/skills.ts`).
- The HQ agent itself uses `@cf/moonshotai/kimi-k2.7-code` (`handoff/src/agent/hq-chat.ts`).
- Research workflows whose name contains "research" are limited to Parallel tools (`swarm/src/mcp/research-tools.ts`). Other skills get whatever MCP servers are stored on the workflow, often none.
- The tool loop allows four rounds. When a tool throws, the observation says to answer from what the model knows (`runToolLoop` in `swarm/src/ai/agents.ts`).
- The chat playbook tells the HQ agent to read `agent/swarm/` files after a run, rewrite a thin batch into the brief, and call `run_workflow` itself for the next skill (`handoff/src/lib/hq-chat-playbook.ts`).
- `revise_brief` can store voice, banned lines, quotes, and two example posts on the project. The next swarm does not receive that card unless the HQ agent pastes it into `body`.

## Goals

- Every catalog skill can be a stage. The catalog is the 413 single-skill templates already published.
- A pipeline is an ordered list of those specialists on one client project. The HQ agent names the list for the job.
- Posts are the preset research, copy, language, then visuals. They are not the only pipeline.
- Only the HQ agent advances the pipeline, and only after it accepts the current page.
- The next specialist sees the accepted page from the previous stage, plus the facts and voice card when that job uses them. It does not see a rejected draft.
- The specialist returns only what its skill defines. A headline skill does not return posts. An audit does not return a calendar.
- Research calls Parallel with native function calling and returns a JSON source table. Every specialist page, including research, is written by Llama 3.3 70B. The HQ agent stays on Kimi K2.7 Code.
- The assignment is short. The full skill file is not the prompt.
- The specialist checks its own page. A failed check does not count as accepted work.
- A failed required tool stops the stage. The model does not fill the gap from memory.
- Staff see the stage list and the result in HQ chat.

## Non-goals

- A specialist hiring another specialist.
- Starting the next stage because the swarm finished, with no accept.
- Running every skill in a folder in alphabetical order.
- Showing the pipeline to the client.
- Replacing the 413 skill files.
- A general graph editor. The HQ agent submits an ordered list. Stages do not branch.
- Falling through to Llama 3.1 8B or Llama 3.2 3B when Llama 3.3 70B is down.
- Generating the image or video file. A visual stage returns the prompts. A later job can render them.

## Pipeline

`start_pipeline` takes the ordered skill paths for the job. Each path becomes one stage. `stage_order` is the list order. `kind` comes from `deliverableKind` on that skill. The first stage starts. The rest wait for accept.

### Any job

| Job staff ask for | Stages, in order | What the last page is |
| --- | --- | --- |
| One headline | headline skill | a headline |
| Call prep | call-prep skill | a call plan |
| SEO audit | research, then the SEO audit skill | an audit |
| A homepage | research, then a page skill whose kind is `skill` | the page that skill defines |
| Social posts | research, copy, language, visuals | prompts for the accepted posts |

The social list is a preset the HQ agent may pass when the work is posts. It is the same `start_pipeline` call as every other job.

| Order | Stage | Kind | Model | Reads | Returns |
| --- | --- | --- | --- | --- | --- |
| 0 | Research | `research` | Llama 3.3 70B, Parallel required | project brief and the notes in the assignment | JSON rows: name, fact, source, unknown |
| 1 | Copy | `copy` | Llama 3.3 70B | accepted research table, `Facts:`, `Do not use:`, voice card when one exists | JSON of exactly 7 posts for one persona |
| 2 | Language | `language` | Llama 3.3 70B | accepted 7 posts, voice card | JSON of the same 7 posts with repeated lines replaced |
| 3 | Visuals | `visual` | Llama 3.3 70B | accepted posts, brand colors and fonts from the assignment | JSON with one image prompt and one video prompt per post |

Copy, language, and visuals still refuse to start without `Facts:` and `Do not use:` in the assignment (SAP-010). A `skill` stage does not need that packet. It needs the brief and the accepted page from the stage before it, when there is one.

The HQ agent may append another stage later. The new stage gets the next `stage_order`. It cannot run until the previous stage is accepted.

## Requirements

### Create the line

- **SAP-001.** `start_pipeline` creates one workflow group and one workflow per skill path, in the order given. `stage_order` is 0, 1, 2, and so on. `kind` is `deliverableKind` for that skill. `pipeline` stores the label the HQ agent passes, such as `social`, `audit`, or `call-prep`.
- **SAP-002.** That call starts only stage 0. Later stages have no `next_run_at` and no execution id.
- **SAP-003.** The group is tied to the client and, when staff named one, to that project.
- **SAP-004.** A second `start_pipeline` on the same project is refused while that project's group is unfinished. A group is unfinished when a stage is running, when the latest stage is `completed` and not accepted, or when any stage is `check_failed`, `tool_failed`, `model_failed`, `source`, or `stale`.
- **SAP-029.** Any catalog skill path can be a stage. A one-skill job is a pipeline of one stage. The social preset is four paths, in this order: `.cursor/skills/plugins/parallel/parallel-web-search/SKILL.md`, `.cursor/skills/community/marketingskills/copywriting/SKILL.md`, `.cursor/skills/community/advertising-skills/skills/qa/generic-language-killer/SKILL.md`, `.cursor/skills/community/visual-skills/image/SKILL.md`. The image skill's shape still asks for one image prompt and one video prompt. The video skill is a separate stage when staff ask for video only.
- **SAP-031.** `abandon_pipeline` marks every unfinished stage `stale` and closes the group. Accepted pages stay. A new `start_pipeline` is then allowed.
- **SAP-032.** `append_pipeline_stage` adds one skill at the end of the unfinished group and does not start it. `start_pipeline` creates a new group. It does not append.

### Run one stage

- **SAP-005.** `run_workflow` on a stage whose previous stage is missing `accepted_at` returns status `waiting_accept` and does not call the swarm. The waiting stage id is the previous one.
- **SAP-006.** The due wake does not start a stage with `stage_order > 0`.
- **SAP-007.** `advanceWorkflowChain` still saves output and still does not start the next stage.
- **SAP-008.** One group has at most one stage with an execution in flight. A second `run_workflow` while that stage is running returns `running` and does not call the swarm.

### Assignment

- **SAP-009.** The text sent to the swarm is an assignment, not the full `SKILL.md`. It contains the one job, the output shape for that skill, the skill path, and at most 1,500 characters of that skill. Copy, language, and visuals also include the facts, the banned lines, and the voice card. A later stage includes the accepted page from the previous stage. A one-skill job has no previous page.
- **SAP-010.** Copy, language, and visuals do not call the swarm when `Facts:` or `Do not use:` is missing. Status is `source`.
- **SAP-011.** The handoff is only the previous stage's accepted deliverable. Earlier stages are not pasted again. A rejected or check-failed output is not pasted.
- **SAP-012.** The assignment is at most 24,000 characters. The skill excerpt stays at most 1,500. A handoff that does not fit is cut after a whole JSON element. The assignment says how many elements were omitted. The old 7,900 character swarm brief limit does not apply to a stage that has a `kind`.
- **SAP-013.** The voice card is the latest `revise_brief` body for that client that contains `Voice:`. The next copy or language assignment includes that body. An empty card is omitted.

### Models and tools

- **SAP-014.** A research stage runs on `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Handoff sends `kind: "research"` on the execute request. The swarm attaches Parallel from that kind. The workflow name does not decide it. Parallel is passed as a Workers AI function-calling tool, and the swarm runs the MCP call when the model returns a tool call. A printed tool-call block is not a tool call. If Parallel is not listed, or the call throws, the stage ends `tool_failed` and does not answer from memory.
- **SAP-015.** Every specialist, including research, copy, language, visuals, and every other skill, uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast` first. If the model call throws, the stage retries once on `@cf/zai-org/glm-4.7-flash`. If the retry throws, the stage ends `model_failed`. Bad JSON is a check failure, not a model failure. `@cf/meta/llama-3.1-8b-instruct-fp8` and `@cf/meta/llama-3.2-3b-instruct` are not in this path. The HQ agent stays on `@cf/moonshotai/kimi-k2.7-code`. A workflow with no `kind` uses these same models and skips the JSON checker, so an older lead run still returns text.
- **SAP-016.** A stage that is not research does not receive web search. It receives the assignment and the accepted page from the previous stage. Research is the stage that searches.
- **SAP-017.** When a tool call throws, the stage stops with `tool_failed`. The prompt does not tell the model to answer from what it knows.
- **SAP-030.** The specialist returns JSON for its kind. The checker reads that JSON. A page that is not JSON fails the check. The archive file may render the same JSON as a readable page.

### Check, accept, and retry

- **SAP-018.** Before a stage with a `kind` is `completed`, a checker runs on the JSON. One leading ` ```json ` fence is removed before parsing. Research drops rows with an empty source and fails when no row remains. Copy requires exactly 7 objects and the fields platform, type, hook, body, hashtags, and CTA. Language requires the same 7 objects. Visuals require one image prompt and one video prompt for each accepted post. A banned opener on a copy or language row fails the check. A `skill` stage passes when the JSON is non-empty and is not a 7-post array or a 90-day calendar. It fails when the JSON is empty, when it is a 90-day calendar, or when it is a 7-post array and the skill is not copy or language. The skill's shape string is included in the assignment. The checker does not invent fields the skill did not name.
- **SAP-019.** The first failed check is sent back once as the retry note. The second failure stores status `check_failed`, the checker errors in `last_receipt`, and the draft in `last_output`. `accepted_at` stays null. The next stage cannot start.
- **SAP-020.** `accept_workflow` sets `accepted_at` only when `last_status` is `completed`. It refuses `check_failed`, `tool_failed`, `model_failed`, and `source`.
- **SAP-021.** Accepting a stage does not start the next stage. The HQ agent calls `run_workflow` on the next stage after accept.
- **SAP-022.** Rerunning a stage clears that stage's `accepted_at`, `last_output`, and `last_receipt`. Every later stage in the group loses `accepted_at` and is marked `stale`. A stale stage cannot run until the rerun is accepted and the HQ agent runs it again.

### What staff see

- **SAP-023.** `pipeline_status` returns each stage in order: name, kind, `stage_order`, status, whether it is accepted, the receipt, and the deliverable text when the stage has finished a check.
- **SAP-024.** The receipt lists tools called, checker errors, and missing facts. The deliverable text is the page. The space file under `agent/swarm/` remains the archive.
- **SAP-025.** The chat playbook tells the HQ agent to look up the skill for the job with `list_swarm_packs`, then call `start_pipeline` with those paths in order. Posts use the four paths in SAP-029. Every other job uses the skill or skills that job names. The first stage is the only one that starts. Chat calls `pipeline_status` when staff ask for the result, accepts only a `completed` page, and runs the next stage only after accept. A thin page is rewritten into the brief. That skill is not run again for the same page. A specialist does not turn its page into another skill's job. `queue_followup_swarms` does not start a swarm. Adding a stage uses `append_pipeline_stage`.
- **SAP-026.** The approval card for `accept_workflow` is the staff accept. Notes in chat are not an accept.

### Record

- **SAP-027.** A stage still writes `swarm_runs` and `agent.swarm_run` as it does today.
- **SAP-028.** `last_output` on an accepted stage is the deliverable the next assignment quotes. The receipt is `last_receipt` and is not pasted into the next assignment.
- **SAP-033.** `settleRunningSwarms` stores `completed`, `check_failed`, `tool_failed`, and `model_failed` on the workflow. It copies the receipt into `last_receipt`. Any other swarm status stays `running`. `readSwarmRun` returns the receipt and those statuses.
- **SAP-034.** `accept_workflow` and `abandon_pipeline` wait for the approval card. `start_pipeline`, `append_pipeline_stage`, `pipeline_status`, and `run_workflow` do not.
- **SAP-035.** `start_pipeline` stores the staff user id on `workflow_groups.started_by`. When `settleRunningSwarms` moves a stage off `running`, it tells that user's HQ chat. The notice names the stage and the status. A `completed` notice asks staff to accept. A failed notice includes the checker or tool error. The chat message is sent through the HQ agent with `AGENT_WAKE_SECRET`. If that call fails, the workflow row is still saved.
- **SAP-036.** A skill file may contain one fenced JSON schema under the heading `Output schema`. The checker uses that schema's required keys when the fence is present. A missing fence uses the kind rules. The four social preset skills get an `Output schema` fence in this build. The other skill files are not rewritten.
- **SAP-037.** `swarm/src/ai/golden/` holds one passing JSON page per kind: research, copy, language, visual, and skill. The checker tests accept each file and reject a broken copy of it. These pages are not pasted into a live assignment.
- **SAP-038.** Accepting a visual stage renders each `imagePrompt` with `@cf/black-forest-labs/flux-2-klein-9b` and stores the PNG in the client space next to the visual page. At most 7 images. A failed render is noted on the receipt and does not clear `accepted_at`. Video prompts stay text. This catalog has no video model.

## Data model

Migration `0022_specialist_pipeline.sql`.

```sql
ALTER TABLE workflow_groups ADD COLUMN pipeline TEXT;
ALTER TABLE workflow_groups ADD COLUMN started_by TEXT;
ALTER TABLE client_workflows ADD COLUMN stage_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_workflows ADD COLUMN kind TEXT;
ALTER TABLE client_workflows ADD COLUMN accepted_at INTEGER;
ALTER TABLE client_workflows ADD COLUMN last_receipt TEXT;
```

`pipeline` is a short label such as `social`, `audit`, or `call-prep`, or null. `kind` is `research`, `copy`, `language`, `visual`, or `skill`. `skill` is every catalog job that is not one of the other four. `accepted_at` is unix milliseconds. `last_receipt` is JSON:

```json
{
  "tools": [{ "server": "portal", "tool": "parallel_search" }],
  "check": { "ok": false, "errors": ["row 2 has no source"] },
  "missing": ["Parallel did not answer"]
}
```

Existing groups keep working. Their `stage_order` is 0, `pipeline` is null, and `accepted_at` stays null until this spec's accept path is used. A one-skill pipeline is accepted the same way as a longer one. Until a stage is accepted, the next stage in that group waits.

## Checker

Pure functions. No network.

| Kind | Pass | Fail |
| --- | --- | --- |
| research | JSON array. At least one object with name, fact, and source. Source is a URL or a named document from the assignment. | Not JSON. No rows left after empty sources are dropped. A post field or a 90-day plan. |
| copy | JSON array of exactly 7 objects. Each object has platform, type, hook, body, hashtags, CTA. No hook or body opens with Transform your, Real smiles, Unlock, Discover the secret, or Ready to. | Any other count. A missing field. A banned opener. |
| language | JSON array of exactly 7 objects with the same fields. | A new object, a dropped object, a banned opener. |
| visual | JSON array. For each post in the accepted handoff, one imagePrompt and one videoPrompt. | A missing pair. The words "placeholder model". |
| skill | JSON that is non-empty and is not a 7-post array or a 90-day calendar. | Not JSON. Empty page. A 90-day calendar. A 7-post array when this skill is not copy or language. |

The checker does not call a model.

## Assignment shape

```text
Job: Audit the client's site.
Skill: .cursor/skills/community/marketingskills/seo-audit/SKILL.md
Shape: Return only what this skill defines.

Accepted research:
| name | fact | source | unknown |
| ... |
```

A post stage uses the same frame with `Facts:`, `Do not use:`, `Voice:`, and the 7-row shape. A one-stage headline omits the accepted-page block because there is no previous stage.

The skill excerpt, when present, sits under `Skill notes:` and stops at 1,500 characters. The full file stays in R2. The assignment ends with the JSON shape the specialist must return. The checker reads that JSON.

## Chat flow

1. Staff name the work and the project. The work might be posts, an audit, a call plan, a headline, or another skill.
2. The HQ agent calls `list_swarm_packs` with the job as the query, then `start_pipeline` with those skill paths in order. Posts use the four-stage preset. A headline is one path. An audit is research, then the audit skill.
3. The tool result lists the stages and the first execution id.
4. When the stage finishes, the staff chat receives a notice. Staff can also call `pipeline_status`.
5. When the stage is `completed`, the agent shows that skill's page and asks to accept.
6. Staff approve the card. `accept_workflow` sets `accepted_at`.
7. If another stage is waiting, the agent calls `run_workflow` on it. The assignment includes the accepted page.
8. The same accept-then-run step repeats until the line is done.
9. A `check_failed` or `tool_failed` stage is shown with the receipt. The agent does not accept it. Staff can fix the brief and run that same stage again.

## Edge cases

| Case | Result |
| --- | --- |
| Copy stage started with no `Facts:` | `source`. Swarm is not called. |
| Research finishes with zero sourced rows | `check_failed` after one retry. Copy stays waiting. |
| HQ calls `run_workflow` on a later stage while the previous page is unaccepted | `waiting_accept`. That stage does not start. |
| Llama 3.3 70B errors on an audit, a headline, a research table, or a post | One retry on GLM 4.7 Flash. A second failure is `model_failed`. The 8B and 3B models are not tried. |
| Parallel is down | `tool_failed`. The research stage does not invent sources. |
| Staff rerun an early stage after a later stage was accepted | The rerun clears `accepted_at`. Every later stage becomes `stale`. |
| A second pipeline while the open group is unfinished | `start_pipeline` is refused. `abandon_pipeline` closes it. |
| Staff add a skill onto the open group | `append_pipeline_stage` adds it and does not start it. |
| A workflow with no `kind` | Llama 3.3 70B, then GLM 4.7 Flash. No JSON checker. Text is saved as it is today. |
| The model wraps JSON in a fence | The checker strips one leading ` ```json ` fence, then parses. |
| The model returns bad JSON and the call itself succeeded | Check retry. The model is not swapped. |
| A headline skill | One stage, kind `skill`. The page is a headline. Accept still gates any stage added after it. |
| Research, then an SEO audit | Two stages. The audit assignment contains the accepted source table. The audit page is not 7 posts. |
| Old groups from before this migration | `stage_order` 0. The due wake can still run that single workflow. |

## Files

| Path | Change |
| --- | --- |
| `handoff/migrations/0022_specialist_pipeline.sql` | New columns |
| `handoff/src/db/migration-sql.ts`, `handoff/src/db/migrate.ts` | Embed and apply the step |
| `handoff/src/lib/specialist-assignment.ts` | Build the short assignment and clip on a row boundary |
| `handoff/src/lib/client-workflows.ts` | Accept gate, any ordered line, stale later stages, settle copies the receipt, handoff is the previous accepted page |
| `handoff/src/lib/hq-tools.ts` | `start_pipeline`, `append_pipeline_stage`, `abandon_pipeline`, `accept_workflow`, `pipeline_status` |
| `handoff/src/lib/hq-tool-names.ts` | Tool text and the approval set |
| `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts` | Staff-facing instructions |
| `handoff/src/lib/lead-swarm.ts` | `readSwarmRun` returns receipt and the new statuses |
| `handoff/src/agent/worker.ts` | `POST` notice into the staff HQ chat |
| `swarm/src/ai/golden/` | One passing JSON page per kind |
| `.cursor/skills/.../SKILL.md` | `Output schema` fence on the four social preset skills |
| `swarm/src/ai/check.ts` | Checker |
| `swarm/src/ai/agents.ts` | Llama 3.3 70B, one GLM 4.7 Flash retry, native function calling, tool failure stops the stage. |
| `swarm/src/do/WorkflowDO.ts` | Run the checker, one retry, store the receipt on the execution |
| `handoff/src/lib/workflow-files.ts` | Archive the deliverable as it does today |

The swarm execution response gains `kind`, `receipt`, and `status` of `completed`, `check_failed`, `tool_failed`, or `model_failed`. Handoff copies `receipt` into `last_receipt` when it settles the run.

## Verification

- Unit tests for the checker, the assignment builder, the accept gate, stale later stages, a one-skill pipeline, a research-then-audit pipeline, and the social preset creating four stages and starting one.
- Swarm tests for model choice and for a thrown tool ending the stage.
- Agent typecheck (`tsconfig.agent.json`) and eslint on the touched TypeScript files.
- A manual pass on a new HQ chat: start a one-skill job and a two-skill job. Accept the first page. Confirm the second assignment contains that page, does the second skill's job, and does not contain a rejected draft.

## Deferred

- A second copy batch on a social line. `append_pipeline_stage` can add one, and the first build still hands the next stage only the previous accepted page.
- Client-visible status of the pipeline.
- A video file for each `videoPrompt`. Workers AI in this catalog has image models and no video model.
