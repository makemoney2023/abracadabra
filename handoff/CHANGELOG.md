# Changelog

## 2026-10-13

- **What changed** — A specialist stage can stop with `{"questions":[...]}` instead of a page. The stage status becomes `question`, the task waits on staff, and HQ is told to call `open_questions` then `answer_question`. That answer runs the stage again. A visual stage asks when the model, the ratio, or a brand color is missing. Later stages stay queued while it asks. `answer_question` does not wait for an approval card.
- **Why** — The image skill needs a reply before it can write prompts. A question was a failed check, so the pipeline stopped and HQ had no way to answer and continue.
- **Code touchpoints** — `swarm/src/ai/check.ts`, `swarm/src/do/settle-specialist.ts`, `swarm/src/do/WorkflowDO.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`
- **Data-flow impact** — `answer_question` claims the waiting stage with `Answers:` in the brief. An auto pipeline accepts the page when the rerun finishes.
- **API / schema impact** — Swarm execution status can be `question`. No new tables.
- **Verification** — handoff `npm test` (878 passed), swarm `npm test` (75 passed), `npx tsc --noEmit` in both packages, and handoff `npx tsc --noEmit -p tsconfig.agent.json`.

- **What changed** — `start_pipeline` can take `auto`. It creates every stage in one call, files each finished page in the client space, accepts that page, and starts the next stage. A due wake does the same for a later stage whose previous page is already accepted. `accept_workflow` and `abandon_pipeline` no longer wait for an approval card. Chat is told to pass every skill path once, with `auto` true when staff want the agent to run the chain.
- **Why** — HQ started one stage at a time, asked staff to accept each page, and the finished swarm page did not move the chain or show up as the thing staff were waiting on.
- **Code touchpoints** — `handoff/src/lib/specialist-pipeline.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`, `handoff/src/app/api/swarm-settled/route.ts`, `handoff/migrations/0023_pipeline_auto.sql`
- **Data-flow impact** — A finished auto stage sets `accepted_at`, writes `agent/swarm/<run>/result.md`, and claims the next stage with the original brief. A pipeline without `auto` still waits for accept.
- **API / schema impact** — `workflow_groups` gains `auto_continue` and `brief`. `start_pipeline` accepts `auto` and returns it.
- **Verification** — handoff `npm test` (877 passed) and `npx tsc --noEmit` plus `npx tsc --noEmit -p tsconfig.agent.json`.

- **What changed** — The closed-tools turn after a specialist tool call now sends a clean prompt with the tool results instead of replaying the tool-call history, and it tries each specialist model in turn when a reply is still only a tool call.
- **Why** — The tools-closed turn used only the first model and replayed the earlier calls, so Llama could answer with another tool call and the research stage still failed with "The step ended on a tool call and did not write an answer."
- **Code touchpoints** — `swarm/src/ai/agents.ts`, `swarm/src/ai/agents.test.ts`
- **Data-flow impact** — The closed-tools turn gets the brief plus every `Observation from server/tool` result, then Llama, then GLM.
- **API / schema impact** — none.
- **Verification** — swarm `npm test` (74 passed) and `npx tsc --noEmit` passed.

- **What changed** — Each specialist stage gets a board task in Describe when the pipeline starts or a stage is appended. A stage that needs a source packet stops with status `source`, writes a staff-log row, and tells HQ what to add. `begin_pipeline` returns the first stage's status and output, so HQ reports what happened instead of saying the swarm is running. `list_workflows` hides closed pipelines and stale stages. Abandoning a pipeline deletes the board tasks of stages that never ran and keeps the rest.
- **Why** — HQ said a pipeline was running when no swarm ran, the board had no tasks for the stages, and `list_workflows` showed closed and stale items.
- **Code touchpoints** — `handoff/src/lib/specialist-pipeline.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`
- **Data-flow impact** — `startPipeline` and `appendPipelineStage` insert a `tasks` row with each `client_workflows` row. `claimDueWorkflow` returns `source` before calling the swarm when the packet is missing.
- **API / schema impact** — `begin_pipeline` result gains `status`, `output`, and `waitingOn`. No new tables.
- **Verification** — handoff `npm test` (874 passed), `npx tsc --noEmit`, and `npx tsc --noEmit -p tsconfig.agent.json` passed.

- **What changed** — After a specialist tool returns, a reply that is only another tool call gets one more model turn with tools closed, and that turn must write the page.
- **Why** — The research stage called Parallel, then failed with `model_failed` and "The step ended on a tool call and did not write an answer."
- **Code touchpoints** — `swarm/src/ai/agents.ts`
- **Data-flow impact** — A research run that already has a tool observation asks for the JSON page instead of stopping on the next tool call.
- **API / schema impact** — none.
- **Verification** — `cd swarm && npm test -- src/ai/agents.test.ts`

## 2026-10-12

- **What changed** — A specialist stage reads its skill from the skills bucket. Accepting a visual stage sends Flux a multipart image request and records a failed image on the receipt. A mixed model reply keeps the first JSON value. HQ notices use the public chat write. Pipeline stages insert in one transaction. `pipeline_status` stays within a size cap. Pipeline actions write a staff-log row. A finished swarm run can settle immediately through a signed callback. The swarm worker uses Wrangler 4.
- **Why** — Production was settling with old code, sending Flux the wrong body, and running specialists without their skill text.
- **Code touchpoints** — `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/specialist-pipeline.ts`, `handoff/src/lib/flux-input.ts`, `handoff/src/lib/skill-library.ts`, `handoff/src/app/api/swarm-settled/route.ts`, `handoff/src/agent/hq-chat.ts`, `handoff/wrangler.jsonc`, `handoff/wrangler.hq.jsonc`, `swarm/src/ai/check.ts`, `swarm/src/handoff-callback.ts`, `swarm/wrangler.toml`
- **Data-flow impact** — `claimDueWorkflow` takes a skill reader. `settleOne` settles one run by id or execution id. The swarm posts `{ runId, sentAt }` to `POST /api/swarm-settled`. The cron still settles anything that post misses.
- **API / schema impact** — `POST /api/swarm-settled`, signed with `SWARM_RUN_SECRET`. `handoff` and `handoff-hq` gain the `SKILLS` R2 binding. No new tables.
- **Verification** — handoff `npm test` and `npx tsc --noEmit` passed. Swarm `npm test` and `npx tsc --noEmit` passed. Deployed `handoff` `f96317de-00be-4a9e-b38d-ea3c84c5d184` (crons present, `SKILLS` bound), `handoff-hq` `018274c2-0e99-474f-b816-87d9c3a149d6`, `handoff-agent` `3d1c62c9-e155-45bd-af34-4e2d3aec159d`, and `agent-swarm-orchestrator` `cbd43677-fd58-43bb-bbe5-a01548b90768`. Unsigned `POST /api/swarm-settled` and `POST /hq-notice` return 401. Health checks return 200. A signed social-preset run was not started here because this session cannot read the staff password. `AGENT_WAKE_SECRET` is set on `handoff`. `AGENT_URL` is set there as a var.

## 2026-10-12

- **What changed** — A failed specialist start no longer clears an accepted page. A half-built pipeline closes so the project can start again. Abandon does not touch a group that is not a pipeline. Accepting a visual page a second time does not render the images again. A check retry still has the same tools, and a list of hashtags counts as that field.
- **Why** — Those paths could wipe a finished page, block the project, or fail a good copy page.
- **Code touchpoints** — `handoff/src/lib/specialist-pipeline.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-tools.ts`, `swarm/src/ai/check.ts`, `swarm/src/do/WorkflowDO.ts`
- **Data-flow impact** — `start_pipeline` closes the group if a stage cannot be saved. `claimDueWorkflow` clears later accepts only after the rerun has an execution id. The checker reads the accepted page from the assignment.
- **API / schema impact** — none. A second `start_pipeline` while one is open returns a refusal the chat can read.
- **Verification** — `npx vitest run src/lib/specialist-pipeline.test.ts src/lib/client-workflows.test.ts` and `cd swarm && npx vitest run src/ai/check.test.ts`.

## 2026-10-12

- **What changed** — Every catalog skill can run as a specialist in an ordered pipeline. The next stage starts only after the previous page is accepted. Posts are one preset: research, copy, language, then image prompts. Specialists use Llama 3.3 70B, then one GLM 4.7 Flash retry when the call throws. Research must call Parallel. A finished stage posts one line into the staff chat. An accepted visual stage renders image prompts with Flux 2 Klein. Video prompts stay text.
- **Why** — The old swarm chain wrote thin pages from an 8B model and fed them forward before anyone accepted them.
- **Code touchpoints** — `handoff/src/lib/specialist-pipeline.ts`, `handoff/src/lib/specialist-assignment.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/agent/hq-chat.ts`, `handoff/src/agent/worker.ts`, `swarm/src/ai/check.ts`, `swarm/src/ai/agents.ts`, `swarm/src/do/WorkflowDO.ts`, `handoff/migrations/0022_specialist_pipeline.sql`
- **Data-flow impact** — `start_pipeline` creates the stages and starts the first. `run_workflow` starts a later stage only after `accepted_at` is set. `settleRunningSwarms` stores `check_failed`, `tool_failed`, and `model_failed` with the receipt. `queue_followup_swarms` files work and does not start a swarm.
- **API / schema impact** — `client_workflows` gains `stage_order`, `kind`, `skill_path`, `accepted_at`, and `last_receipt`. `workflow_groups` gains `pipeline` and `started_by`. New tools: `start_pipeline`, `append_pipeline_stage`, `abandon_pipeline`, `accept_workflow`, `pipeline_status`. `POST /hq-notice` on the agent worker.
- **Verification** — specialist checker, assignment, pipeline, client workflow, HQ tool, and playbook tests.

## 2026-10-12

- **What changed** — The specialist-pipeline spec now includes a chat notice when a stage finishes, an output schema fence on the four social skills, golden JSON pages, and Flux images for accepted image prompts. Runtime behavior is unchanged.
- **Why** — Kimi K2.7 Code is the manager. The 8B research chain is the model that wrote the thin pages.
- **Code touchpoints** — `docs/superpowers/specs/2026-10-12-specialist-pipeline-design.md`, `docs/superpowers/plans/2026-10-12-specialist-pipeline.md`
- **Data-flow impact** — none until the plan is implemented.
- **API / schema impact** — none yet. The plan adds `pipeline`, `stage_order`, `kind`, `accepted_at`, and `last_receipt`.
- **Verification** — docs only.

## 2026-10-11

- **What changed** — Every skill runs as its own job. Chat finds any skill with `list_swarm_packs` query. Copy, visuals, and the language pass are still the only ones that wait for `Facts:` and `Do not use:`.
- **Why** — The deliverable list hid every other skill, so a headline or an audit could not be chosen the same way as copy.
- **Code touchpoints** — `handoff/src/lib/pack-templates.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`, `swarm/src/pack-templates.json`
- **Data-flow impact** — An empty pack list returns research, copy, language, and visual skills. A query returns every matching skill. Each skill brief says to return only what that skill defines.
- **API / schema impact** — `list_swarm_packs` accepts `query`.
- **Verification** — `npx vitest run src/lib/pack-templates.test.ts src/lib/hq-chat-playbook.test.ts src/lib/hq-tools.test.ts src/lib/client-workflows.test.ts` passed 70. `npx tsc --noEmit -p tsconfig.agent.json` exited 0. `npx eslint` on the changed TypeScript files exited 0.

## 2026-10-11

- **What changed** — Each swarm template is one skill. Research returns a source table. Copy returns 7 posts for one persona. Copy, visuals, and the generic-language pass do not start until the brief has Facts: and Do not use:.
- **Why** — A folder chain ran the first four skills in alphabetical order, so a calendar request never reached the copy skill and invented the rest.
- **Code touchpoints** — `handoff/src/lib/pack-templates.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`, `swarm/src/pack-templates.json`
- **Data-flow impact** — `list_swarm_packs` returns the research, copy, visual, and language skills. `create_workflow` accepts a `.cursor/skills` path and stores that skill's template. A missing source packet returns status `source` and does not call the swarm. After an accepted copy batch, chat stores the voice with `revise_brief`.
- **API / schema impact** — none. Pack template ids are now `skill-...` instead of a four-skill folder chain.
- **Verification** — `npx vitest run src/lib/pack-templates.test.ts src/lib/hq-chat-playbook.test.ts src/lib/client-workflows.test.ts src/lib/hq-tools.test.ts src/lib/task-packs.test.ts src/lib/pack-picker.test.ts` passed 77. `npx tsc --noEmit -p tsconfig.agent.json` exited 0. `npx eslint` on the changed TypeScript files exited 0.

## 2026-10-11

- **What changed** — Skill packs do one sourced batch of at most 7 items. A finished swarm no longer starts the next workflow. Staff chat reads the output, and runs the next workflow only when that output is specific.
- **Why** — A 90-day ask made narrow skills invent generic copy, and the next workflow treated that copy as fact.
- **Code touchpoints** — `handoff/src/lib/pack-templates.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`, `handoff/src/lib/mcp.ts`, `swarm/src/pack-templates.json`, `docs/hq-agent-spec.md`, `docs/manual-project-swarm-gameplan.md`
- **Data-flow impact** — Every pack node and every swarm brief carries the batch contract. The due wake runs only the first workflow in a group. `advance_workflow_chain` saves the output and leaves the rest. Chat calls `run_workflow` for the next one, and that run receives the earlier output.
- **API / schema impact** — none. `advance_workflow_chain` no longer starts the next workflow.
- **Verification** — `npx vitest run src/lib/pack-templates.test.ts src/lib/hq-chat-playbook.test.ts src/lib/client-workflows.test.ts src/lib/hq-tools.test.ts` passed 68. `npx tsc --noEmit -p tsconfig.agent.json` exited 0. `npx eslint` on the changed TypeScript files reported no new errors. `npx tsc --noEmit -p tsconfig.json` still fails on existing `LayoutProps` and `PageProps` names in `src/app/layout.tsx` and `src/app/page.tsx`.

## 2026-10-10

- **What changed** — Staff chat can list, read, and search a GitHub repo attached to the client.
- **Why** — The agent could see that a repo was linked, but it could not open the files.
- **Code touchpoints** — `handoff/src/lib/github/browse.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`
- **Data-flow impact** — `list_repos` lists attached repos. `list_repo_files` lists one folder. `read_repo_file` returns text up to 20,000 characters. `search_repo` searches that repo and drops hits from any other repository. A client with more than one repo is asked to pick before GitHub is called.
- **API / schema impact** — none. The GitHub App token stays on the staff worker.
- **Verification** — `npx vitest run src/lib/github/browse.test.ts src/lib/hq-tools.test.ts src/lib/hq-chat-playbook.test.ts src/app/chat/approval-card.test.ts` passed 43. `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.agent.json` exited 0. eslint on the changed files exited 0.

## 2026-10-10

- **What changed** — Staff chat can read a project document, publish the swarm PDF to the client, and send a review into the next swarms.
- **Why** — A review could open space files, but not the project document, and the next swarm received only the finished output.
- **Code touchpoints** — `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`
- **Data-flow impact** — `read_deliverable` returns the current text, up to 20,000 characters. `publish_swarm_report` waits for approval, then files `report.pdf` as a client-visible document. `queue_followup_swarms` puts `body` ahead of the finished swarm text.
- **API / schema impact** — none.
- **Verification** — `npx vitest run src/lib/hq-tools.test.ts src/lib/hq-chat-playbook.test.ts` passed 35. `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.agent.json` exited 0. eslint on the changed files exited 0.

## 2026-10-10

- **What changed** — A finished swarm stores its PDF report in the client space. Staff chat can save that PDF and start the next swarms with the finished output.
- **Why** — The report stayed on the swarm worker, and the agent could not turn a finished run into the next set of swarm tasks.
- **Code touchpoints** — `handoff/src/lib/workflow-files.ts`, `handoff/src/lib/lead-swarm.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`
- **Data-flow impact** — Completion writes `agent/swarm/<run>/report.pdf` once. `save_swarm_report` does the same for a workflow that already finished. `queue_followup_swarms` waits for approval, files up to six workflows on the project, and starts the first with the finished text. Later workflows in that new group wait their turn.
- **API / schema impact** — none. `save_swarm_report` and `queue_followup_swarms` on staff chat.
- **Verification** — `npx vitest run src/lib/lead-swarm.test.ts src/lib/workflow-files.test.ts src/lib/client-workflows.test.ts src/lib/hq-tools.test.ts src/lib/hq-chat-playbook.test.ts` passed 80. `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.agent.json` exited 0. eslint on the changed files exited 0.

## 2026-10-10

- **What changed** — Staff chat can list and read files in the client's space, including swarm output.
- **Why** — The chat agent had no tool that opened those files, so a review stopped and asked staff to paste the calendar.
- **Code touchpoints** — `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`
- **Data-flow impact** — `list_space_files` returns paths in the client's active spaces. `read_space_file` reads the stored text, up to 20,000 characters. A file from another client is missing. Swarm files stay under `agent/swarm/`.
- **API / schema impact** — none. Two read tools on staff chat and `/api/hq-tools`.
- **Verification** — `npx vitest run src/lib/hq-tools.test.ts src/lib/hq-chat-playbook.test.ts` passed 34. `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.agent.json` exited 0. eslint on the changed files exited 0.

## 2026-10-10

- **What changed** — A chat brief is stored on the project. A workflow named research keeps Parallel tools only, and each swarm node stops after three minutes.
- **Why** — Creating a project from staff chat left the requirements empty, so the project page had no brief. The research swarm was saved under the marketing pack name, called image generation, and stayed on that node for about six minutes.
- **Code touchpoints** — `handoff/src/lib/channel-plan.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/lead-swarm.ts`, `swarm/src/do/resume.ts`, `swarm/src/do/WorkflowDO.ts`
- **Data-flow impact** — `create_project` description and the first `file_actions` brief become the project requirements and, when the client has a space, a project brief. Tasks from `file_actions` use that project. A swarm run whose project requirements are empty stores its own instruction, not the scraped pages. The saved swarm workflow uses the client workflow name, so a name containing research offers Parallel tools only. One node, including tool rounds, stops at three minutes and the later nodes still run. When the minute cron files a finished swarm, the linked card moves to done.
- **API / schema impact** — none. `create_project` accepts `description`. `file_actions` accepts `projectId`.
- **Verification** — `npx vitest run src/lib/channel-plan.test.ts src/lib/hq-tools.test.ts src/lib/lead-swarm.test.ts src/lib/client-workflows.test.ts src/lib/hq-chat-playbook.test.ts src/lib/client-channel.test.ts` passed 103. The settle test was re-run after the done-card assertion and passed. `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.agent.json` exited 0. eslint on the changed handoff files exited 0. `npm test` in `swarm/` passed 50. `npx tsc --noEmit` in `swarm/` exited 0. Live: swarm `20c79885-7682-4c0e-aac7-d9f4b0a12235`, agent `e510aa30-8dfc-4a6d-adb8-7a5d2c917e8f`, handoff `e3875e80-e36d-4a55-a7fa-5d8cc0d876dd`, handoff-hq `ddacc77c-f60d-41ff-abf9-c3bc1ea2d907`. Renew Implants project `6091903c-cd7c-4269-992f-71b5eeb8077a` now has the research brief (518 characters, no scraped HTML) and a project brief deliverable. Its three finished swarm cards are `done`. `GET /api/health` on the staff and client hosts returned `{"database":"d1","ok":true,"visible":0}`.

## 2026-10-10

- **What changed** — The work wake runs every minute. An open wake older than 15 minutes is abandoned. Each swarm node is saved in the client's file space. A scan-filing error no longer stops that wake.
- **Why** — A 15-minute cron left a finished research run marked running, and a stale wake row could block the next check. Only the combined result was filed. The minute cron was firing, then dying on a D1 `LIKE` of the scan id before it could wake the agent.
- **Code touchpoints** — `handoff/wrangler.jsonc`, `handoff/cloudflare-worker.ts`, `handoff/src/lib/scan-context.ts`, `handoff/src/lib/agent-wake.ts`, `handoff/src/lib/lead-swarm.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/mcp-connect.ts`, `handoff/src/agent/worker.ts`, `swarm/src/do/resume.ts`, `swarm/src/do/WorkflowDO.ts`
- **Data-flow impact** — Cron `* * * * *` posts `work`, `context_changed`, or `due`, including a client whose swarm run is still `running`. A busy agent still returns 202. When the connector portal has not loaded work tools, the due wake calls the Handoff route. A follow-up read of running swarms uses its own request id, so it is not replaced by the previous tool result. The minute cron also reads each swarm still marked running and, when the swarm has finished, files its nodes and starts the next workflow. On completion, `agent/swarm/<run>/<node>.md` is written for each artifact plus `result.md`. A repeating workflow still waits at least 15 minutes. Already-filed scans are matched by path prefix, not `LIKE`. One client's scan error is a note, and the wake still runs. The hourly cloud-run check and the Monday status note are unchanged.
- **API / schema impact** — none.
- **Verification** — `npx vitest run src/lib/agent-wake.test.ts src/lib/lead-swarm.test.ts src/lib/client-workflows.test.ts src/lib/scan-context.test.ts src/lib/mcp-connect.test.ts` passed. `npx vitest run --config vitest.agent.config.mts` passed 8. `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.agent.json` exited 0. `npm test` in `swarm/` passed 48. A full `npx vitest run` passed 826 and timed out 4 unrelated upload tests at 5s. Live: handoff `e0246e4c-d1f0-4731-b4ea-fa9bd69aefbb`, agent `acb91e1c-1b6d-4077-b723-809cd395a612`, swarm `699d2ef6-ee8c-4f7e-a9fe-de49946cef6a`. Research run `1d8003f8-b5ef-45f9-88a1-75a6d30e2f6b` is completed and its three node files plus `result.md` are in the client space. Copy run `2916b63b-4901-465d-89af-6c55b13c5a23` is running. Visual waits for copy.

## 2026-10-10

- **What changed** — The social media project was deleted for the fresh test.
- **Why** — The earlier clear left the project in place.
- **Code touchpoints** — none.
- **Data-flow impact** — Removed project `af24cc5d-3f8b-4c1e-b83c-7a76f04a7ff4`. The AbraCadabra space and the abracadabra repo stayed, with the project link cleared. Git activity stayed.
- **API / schema impact** — none.
- **Verification** — Projects 0. Workspaces 2, both with no project. Repos 2, both with no project.

- **What changed** — The social-media test was cleared again so the next run can start from scratch.
- **Why** — The buying-psychology research run, its workflows, the project brief, and the HQ chat were still in place.
- **Code touchpoints** — none. Data clear after agent deploy `62013526-8aab-4d3d-8503-45822dc391df`.
- **Data-flow impact** — Removed the three tasks, the workflow group, the swarm run, the project requirements, the brief attached to the social media project, and the HQ chat messages. The social media project, the client, staff, spaces, git activity, and the older unattached brief remain.
- **API / schema impact** — none.
- **Verification** — Tasks 0, workflows 0, workflow groups 0, swarm runs 0, idempotency keys 0. The social media project description is empty. HQ chat messages 0 after the agent redeploy.

- **What changed** — A research pack calls Parallel Search. A swarm step that is still running is left alone for two minutes, retried once, then marked timed out so the later steps can run.
- **Why** — The buying-psychology research run restarted its reviewer on every status check, so the run never finished and the paper step never called Parallel.
- **Code touchpoints** — `swarm/src/do/resume.ts`, `swarm/src/do/WorkflowDO.ts`, `swarm/src/mcp/research-tools.ts`, `handoff/src/lib/hq-chat-playbook.ts`
- **Data-flow impact** — Research workflow nodes receive Parallel tools from the portal when they are listed, and the step is told to call Parallel Search before the final answer. A tool call waits up to 60 seconds. A step whose only output is the tool-call block is an error. A hung model call becomes an error instead of staying `running` forever. HQ keeps reading a running swarm for about 30 minutes, then schedules another due wake instead of stopping after six checks. The quarter-hour wake also includes a client whose swarm run is still marked running, so a finished run is filed after HQ stopped polling. HQ still files a project document only when the run completes.
- **API / schema impact** — none.
- **Verification** — `npm test` in `swarm/` passed 45. `npx vitest run src/lib/lead-swarm.test.ts src/lib/hq-chat-playbook.test.ts src/lib/agent-wake.test.ts` passed. `npx tsc --noEmit -p tsconfig.agent.json` exited 0. Swarm worker version `1831b70d-c214-42aa-994e-7198e387d696`. Agent worker version `babbe3fd-75c7-4cba-80f0-9d30d8878df4`. Handoff worker version `18a23b8a-7a4f-4825-acb3-39659ef35d45`. The buying-psychology swarm had already finished on the worker. HQ still had it marked running because it stopped polling. The next quarter-hour wake files that run.

- **What changed** — The merged workflow-order build is on the staff HQ and the agent. Project chat, tasks, and swarm runs were cleared for a fresh test.
- **Why** — Main's delete tools and the research-first chain needed to be on the same live workers, and the previous social-media run was still in the chat.
- **Code touchpoints** — none. Deploy of `dedd7b3`.
- **Data-flow impact** — Removed the HQ chat messages, the two tasks, the workflow group, and the swarm runs. The social media project, the client, staff, spaces, and git activity remain. The unattached brief deliverable remains.
- **API / schema impact** — none.
- **Verification** — Worker `handoff-agent` version `da00b4ac-1e53-4613-9531-1400b4541e5a` on `agent.abra-ca-dabra.app`. Worker `handoff-hq` version `93884e42-f3eb-48c0-a52d-fe7182df7a7e` on `hq.abra-ca-dabra.app`. `GET /api/health` returned 200 `{"database":"d1","ok":true,"visible":0}`. Tasks 0, swarm runs 0, workflows 0, HQ chat messages 0.

- **What changed** — Workflows in one group run one at a time. Research runs before copy, visuals, or a calendar, and its output is the next workflow's input. A brief added in chat is stored on the project.
- **Why** — The agent started every swarm together, so research never fed the later work, and the brief was not on the project page.
- **Code touchpoints** — `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/agent/hq-chat.ts`, `handoff/src/agent/worker.ts`, `handoff/src/db/agent-work.ts`, `handoff/src/app/projects/[id]/page.tsx`, `handoff/migrations/0021_workflow_chain.sql`
- **Data-flow impact** — A later workflow waits while an earlier one is unfinished. Asking to run a later workflow starts research first when research has not started. A finished run is saved and the next workflow is armed. A follow-up that finds the finished output starts the next workflow with that text. `add_work` writes the brief's `project_id` and the project requirements.
- **API / schema impact** — `client_workflows.last_output`. Agent tools `running_swarms` and `advance_workflow_chain`.
- **Verification** — `npx vitest run src/lib/client-workflows.test.ts src/lib/hq-tools.test.ts src/db/migrate.test.ts src/lib/hq-chat-playbook.test.ts` passed 58. `npx vitest run --config vitest.agent.config.mts` passed 7. `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.agent.json` exited 0. eslint on the changed files exited 0. A full `npx vitest run` passed 816 and timed out 4 unrelated upload tests at 5s; those tests pass when run on their own. Remote D1 gained `client_workflows.last_output`. Worker `handoff-agent` version `1430959e-88a3-4e37-8c58-70fa8e5d90c6` on `agent.abra-ca-dabra.app`. Worker `handoff-hq` version `2a2498c7-42c8-4cd6-918b-ac5b08842af6` on `hq.abra-ca-dabra.app`.

- **What changed** — Delete work is live. Staff HQ, the client worker, and the agent worker were deployed from the merge. Workers Builds for `handoff` and `handoff-hq` skip the separate `next build` and let `npm run deploy` and `npm run deploy:hq` build OpenNext.
- **Why** — The delete tools were only on the branch. The separate `next build` failed on the Google font step before deploy could run.
- **Code touchpoints** — none in git. Deploy of `e468d54`. Workers Builds triggers `2de98be9-149f-4a8b-851f-475f194fed85` and `31f8691a-1a3b-4107-822c-2c64e5faf83d`.
- **Data-flow impact** — `delete_task` and `delete_project` are on the live MCP route and on HQ chat.
- **API / schema impact** — none.
- **Verification** — Worker `handoff` version `6577985f-759c-43f3-b57a-394f12719c2e` on `handoff.abra-ca-dabra.app`. Worker `handoff-hq` version `e16f9afa-b94b-43bb-b141-f52a544431d9` on `hq.abra-ca-dabra.app`. Worker `handoff-agent` version `638c4caa-dfad-46de-83e4-8125aba86e66` on `agent.abra-ca-dabra.app`. `GET /api/health` on the staff and client hosts returned 200 `{"database":"d1","ok":true,"visible":0}`.

- **What changed** — The HQ agent can delete a task, or a project and the tasks on it. Staff chat shows an approval card before either delete.
- **Why** — The agent could create projects and tasks and had no way to remove them.
- **Code touchpoints** — `handoff/src/db/crm.ts`, `handoff/src/db/agent-work.ts`, `handoff/src/lib/mcp.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/hq-chat-playbook.ts`
- **Data-flow impact** — `delete_task` and `delete_project` on the agent work key and on HQ chat. A project delete clears `project_id` on the space, repo, invoices, deliverables, workflow group, and swarm history. Tasks, milestones, status updates, and cloud runs on that project are removed.
- **API / schema impact** — none. No new tables.
- **Verification** — `npm test` in `handoff/` after rebase onto main: 818 tests passed, and the agent worker suite passed 7.

- **What changed** — Main is published. Staff HQ and the agent worker were deployed from that merge.
- **Why** — Packed Run cards need to start on the live workers, and HQ chat needs the stream-order fix.
- **Code touchpoints** — none. Deploy of `6546654`.
- **Data-flow impact** — none beyond the Run start and chat stream behavior already described.
- **API / schema impact** — none.
- **Verification** — Worker `handoff-agent` version `6bc02dba-3a5e-4ad7-8503-c0ec2a986d3a` on `agent.abra-ca-dabra.app`. Worker `handoff-hq` version `55002d13-6559-47b8-b329-989055ea8532` on `hq.abra-ca-dabra.app`. `GET /api/health` returned 200 `{"database":"d1","ok":true}`. Existing secrets on both workers were still present after deploy.

- **What changed** — Approving a run, or moving a packed card to Run, starts that swarm immediately. The brief sent to the swarm includes the latest staff instruction.
- **Why** — Cards sat in Run after the stage change. The start waited on a later due wake, and a draft brief was treated as a hold.
- **Code touchpoints** — `handoff/src/lib/task-stage.ts`, `handoff/src/lib/client-workflows.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/app/api/hq-tools/route.ts`, `handoff/src/app/work/actions.ts`
- **Data-flow impact** — `run_workflow` and `set_task_stage` to run call the swarm in that request. A finished run still files an unpublished document. A run that is still going wakes `due` to poll. The due time is cleared so the same workflow is not started twice.
- **API / schema impact** — none.
- **Verification** — `npm test` in `handoff/`: 813 tests passed, and the agent worker suite passed 7. eslint on the changed files exited 0.

- **What changed** — HQ chat keeps a tool-approval continuation from sending a text delta before its text part has started, and it no longer drops a text-start line that arrives split across two reads.
- **Why** — The chat showed `Received text-delta for missing text part` while Publish and Instruct were still on screen, so the turn stopped before those cards could finish.
- **Code touchpoints** — `handoff/src/lib/hq-chat-stream.ts`, `handoff/src/agent/hq-chat.ts`
- **Data-flow impact** — A continuation closes any still-streaming text or reasoning part on the assistant message before the next model stream starts. The UI message stream is re-emitted as whole SSE lines.
- **API / schema impact** — none.
- **Verification** — `npm test` in `handoff/`: 812 tests passed, and the agent worker suite passed 7. `npx tsc --noEmit -p tsconfig.agent.json` and eslint on the changed files exited 0.

- **What changed** — Main includes the MCP server list and the agent portal URL. Staff HQ and the agent were deployed from that merge.
- **Why** — The list parser and the live portal URL were only on draft branches.
- **Code touchpoints** — none. Deploy of `5ab4243`.
- **Data-flow impact** — `/mcp` reads the portal's text server list. The agent opens `https://mcp.abra-ca-dabra.app/mcp` with the Access service token.
- **API / schema impact** — none.
- **Verification** — Worker `handoff-hq` version `e71e1979-2371-4d97-943b-133ebf11bc54` on `hq.abra-ca-dabra.app`. Worker `handoff-agent` version `3affd6eb-3ca6-44a4-b20c-421e269c9f3e` on `agent.abra-ca-dabra.app`. `GET /api/health` returned 200. `portal_list_servers` still lists Parallel Search as enabled. The agent Access secrets were put again after the deploy.

## 2026-10-09

- **What changed** — The MCP page reads the portal's text server list, so Parallel Search shows as on or off.
- **Why** — `portal_list_servers` returns lines like `- Parallel Search (parallel-search): ✓ enabled`. The page only accepted JSON, so a linked server rendered as an empty list. The server was also hidden until its Access app allowed the HQ service token.
- **Code touchpoints** — `handoff/src/lib/portal-session.ts`, `handoff/src/lib/portal-session.test.ts`
- **Data-flow impact** — `/mcp` lists the servers that grant can see. Turning one on or off still calls `portal_toggle_single_server`.
- **API / schema impact** — none.
- **Verification** — `npx vitest run src/lib/portal-session.test.ts` passed 5. Live `portal_list_servers` with the service token returned Parallel Search enabled. Worker `handoff-hq` version `eb0227e2-1336-4570-b080-089eadc26bae` on `hq.abra-ca-dabra.app`. `GET /api/health` returned 200.
