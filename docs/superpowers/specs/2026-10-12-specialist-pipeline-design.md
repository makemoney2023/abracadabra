# Specialist pipeline — design specification

**Date:** 2026-10-12
**Product:** Handoff HQ (`hq.abra-ca-dabra.app`), the HQ agent, and the swarm worker
**Status:** Proposed, implementation-ready
**Requirements:** SAP-001 through SAP-028
**Lives in:** [`handoff/`](../../../handoff/) and [`swarm/`](../../../swarm/)
**Plan:** [`docs/superpowers/plans/2026-10-12-specialist-pipeline.md`](../plans/2026-10-12-specialist-pipeline.md)

## Executive summary

A swarm pack becomes a specialist the HQ agent hires for one stage of a pipeline. The social pipeline is research, then copy, then a language pass, then visuals. Each stage is one skill. The next stage starts only after the HQ agent accepts the page from the stage before it. Research looks things up on the small model. Copy, language, and visuals are written by the same strong model the HQ agent already uses.

```text
staff ask for the social pipeline
  → HQ creates four stages on one group and starts only research
  → research specialist calls Parallel Search and returns a source table
  → checker keeps rows that have a source
  → HQ reads the table in chat and accepts it
  → copy specialist receives that table, Facts, and Do not use
  → Kimi writes 7 posts
  → checker counts the rows
  → HQ accepts, then language, then visuals
  → each accepted page is the only handoff the next specialist sees
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

- A pipeline is an ordered list of specialists on one client project.
- The social pipeline is research, copy, language, then visuals.
- Only the HQ agent advances the pipeline, and only after it accepts the current page.
- The next specialist sees the accepted page from the previous stage, the standing facts, and the voice card. It does not see a rejected draft.
- Research searches with Parallel and returns a source table. It does not write posts.
- Copy, language, and visuals are written by Kimi. Research stays on the small model.
- The assignment is short. The full skill file is not the prompt.
- The specialist checks its own page. A failed check does not count as accepted work.
- A failed required tool stops the stage. The model does not fill the gap from memory.
- Staff see the stage list and the result in HQ chat.

## Non-goals

- A specialist hiring another specialist.
- Starting the next stage because the swarm finished, with no accept.
- Running every skill in a folder.
- Showing the pipeline to the client.
- Replacing the 413 skill files.
- A general graph editor. The social pipeline is a fixed line. Any other job is one specialist, or a line the HQ agent appends one stage at a time.
- Falling through to Llama when Kimi is down for a writing stage.

## Pipeline

### Social line

| Order | Stage | Kind | Model | Reads | Returns |
| --- | --- | --- | --- | --- | --- |
| 0 | Research | `research` | small model, Parallel required | project brief, space notes, repo notes the HQ agent already put in the assignment | table: name, fact, source, unknown |
| 1 | Copy | `copy` | Kimi | accepted research table, `Facts:`, `Do not use:`, voice card when one exists | exactly 7 posts for one persona |
| 2 | Language | `language` | Kimi | accepted 7 posts, voice card | the same 7 posts with repeated lines replaced |
| 3 | Visuals | `visual` | Kimi | accepted posts, brand colors and fonts from the assignment | one image prompt and one video prompt per post |

Copy, language, and visuals still refuse to start without `Facts:` and `Do not use:` in the assignment (SAP-010).

### Other work

A job that is not the social line is a pipeline of one stage. The HQ agent may append another stage later. The new stage gets the next `stage_order`. It cannot run until the previous stage is accepted.

## Requirements

### Create the line

- **SAP-001.** `start_social_pipeline` creates one workflow group with `pipeline = 'social'` and four workflows with `stage_order` 0, 1, 2, and 3 and kinds `research`, `copy`, `language`, and `visual`.
- **SAP-002.** That call starts only stage 0. Stages 1–3 have no `next_run_at` and no execution id.
- **SAP-003.** The group is tied to the client and, when staff named one, to that project.
- **SAP-004.** A second social pipeline on the same project is refused while the first group still has a stage that is not accepted.

### Run one stage

- **SAP-005.** `run_workflow` on a stage whose previous stage is missing `accepted_at` returns status `waiting_accept` and does not call the swarm. The waiting stage id is the previous one.
- **SAP-006.** The due wake does not start a stage with `stage_order > 0`.
- **SAP-007.** `advanceWorkflowChain` still saves output and still does not start the next stage.
- **SAP-008.** One group has at most one stage with an execution in flight.

### Assignment

- **SAP-009.** The text sent to the swarm is an assignment, not the full `SKILL.md`. It contains the one job, the output shape, the skill path, at most 1,500 characters of that skill, the facts, the banned lines, the voice card, and the accepted page from the previous stage.
- **SAP-010.** Copy, language, and visuals do not call the swarm when `Facts:` or `Do not use:` is missing. Status is `source`.
- **SAP-011.** The handoff is only the previous stage's accepted deliverable. Earlier stages are not pasted again. A rejected or check-failed output is not pasted.
- **SAP-012.** A handoff longer than the room left under 7,900 characters is cut on a row boundary. The assignment says how many rows were omitted.
- **SAP-013.** After the first accepted copy stage, `revise_brief` still stores the voice card on the project. The next copy or language assignment includes that card without the HQ agent pasting it.

### Models and tools

- **SAP-014.** A research stage runs on the existing small-model chain. It must call a Parallel tool before it can finish. If Parallel is not listed, the stage ends `tool_failed` and does not answer from memory.
- **SAP-015.** Copy, language, and visual stages run on `@cf/moonshotai/kimi-k2.7-code`. If that model fails, the stage ends `model_failed`. The small-model chain is not used for those kinds.
- **SAP-016.** A writing stage does not receive web search. It receives the assignment only.
- **SAP-017.** When a tool call throws, the observation reports the failure and the stage stops. The prompt does not tell the model to answer from what it knows.

### Check, accept, and retry

- **SAP-018.** Before a stage is `completed`, a checker runs. Research drops rows with an empty source and fails when no row remains. Copy requires exactly 7 data rows and the columns platform, type, hook, body, hashtags, and CTA. Language requires the same 7 rows. Visuals require one image prompt and one video prompt for each accepted post. A banned opener on a copy or language row fails the check.
- **SAP-019.** The first failed check is sent back once as the retry note. The second failure stores status `check_failed`, the checker errors in `last_receipt`, and the draft in `last_output`. `accepted_at` stays null. The next stage cannot start.
- **SAP-020.** `accept_workflow` sets `accepted_at` only when `last_status` is `completed`. It refuses `check_failed`, `tool_failed`, `model_failed`, and `source`.
- **SAP-021.** Accepting a stage does not start the next stage. The HQ agent calls `run_workflow` on the next stage after accept.
- **SAP-022.** Rerunning a stage clears that stage's `accepted_at`, `last_output`, and `last_receipt`. Every later stage in the group loses `accepted_at` and is marked `stale`. A stale stage cannot run until the rerun is accepted and the HQ agent runs it again.

### What staff see

- **SAP-023.** `pipeline_status` returns each stage in order: name, kind, `stage_order`, status, whether it is accepted, the receipt, and the deliverable text when the stage has finished a check.
- **SAP-024.** The receipt lists tools called, checker errors, and missing facts. The deliverable text is the page. The space file under `agent/swarm/` remains the archive.
- **SAP-025.** The chat playbook tells the HQ agent to create the social line, start research only, call `pipeline_status` when staff ask for the result, accept only a `completed` page, and run the next stage only after accept. A thin page is rewritten into the brief. That pack is not run again for the same batch.
- **SAP-026.** The approval card for `accept_workflow` is the staff accept. Notes in chat are not an accept.

### Record

- **SAP-027.** A stage still writes `swarm_runs` and `agent.swarm_run` as it does today.
- **SAP-028.** `last_output` on an accepted stage is the deliverable the next assignment quotes. The receipt is `last_receipt` and is not pasted into the next assignment.

## Data model

Migration `0022_specialist_pipeline.sql`.

```sql
ALTER TABLE workflow_groups ADD COLUMN pipeline TEXT;
ALTER TABLE client_workflows ADD COLUMN stage_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_workflows ADD COLUMN kind TEXT;
ALTER TABLE client_workflows ADD COLUMN accepted_at INTEGER;
ALTER TABLE client_workflows ADD COLUMN last_receipt TEXT;
```

`pipeline` is `social` or null. `kind` is `research`, `copy`, `language`, `visual`, or `skill`. `accepted_at` is unix milliseconds. `last_receipt` is JSON:

```json
{
  "tools": [{ "server": "portal", "tool": "parallel_search" }],
  "check": { "ok": false, "errors": ["row 2 has no source"] },
  "missing": ["Parallel did not answer"]
}
```

Existing groups keep working. Their `stage_order` is 0, `pipeline` is null, and `accepted_at` stays null until this spec's accept path is used. A one-skill run that is not in a social pipeline can still be accepted. Until it is accepted, a later stage in that same group waits.

## Checker

Pure functions. No network.

| Kind | Pass | Fail |
| --- | --- | --- |
| research | At least one row with name, fact, and source. Source is a URL or a named document from the assignment. | No rows left after empty sources are dropped. A post column or a 90-day plan. |
| copy | Exactly 7 rows. Each row has platform, type, hook, body, hashtags, CTA. No row opens with Transform your, Real smiles, Unlock, Discover the secret, or Ready to. | Any other count. A missing column. A banned opener. |
| language | Exactly 7 rows with the same shape. | A new row, a dropped row, a banned opener. |
| visual | For each post in the accepted handoff, one image prompt and one video prompt. | A missing pair. The words "placeholder model". |
| skill | The page is non-empty and does not contain a 90-day calendar heading. | Empty page. |

The checker does not call a model.

## Assignment shape

```text
Job: Write 7 posts for one persona.
Skill: .cursor/skills/community/marketingskills/copywriting/SKILL.md
Shape: Return exactly 7 rows. Columns: platform, type, hook, body, hashtags, CTA.

Facts:
- ...

Do not use:
- ...

Voice:
- ...

Accepted research:
| name | fact | source | unknown |
| ... |
```

The skill excerpt, when present, sits under `Skill notes:` and stops at 1,500 characters. The full file stays in R2.

## Chat flow

1. Staff ask for social posts for a client project.
2. The HQ agent calls `start_social_pipeline` with that project and the brief.
3. The tool result lists the four stages and the research execution id.
4. Staff ask how it is going, or the agent calls `pipeline_status` on the next turn.
5. When research is `completed`, the agent shows the table and asks to accept.
6. Staff approve the card. `accept_workflow` sets `accepted_at`.
7. The agent calls `run_workflow` on the copy stage. The assignment includes the accepted table.
8. The same accept-then-run step repeats for language and visuals.
9. A `check_failed` or `tool_failed` stage is shown with the receipt. The agent does not accept it. Staff can fix the brief and run that same stage again.

## Edge cases

| Case | Result |
| --- | --- |
| Copy stage started with no `Facts:` | `source`. Swarm is not called. |
| Research finishes with zero sourced rows | `check_failed` after one retry. Copy stays waiting. |
| HQ calls `run_workflow` on visuals while copy is unaccepted | `waiting_accept`. Visuals do not start. |
| Kimi errors on copy | `model_failed`. Llama is not tried. |
| Parallel is down | `tool_failed`. No invented competitors. |
| Staff rerun research after visuals were accepted | Research `accepted_at` clears. Copy, language, and visuals become `stale`. |
| Two social pipelines on one project | The second `start_social_pipeline` is refused. |
| A headline skill, not the social line | One stage, kind `skill`. No research table is required. Accept still gates any stage added after it. |
| Old groups from before this migration | `stage_order` 0. The due wake can still run that single workflow. |

## Files

| Path | Change |
| --- | --- |
| `handoff/migrations/0022_specialist_pipeline.sql` | New columns |
| `handoff/src/db/migration-sql.ts`, `handoff/src/db/migrate.ts` | Embed and apply the step |
| `handoff/src/lib/specialist-assignment.ts` | Build the short assignment and clip on a row boundary |
| `handoff/src/lib/client-workflows.ts` | Accept gate, social line, stale later stages, handoff is the previous accepted page |
| `handoff/src/lib/hq-tools.ts` | `start_social_pipeline`, `accept_workflow`, `pipeline_status` |
| `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts` | Staff-facing instructions |
| `swarm/src/ai/check.ts` | Checker |
| `swarm/src/ai/agents.ts` | Kind picks the model. Tool failure stops the stage. |
| `swarm/src/do/WorkflowDO.ts` | Run the checker, one retry, store the receipt on the execution |
| `handoff/src/lib/workflow-files.ts` | Archive the deliverable as it does today |

The swarm execution response gains `kind`, `receipt`, and `status` of `completed`, `check_failed`, `tool_failed`, or `model_failed`. Handoff copies `receipt` into `last_receipt` when it settles the run.

## Verification

- Unit tests for the checker, the assignment builder, the accept gate, stale later stages, and the social line creating four stages and starting one.
- Swarm tests for model choice and for a thrown tool ending the stage.
- Agent typecheck (`tsconfig.agent.json`) and eslint on the touched TypeScript files.
- A manual pass on a new HQ chat: start the social line, accept research, confirm copy's assignment contains that table and does not contain a rejected draft.

## Deferred

- Pushing a chat message the moment a stage finishes. Until then, staff ask, and `pipeline_status` answers.
- A second copy batch in the same social line. After the first 7 are accepted, the HQ agent may append another copy stage. Language then reads every accepted copy page since research. That append is a follow-up, not part of `start_social_pipeline`.
- Client-visible status of the pipeline.
