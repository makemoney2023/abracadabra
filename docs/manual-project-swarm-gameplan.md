# Manual projects run the same swarm

**Status:** proposed. Not built.
**Updated:** 2026-10-09
**Amends, when built:** the swarm paragraph in [hq-agent-spec.md](hq-agent-spec.md) section 17.3, and the Work paragraph in [README.md](../README.md).

## Outcome

Staff create a project, write the requirements, and save. Each new Describe card gets the one swarm pack that can do that task, and the pack's skill steps are stored on the card.

When a card has a pack and no swarm is running, **Run swarm** appears on the card. Pressing it starts the same run the agent uses: move the card to Run, schedule that pack due now, wake `due`, and follow the run until the output is a file in the client space and an unpublished document on that project.

The client portal does not get this button. Staff publish before the client sees the document.

## What is already true

| Fact | Where |
|---|---|
| Saving requirements files task titles and a brief. New cards are `stage = 'describe'`, `created_by_kind = 'staff'`, with no `skills_json`. A later save does not add a card when any task on the project is still open. | `fileRequirementTasks` in `handoff/src/lib/requirement-tasks.ts` |
| The brief is an `agent.task_brief` activity and shows under the title. | `CardFace` in `handoff/src/app/work/board.tsx` |
| The work wake runs a card only when it has a current skill. A card with no skills stays in Describe. | `eligible` in `handoff/src/lib/client-plan.ts` |
| A workflow created from a live pack writes that pack's skill steps onto its own task, in Describe. | `createClientWorkflow` and `workflowTaskPlan` in `handoff/src/lib/client-workflows.ts` |
| Moving a card to Run schedules a swarm only when the first skill path maps to a pack template id. Otherwise the column changes and nothing is scheduled. | `moveTaskStage` → `scheduleTaskSwarm` |
| The `due` wake starts that workflow, and if it is still running schedules `refreshSwarm`. A finished run with real output is saved in the client space and filed as an unpublished document. | `continueWork` and `refreshSwarm` in `handoff/src/agent/worker.ts`, `claimDueWorkflow` in `client-workflows.ts` |
| Chat `run_workflow` starts the orchestrator immediately, stores "still going", and does not schedule `refreshSwarm`. | `runWorkflow` in `handoff/src/lib/hq-tools.ts` |
| The brief sent on a due run is the client name, site, industry, notes, and "Scheduled run of {workflow name}". It does not include the task brief. The draft deliverable is saved with `project_id` null. | `claimDueWorkflow` |
| `scheduleTaskSwarm` creates the workflow without the task's `project_id`. | `scheduleTaskSwarm` |
| Lead pack choice falls back to the schema readiness pack when nothing overlaps. | `pickSkillPack` in `handoff/src/lib/pack-picker.ts` |

## The hole

A manual project and a chat swarm are two different starts.

1. Requirement cards have a brief and no pack, so Run does not schedule anything and the wake skips them.
2. Chat creates a second project and a second card, then starts a swarm that never writes the space file or the deliverable.
3. The due path, which does write those artifacts, sends a lead brief and files the document on no project.
4. Nothing on the card tells staff the pack is missing, or gives them one press that runs the pack.

## Locked decisions

1. **One pack per card.** The matcher returns one live pack id, or none. A task that needs two packs becomes two cards. This slice does not add a multi-pack runner.
2. **No match leaves the card alone.** Do not fall back to the schema readiness pack. That fallback stays on leads.
3. **The pack is the template's skill steps.** After a pack is chosen, load `/api/template?id=` and store `workflowTaskPlan` on `skills_json`. `scheduleTaskSwarm` and the card Details already read that shape. No new column and no new table.
4. **Do not replace a pack that is already on the card.** A later requirements save can fill a brief. It does not overwrite `skills_json`.
5. **Run swarm is `moveTaskStage` to `run`.** The button, the drag, and `set_task_stage` call that function. The button is the affordance on a card that already has a pack.
6. **Chat joins that start.** `run_workflow` on a workflow that has a task moves that task to Run. It does not call `runClientWorkflow` a second time. A workflow with no task still starts inline, and then schedules the same `refreshSwarm` follow-up the due wake schedules.
7. **The swarm brief is the task.** When the workflow has a `task_id`, the due brief is the task title, the `agent.task_brief` body, and the project requirements. The lead brief stays for a workflow with no task.
8. **The artifacts belong to the project.** `scheduleTaskSwarm` copies the task's `project_id` onto the workflow. The space file and the unpublished document use that project. Staff still publish before the client sees the document.
9. **A finished run with real output marks the card done.** `refreshSwarm` calls `moveTaskStage` to `done` after the file and the document are written. A failed run leaves the card in Run and writes the error as a note. It does not start another run.
10. **Staff press the button.** Saving requirements does not start the swarm.
11. **Staff can attach a pack by hand.** The card menu lists live packs. Choosing one writes the same skill steps the matcher writes.
12. **No new env var, no new worker, no client-portal control.**

## Ready

**Run swarm** shows when all of these are true:

- `status` is not `done`
- `skills_json` has a first step whose path `packTemplateId` resolves
- no `swarm_runs` row for that task's workflow is `running`

The label names the pack. While a run is `running`, the button is hidden and the card says the run is still going. After `done`, the button stays hidden.

A card with no pack keeps "No skills on this card." and shows **Choose pack** instead of **Run swarm**.

## Flow

```
Save requirements
  → file tasks and briefs (unchanged)
  → for each open card on that project with no pack:
        pick one live pack from title + brief
        store that template's skill steps
Run swarm
  → moveTaskStage to run
  → scheduleTaskSwarm (same task, same project, due now)
  → wake due
  → claimDueWorkflow sends the task brief
  → still running: refreshSwarm
  → completed with output: space file, unpublished document, card done
```

Pack choice, in order:

1. Load live pack templates (`id` starts with `pack-`). The same list `list_swarm_packs` returns.
2. Ask the requirements model for one id from that list, given the task title and brief. An id outside the list is ignored.
3. If the model is empty or fails, score the title and brief against pack name and description with the same word overlap as `pickSkillPack`, and return the best score above zero.
4. Score zero stores nothing.

The save message names the outcome: how many tasks were added, how many briefs were written, and how many packs were matched. A model failure still saves the requirements and the tasks.

## Screens

The button and the pack name live on `CardFace`, so the project board, the client Work tab, and `/work` show them together.

The project requirements form does not grow a second control. The save result is the sentence above.

## Tests

- A title and brief that overlap one pack store that pack's skill steps. A second save does not replace them.
- No overlap stores no skills and does not call the schema readiness pack.
- A model id outside the live list is dropped. The word overlap result is kept.
- The button predicate is true only for an open card with a resolved pack and no running swarm.
- `scheduleTaskSwarm` writes the task's `project_id` on the new workflow.
- A due run whose workflow has a task sends the task brief, not the lead brief.
- `run_workflow` for a workflow with a task only moves that task to Run.
- A completed refresh writes the space file, the unpublished document on that project, and moves the card to done. A failed refresh leaves the card in Run.

## Out of scope

- Starting the swarm on save, without the button.
- Running two packs on one card.
- The Build column and Cursor cloud runs.
- Showing the button on the client portal.
- Closing the swarm that chat already started, or deleting the extra project that chat created.
