# Specialist pipeline implementation plan

> **For agentic workers:** Implement task-by-task. Write the failing test first. Do not start the next task while the current test is red.

**Goal:** Every catalog skill is a specialist the HQ agent can run. A pipeline is any ordered list of those skills. Posts are one preset. The next stage starts only after the HQ agent accepts the previous page, and it receives only that accepted page.

**Architecture:** Handoff owns the line: stage order, the short assignment, the accept flag, and the chat tools. The swarm owns the run: Kimi for every job except research, the tool-failure stop, and the checker. A finished swarm still does not start the next stage.

**Tech stack:** Next.js 16, Vitest, D1 migrations applied in memory by `migrate`, the swarm worker on Workers AI.

**Design:** [`docs/superpowers/specs/2026-10-12-specialist-pipeline-design.md`](../specs/2026-10-12-specialist-pipeline-design.md). Requirements SAP-001 through SAP-029.

---

## Repository boundary

Work is in [`handoff/`](../../../handoff/) and [`swarm/`](../../../swarm/). Do not add a secret. Kimi is already on the Workers AI binding. Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>` with `GIT_AUTHOR_*` and `GIT_COMMITTER_*` on the commit command. Do not change git config.

## File structure

| Path | Responsibility |
| --- | --- |
| `swarm/src/ai/check.ts` | Pure checker for the five kinds |
| `swarm/src/ai/check.test.ts` | Pass and fail rows |
| `swarm/src/ai/agents.ts` | Writer model versus research model. Tool failure stops the stage. |
| `swarm/src/ai/agents.test.ts` | Model id and the failure observation |
| `swarm/src/do/WorkflowDO.ts` | One retry, then `check_failed` or `completed`, receipt on the execution |
| `handoff/migrations/0022_specialist_pipeline.sql` | `pipeline`, `stage_order`, `kind`, `accepted_at`, `last_receipt` |
| `handoff/src/db/migrate.ts`, `handoff/src/db/migration-sql.ts` | Apply the step |
| `handoff/src/lib/specialist-assignment.ts` | Short assignment and row-boundary clip |
| `handoff/src/lib/specialist-assignment.test.ts` | Assignment contents |
| `handoff/src/lib/client-workflows.ts` | Accept gate, any ordered line, stale later stages, previous accepted page only |
| `handoff/src/lib/client-workflows.test.ts` | Those gates |
| `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts` | `start_pipeline`, `accept_workflow`, `pipeline_status` |
| `handoff/src/lib/hq-tools.test.ts` | Tool results |
| `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts` | Pipeline instructions |
| `handoff/src/lib/hq-chat-playbook.test.ts` | The new sentences |
| `handoff/CHANGELOG.md`, `docs/hq-agent-spec.md` | Behavior once the tasks ship |

## Global constraints

- Status values added here: `waiting_accept`, `check_failed`, `tool_failed`, `model_failed`, `stale`. Existing `source`, `completed`, `queued`, and `failed` stay.
- `accepted_at` is the only flag that unlocks the next stage.
- Every kind except research uses Kimi and never falls through to Llama.
- The full `SKILL.md` is not the assignment.
- Do not let a specialist create or run the next stage.

---

### Task 1: Checker

**Files:**
- Create: `swarm/src/ai/check.ts`
- Test: `swarm/src/ai/check.test.ts`

- [ ] **Step 1: Write the failing test**

Cover SAP-018:

- A research table with two sourced rows and one empty source returns the two rows and `ok: true`.
- A research table whose sources are all empty returns `ok: false` and an error that no sourced row remains.
- Copy with 7 complete rows passes. Copy with 6 rows fails. A row that opens with `Unlock` fails.
- Language with 7 rows passes. Language with 8 rows fails.
- Visuals with one image prompt and one video prompt per post pass. A missing video prompt fails. The words `placeholder model` fail.
- An empty skill page fails. A non-empty call plan passes. A 7-row post table fails when the kind is `skill`. A non-empty page with a 90-day heading fails.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd swarm && npx vitest run src/ai/check.test.ts
```

- [ ] **Step 3: Implement `checkSpecialist(kind, page, handoff)`**

Return `{ ok, errors, page }`. Research `page` is the table after empty sources are dropped. Other kinds return the original page when `ok` is true.

- [ ] **Step 4: Re-run the test**

Expected: pass.

### Task 2: Tool failure stops the stage

**Files:**
- Modify: `swarm/src/ai/agents.ts`
- Test: `swarm/src/ai/agents.test.ts`

- [ ] **Step 1: Write the failing test**

SAP-017. A thrown tool produces an observation that names the failure and sets the result status to `tool_failed`. The observation does not contain "what you know". A research run with no Parallel tool returns `tool_failed` and does not return a final answer (SAP-014).

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd swarm && npx vitest run src/ai/agents.test.ts
```

- [ ] **Step 3: Implement**

Replace the catch text in `runToolLoop`. When a required tool is missing or a call throws, return `{ output, toolsUsed, status: "tool_failed" }` without another model call.

- [ ] **Step 4: Re-run the test**

Expected: pass.

### Task 3: Writer model

**Files:**
- Modify: `swarm/src/ai/agents.ts`
- Test: `swarm/src/ai/agents.test.ts`

- [ ] **Step 1: Write the failing test**

SAP-015. `modelsForKind("copy" | "language" | "visual" | "skill")` is `["@cf/moonshotai/kimi-k2.7-code"]`. `modelsForKind("research")` is the existing three-model chain. A Kimi error on a headline or an audit surfaces as `model_failed` and does not call Llama.

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
- The whole assignment is at most 7,900 characters.

- [ ] **Step 2: Run the test and confirm it fails**
- [ ] **Step 3: Implement `buildSpecialistAssignment`**
- [ ] **Step 4: Re-run the test**

### Task 7: Accept gate and handoff

**Files:**
- Modify: `handoff/src/lib/client-workflows.ts`
- Test: `handoff/src/lib/client-workflows.test.ts`

- [ ] **Step 1: Write the failing tests**

SAP-005, SAP-006, SAP-011, SAP-020, SAP-021, SAP-022.

- `run_workflow` on stage 1 while stage 0 has `last_status = completed` and `accepted_at` null returns `waiting_accept` and does not fetch the swarm.
- The same call after `accepted_at` is set fetches the swarm. The body contains the stage 0 deliverable and does not contain an older unaccepted output.
- The due wake skips `stage_order > 0`.
- `acceptWorkflow` sets `accepted_at` for `completed` and returns an error for `check_failed`.
- Accept does not set `next_run_at` on the next stage.
- Rerunning stage 0 clears later `accepted_at` and sets those rows to `stale`.

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

SAP-001, SAP-002, SAP-004, SAP-023, SAP-026, SAP-029.

- `start_pipeline` with one headline path inserts one stage, kind `skill`, and starts it.
- `start_pipeline` with research then an SEO audit path inserts two stages and starts only research.
- `start_pipeline` with the social preset inserts four stages, kinds in order, and starts only research.
- A second call for the same project returns an error while any stage is unaccepted.
- `pipeline_status` lists the stages in order with status and receipt.
- `accept_workflow` on a `completed` stage sets `accepted_at` and does not call the swarm.

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

The playbook contains `start_pipeline`, `list_swarm_packs`, `pipeline_status`, `accept_workflow`, `waiting_accept`, and the sentence that a rejected page is not given to the next specialist. It says a headline stays a headline and an audit stays an audit. It still contains `Facts:` and `Do not use:` for copy, visuals, and the language pass.

- [ ] **Step 2: Run the test and confirm it fails**
- [ ] **Step 3: Update the playbook and the `SYSTEM` string in `hq-chat.ts`**

Chat looks up the skills for the job and passes them, in order, to `start_pipeline`. The server creates every stage and runs only the first. Chat runs the next stage after accept.

- [ ] **Step 4: Re-run the playbook test**

### Task 10: Docs for the shipped behavior

**Files:**
- Modify: `handoff/CHANGELOG.md`
- Modify: `docs/hq-agent-spec.md` section 17, the swarm paragraph
- Modify: `docs/manual-project-swarm-gameplan.md` if it still says the next workflow starts from any finished output

- [ ] **Step 1: Describe every skill as a specialist, the accept gate, and Kimi for every job except research**
- [ ] **Step 2: Changelog entry with date, touchpoints, and the verification commands below**

### Task 11: Verification

```bash
cd swarm && npx vitest run src/ai/check.test.ts src/ai/agents.test.ts
cd handoff && npx vitest run src/db/migrate.test.ts src/lib/specialist-assignment.test.ts src/lib/client-workflows.test.ts src/lib/hq-tools.test.ts src/lib/hq-chat-playbook.test.ts
cd handoff && npx tsc --noEmit -p tsconfig.agent.json
cd handoff && npx eslint src/lib/specialist-assignment.ts src/lib/client-workflows.ts src/lib/hq-tools.ts src/lib/hq-chat-playbook.ts src/agent/hq-chat.ts
```

Expected: vitest pass, agent tsc exit 0, eslint exit 0. `tsc --noEmit -p tsconfig.json` may still fail on the existing `LayoutProps` and `PageProps` names. Do not treat that as a regression from this work.

Deploy after the tests pass: `handoff-agent`, `handoff-hq`, and `agent-swarm-orchestrator`. The columns ship with the HQ worker's migrate-on-request. The checker and the Kimi path ship with the swarm worker.

## Self-review

- SAP-001 through SAP-029 each appear in a task above.
- No task asks a specialist to start the next stage.
- A one-skill job and a research-then-audit job are tested, along with the social preset.
- Every kind except research has no Llama fallback.
- The assignment builder is the only place that clips the handoff.
