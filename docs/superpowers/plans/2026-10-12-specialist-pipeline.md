# Specialist pipeline implementation plan

> **For agentic workers:** Implement task-by-task. Write the failing test first. Do not start the next task while the current test is red.

**Goal:** Every catalog skill is a specialist the HQ agent can run. A pipeline is any ordered list of those skills. Posts are one preset. The next stage starts only after the HQ agent accepts the previous page, and it receives only that accepted page.

**Architecture:** Handoff owns the line: stage order, the short assignment, the accept flag, and the chat tools. The swarm owns the run: Llama 3.3 70B for every specialist, one GLM 4.7 Flash retry, native function calling for research, and a JSON checker. The HQ agent stays on Kimi K2.7 Code. A finished swarm still does not start the next stage.

**Tech stack:** Next.js 16, Vitest, D1 migrations applied in memory by `migrate`, the swarm worker on Workers AI.

**Design:** [`docs/superpowers/specs/2026-10-12-specialist-pipeline-design.md`](../specs/2026-10-12-specialist-pipeline-design.md). Requirements SAP-001 through SAP-034.

---

## Repository boundary

Work is in [`handoff/`](../../../handoff/) and [`swarm/`](../../../swarm/). Do not add a secret. Kimi is already on the Workers AI binding. Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>` with `GIT_AUTHOR_*` and `GIT_COMMITTER_*` on the commit command. Do not change git config.

## File structure

| Path | Responsibility |
| --- | --- |
| `swarm/src/ai/check.ts` | Pure checker for the five kinds |
| `swarm/src/ai/check.test.ts` | Pass and fail rows |
| `swarm/src/ai/agents.ts` | Llama 3.3 70B, one GLM 4.7 Flash retry, native function calling, tool failure stops the stage. |
| `swarm/src/ai/agents.test.ts` | Model id and the failure observation |
| `swarm/src/do/WorkflowDO.ts` | One retry, then `check_failed` or `completed`, receipt on the execution |
| `handoff/migrations/0022_specialist_pipeline.sql` | `pipeline`, `stage_order`, `kind`, `accepted_at`, `last_receipt` |
| `handoff/src/db/migrate.ts`, `handoff/src/db/migration-sql.ts` | Apply the step |
| `handoff/src/lib/specialist-assignment.ts` | Short assignment and row-boundary clip |
| `handoff/src/lib/specialist-assignment.test.ts` | Assignment contents |
| `handoff/src/lib/client-workflows.ts` | Accept gate, settle copies the receipt, stale later stages, previous accepted page only |
| `handoff/src/lib/lead-swarm.ts` | `readSwarmRun` returns the receipt and the new statuses |
| `handoff/src/lib/client-workflows.test.ts` | Those gates |
| `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts` | `start_pipeline`, `append_pipeline_stage`, `abandon_pipeline`, `accept_workflow`, `pipeline_status`. Accept and abandon wait for the approval card. |
| `handoff/src/lib/hq-tools.test.ts` | Tool results |
| `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts` | Pipeline instructions |
| `handoff/src/lib/hq-chat-playbook.test.ts` | The new sentences |
| `handoff/CHANGELOG.md`, `docs/hq-agent-spec.md` | Behavior once the tasks ship |

## Global constraints

- Status values added here: `waiting_accept`, `check_failed`, `tool_failed`, `model_failed`, `stale`. Existing `source`, `completed`, `queued`, and `failed` stay.
- `accepted_at` is the only flag that unlocks the next stage.
- Every specialist uses Llama 3.3 70B, then one GLM 4.7 Flash retry. The 8B and 3B models are not used. The HQ agent stays on Kimi K2.7 Code.
- The full `SKILL.md` is not the assignment.
- Do not let a specialist create or run the next stage.

---

### Task 1: Checker

**Files:**
- Create: `swarm/src/ai/check.ts`
- Test: `swarm/src/ai/check.test.ts`

- [ ] **Step 1: Write the failing test**

Cover SAP-018 and SAP-030. Inputs are JSON, not markdown. A string wrapped in one ` ```json ` fence is parsed after the fence is removed.

- A research array with two sourced objects and one empty source returns the two objects and `ok: true`.
- A research array whose sources are all empty returns `ok: false`.
- A research string that is not JSON fails.
- Copy with 7 complete objects passes. Copy with 6 objects fails. A hook that opens with `Unlock` fails.
- Language with 7 objects passes. Language with 8 objects fails.
- Visuals with one `imagePrompt` and one `videoPrompt` per post pass. A missing video prompt fails. The words `placeholder model` fail.
- An empty skill object fails. A call-plan object whose keys match that skill's shape passes. A 7-post array fails when the kind is `skill`.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd swarm && npx vitest run src/ai/check.test.ts
```

- [ ] **Step 3: Implement `checkSpecialist(kind, json, handoff, shape)`**

`shape` is the field list for a `skill` stage. Return `{ ok, errors, page }`. Research `page` is the array after empty sources are dropped. Other kinds return the original JSON when `ok` is true.

- [ ] **Step 4: Re-run the test**

Expected: pass.

### Task 2: Tool failure stops the stage

**Files:**
- Modify: `swarm/src/ai/agents.ts`
- Test: `swarm/src/ai/agents.test.ts`

- [ ] **Step 1: Write the failing test**

SAP-014 and SAP-017. Research calls Parallel through the Workers AI tools argument. A model reply that only prints a tool-call block does not count as a call. A thrown tool, or a research run with no Parallel tool, returns `tool_failed` and does not ask the model for a final answer. The result does not contain "what you know".

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd swarm && npx vitest run src/ai/agents.test.ts
```

- [ ] **Step 3: Implement**

Pass Parallel as a function-calling tool on the Llama 3.3 70B request. Stop parsing printed tool-call blocks for research. When a required tool is missing or a call throws, return `{ output, toolsUsed, status: "tool_failed" }` without another model call.

- [ ] **Step 4: Re-run the test**

Expected: pass.

### Task 3: Specialist model

**Files:**
- Modify: `swarm/src/ai/agents.ts`
- Test: `swarm/src/ai/agents.test.ts`

- [ ] **Step 1: Write the failing test**

SAP-015. `specialistModels()` is `["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/zai-org/glm-4.7-flash"]` for every kind, including research. A thrown call uses the second model once. A second throw is `model_failed`. Bad JSON does not change the model. The list does not contain `llama-3.1-8b-instruct-fp8` or `llama-3.2-3b-instruct`. The HQ chat model stays `@cf/moonshotai/kimi-k2.7-code`. A workflow with no `kind` uses these models and skips the checker.

- [ ] **Step 2: Run the test and confirm it fails**
- [ ] **Step 3: Implement `modelsForKind` and use it in `runOnceChain`**
- [ ] **Step 4: Re-run the test**

### Task 4: Checker on the execution

**Files:**
- Modify: `swarm/src/do/WorkflowDO.ts`
- Test: `swarm/src/ai/check.ts` already covers the rules. Add `swarm/src/do/settle-specialist.ts` if the DO method is hard to call, and test that helper.

- [ ] **Step 1: Write the failing test**

SAP-019. `settleSpecialist({ kind, draft, handoff, attempt })` on a bad copy draft with `attempt === 1` returns `{ action: "retry", note }`. The same draft with `attempt === 2` returns `{ action: "check_failed", receipt, page }`. A good draft returns `{ action: "completed", page }`.

- [ ] **Step 2: Run the test and confirm it fails**
- [ ] **Step 3: Call the helper from the node finish path in `WorkflowDO`**

One retry uses the checker errors as the next user message. The execution status stored for handoff is `completed` or `check_failed`. The receipt JSON is stored on the execution object.

- [ ] **Step 4: Re-run the test**

### Task 5: Columns

**Files:**
- Create: `handoff/migrations/0022_specialist_pipeline.sql`
- Modify: `handoff/src/db/migration-sql.ts`
- Modify: `handoff/src/db/migrate.ts`
- Test: `handoff/src/db/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

After `migrate`, `workflow_groups.pipeline` and `client_workflows.accepted_at` exist. A second `migrate` does not throw.

- [ ] **Step 2: Run `npx vitest run src/db/migrate.test.ts` from `handoff/` and confirm it fails**
- [ ] **Step 3: Add the SQL from the design and the step `{ file: "0022_specialist_pipeline.sql", column: { table: "client_workflows", name: "accepted_at" } }`**
- [ ] **Step 4: Re-run the test**

### Task 6: Assignment builder

**Files:**
- Create: `handoff/src/lib/specialist-assignment.ts`
- Test: `handoff/src/lib/specialist-assignment.test.ts`

- [ ] **Step 1: Write the failing test**

SAP-009 through SAP-013.

- The copy assignment contains `Facts:`, `Do not use:`, `Shape:`, the skill path, and the accepted research table.
- It does not contain a rejected draft that was passed in as `rejected`.
- A skill excerpt longer than 1,500 characters is cut.
- A table that does not fit is cut after a full row, and the text includes `rows omitted`.
- The voice card is included when provided, and omitted when it is empty.
- The whole assignment is at most 24,000 characters. The skill excerpt is at most 1,500.
- The voice section is the latest revise_brief body that contains `Voice:`. It is omitted when that body is missing.

- [ ] **Step 2: Run the test and confirm it fails**
- [ ] **Step 3: Implement `buildSpecialistAssignment`**
- [ ] **Step 4: Re-run the test**

### Task 7: Accept gate and handoff

**Files:**
- Modify: `handoff/src/lib/client-workflows.ts`
- Test: `handoff/src/lib/client-workflows.test.ts`

- [ ] **Step 1: Write the failing tests**

SAP-005, SAP-006, SAP-008, SAP-011, SAP-020, SAP-021, SAP-022, SAP-033.

- `run_workflow` on stage 1 while stage 0 has `last_status = completed` and `accepted_at` null returns `waiting_accept` and does not fetch the swarm.
- The same call after `accepted_at` is set fetches the swarm. The body contains the stage 0 deliverable and does not contain an older unaccepted output.
- The due wake skips `stage_order > 0`.
- A second `run_workflow` while the stage is running does not fetch the swarm (SAP-008).
- `acceptWorkflow` sets `accepted_at` for `completed` and returns an error for `check_failed`.
- Accept does not set `next_run_at` on the next stage.
- Rerunning stage 0 clears later `accepted_at` and sets those rows to `stale`.
- `settleRunningSwarms` stores `check_failed` and the receipt. A swarm status of `running` stays running (SAP-033).

- [ ] **Step 2: Run the new tests and confirm they fail**
- [ ] **Step 3: Implement**

`priorChainText` becomes the previous stage only, and only when `accepted_at` is set. Wire `buildSpecialistAssignment` into `claimDueWorkflow` in place of `fitSwarmBrief` for rows that have `kind`.

- [ ] **Step 4: Re-run `npx vitest run src/lib/client-workflows.test.ts`**

### Task 8: Any pipeline and chat tools

**Files:**
- Modify: `handoff/src/lib/hq-tools.ts`
- Modify: `handoff/src/lib/hq-tool-names.ts`
- Test: `handoff/src/lib/hq-tools.test.ts`

- [ ] **Step 1: Write the failing tests**

SAP-001, SAP-002, SAP-004, SAP-023, SAP-026, SAP-029, SAP-031, SAP-032, SAP-034.

- `start_pipeline` with one headline path inserts one stage, kind `skill`, and starts it.
- `start_pipeline` with the parallel-web-search path then an SEO audit path inserts two stages and starts only research.
- `start_pipeline` with the four social paths in SAP-029 inserts four stages, kinds in order, and starts only research.
- A second call for the same project returns an error while the group is unfinished.
- `append_pipeline_stage` adds one stage and does not fetch the swarm.
- `abandon_pipeline` without approval returns `needsApproval`. After approval, unfinished stages are `stale` and a new `start_pipeline` is allowed.
- `pipeline_status` lists the stages in order with status and receipt.
- `accept_workflow` without approval returns `needsApproval`. After approval, a `completed` stage gets `accepted_at` and the swarm is not called.
- `queue_followup_swarms` does not fetch the swarm.

- [ ] **Step 2: Run the tests and confirm they fail**
- [ ] **Step 3: Implement the three tools**

`accept_workflow` uses the approval card path the other staff mutations use. `pipeline_status` reads `client_workflows` for that group.

- [ ] **Step 4: Re-run `npx vitest run src/lib/hq-tools.test.ts`**

### Task 9: Playbook

**Files:**
- Modify: `handoff/src/lib/hq-chat-playbook.ts`
- Modify: `handoff/src/agent/hq-chat.ts`
- Test: `handoff/src/lib/hq-chat-playbook.test.ts`

- [ ] **Step 1: Extend the playbook test**

The playbook contains `start_pipeline`, `append_pipeline_stage`, `abandon_pipeline`, `list_swarm_packs`, `pipeline_status`, `accept_workflow`, `waiting_accept`, and the sentence that a rejected page is not given to the next specialist. It says a headline stays a headline and an audit stays an audit. It still contains `Facts:` and `Do not use:` for copy, visuals, and the language pass. It does not tell chat to start the next swarm from `queue_followup_swarms`.

- [ ] **Step 2: Run the test and confirm it fails**
- [ ] **Step 3: Update the playbook and the `SYSTEM` string in `hq-chat.ts`**

Chat looks up the skills for the job and passes them, in order, to `start_pipeline`. The server creates every stage and runs only the first. Chat runs the next stage after accept.

- [ ] **Step 4: Re-run the playbook test**

### Task 10: Docs for the shipped behavior

**Files:**
- Modify: `handoff/CHANGELOG.md`
- Modify: `docs/hq-agent-spec.md` section 17, the swarm paragraph
- Modify: `docs/manual-project-swarm-gameplan.md` if it still says the next workflow starts from any finished output

- [ ] **Step 1: Describe every skill as a specialist, the accept gate, Llama 3.3 70B for every specialist, and Kimi K2.7 Code for the HQ agent only**
- [ ] **Step 2: Changelog entry with date, touchpoints, and the verification commands below**

### Task 11: Verification

```bash
cd swarm && npx vitest run src/ai/check.test.ts src/ai/agents.test.ts
cd handoff && npx vitest run src/db/migrate.test.ts src/lib/specialist-assignment.test.ts src/lib/client-workflows.test.ts src/lib/hq-tools.test.ts src/lib/hq-chat-playbook.test.ts
cd handoff && npx tsc --noEmit -p tsconfig.agent.json
cd handoff && npx eslint src/lib/specialist-assignment.ts src/lib/client-workflows.ts src/lib/hq-tools.ts src/lib/hq-chat-playbook.ts src/agent/hq-chat.ts
```

Expected: vitest pass, agent tsc exit 0, eslint exit 0. `tsc --noEmit -p tsconfig.json` may still fail on the existing `LayoutProps` and `PageProps` names. Do not treat that as a regression from this work.

Deploy after the tests pass: `handoff-agent`, `handoff-hq`, and `agent-swarm-orchestrator`. The columns ship with the HQ worker's migrate-on-request. The checker, the 70B path, and native tool calling ship with the swarm worker.

## Self-review

- SAP-001 through SAP-034 each appear in a task above.
- No task asks a specialist to start the next stage.
- A one-skill job and a research-then-audit job are tested, along with the social preset.
- Specialists use Llama 3.3 70B and one GLM 4.7 Flash retry. The 8B and 3B models are absent. The HQ agent stays on Kimi K2.7 Code.
- The assignment builder is the only place that clips the handoff.
