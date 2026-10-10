# Kanban boards: project, client, studio

**Status:** built on the staff host. Drag and the move menu call the same stage change.
**Updated:** 2026-10-09
**Amends:** [hq-agent-spec.md](hq-agent-spec.md) sections 12.4 and 12.5, and the Work paragraph in [agency-dashboard-gameplan.md](agency-dashboard-gameplan.md). Those sections stay the description of the screens that exist today.

## Outcome

Staff and the HQ agent share one board.

- A **project board** is the queue for that project. The agent takes the top card.
- A **client board** is the same cards for every project that client has.
- A **studio board** is the same cards for every project of every client.

A card is one `tasks` row. Moving it between clients does not copy it. Filtering it does not create a second row.

The client portal does not get this board. Clients still review finished work at `/w/[slug]/work`.

## What is already true

| Fact | Where |
|---|---|
| A task belongs to a client (`organization_id`) and may belong to a project (`project_id`). | `handoff/migrations/0005_crm.sql` |
| Staff status is `todo`, `doing`, `blocked`, `done`. | `tasks.status` |
| Agent stage is `describe`, `engineer`, `build`, `run`. | `handoff/migrations/0007_agent.sql` |
| `/work` is a table of open tasks, grouped by person or client, filtered by late, this week, or blocked. | `handoff/src/app/work/page.tsx`, `listWork` in `handoff/src/db/crm.ts` |
| A project page lists milestones, a task table, and deliverables. | `handoff/src/app/projects/[id]/page.tsx` |
| A client Work tab lists projects and a flat task list. The task query does not return `project_id` or `stage`. | `handoff/src/app/clients/[id]/work-tab.tsx`, `TASK_COLUMNS` in `crm.ts` |
| Leads already have a column board. A menu moves a deal. There is no drag library. | `handoff/src/app/leads/board.tsx` |
| Moving a task to `build` starts a Cursor cloud run, and only through that gate. | `startBuild` in `handoff/src/lib/cursor-build.ts`, called from `setTaskStage` (`handoff/src/lib/hq-tools.ts`) and from `handoff/src/db/agent-work.ts` |
| Moving a task to `run` schedules a swarm pack when the task has one, then wakes `due`. | `setTaskStage` |
| A `work` wake runs one skill step on each eligible task, at most eight, then reschedules. It skips `done`, `build`, and `run`. | `advanceClientWork` in `handoff/src/lib/client-plan.ts` |
| The wake is one Durable Object per client, not one queue for the studio. | `ClientAgent` in `handoff/src/agent/worker.ts` |
| `client_context` returns every task for the client, but the project on that picture is the single most recently updated project. | `clientContext` in `handoff/src/lib/agent-context.ts` |
| Planning new tasks attaches them to that one project. | `planClientWork` |

`listWork` does not select `stage`, `position`, `blocked_reason`, `skills_json`, `round`, `created_by_kind`, or `cursor_agent_id`. The project task table cannot show the agent's column today.

## The hole

Three screens show tasks, and none of them is the queue the agent reads.

1. The agent does not read `/work`, the project page, or the client Work tab. It reads `client_context`.
2. A client with two projects gets new planned tasks on whichever project was saved last.
3. There is no order inside a column. `advanceClientWork` walks tasks in `updated_at` order, so a card someone just touched jumps the queue.
4. A task with no project still sits on the client list. The agent can advance it, and the work lands on no project board.
5. Staff change status in `updateTask` (`crm.ts`) and change stage in `setTaskStage`. Those are different writes. A board that called the status action would not start a build.

## Locked decisions

1. **One row.** Rollup is a query. Do not add a board table, a copy of the card, or a parent card.
2. **Columns are stages.** The agent already moves work by stage. Status stays a mark on the card. `blocked` is not a column. `done` is a column because that is how a card leaves the queue.
3. **One move function.** A staff move, a chat `set_task_stage`, and an agent `update_task` that changes stage all call the same server function. The build gate and the run-schedule stay inside it.
4. **The agent pulls the top card.** Order is `position` inside the column. Staff reorder by changing `position`. The next wake uses that order.
5. **Each client agent reads that client's board.** The studio board is a staff view. It does not create one studio-wide worker.
6. **A card the agent will execute has a project.** Tasks with `project_id` null stay visible on the client and studio boards and are skipped by the wake.
7. **Planning stops guessing the project.** `planClientWork` uses the brief deliverable's `project_id` when it has one, otherwise the only project in `planned`, `active`, or `waiting_on_client`. If there are two or more, it asks staff and creates no task. It does not use "latest `updated_at`".
8. **First screen matches the leads board.** Columns, a count, and a menu to move. Drag comes after that menu calls the real move. No new drag dependency in the first slice.
9. **No new env var, no new worker, no client-portal route.**

## Columns

A card is in exactly one column.

| Column | Rule |
|---|---|
| Describe | `stage = 'describe'` and `status != 'done'` |
| Engineer | `stage = 'engineer'` and `status != 'done'` |
| Build | `stage = 'build'` and `status != 'done'` |
| Run | `stage = 'run'` and `status != 'done'` |
| Done | `status = 'done'` |

`status = 'blocked'` keeps the card in its stage column and shows `blocked_reason`.

Done is `status`, not a new stage. A finished build is already `status = 'done'` and `stage = 'run'` (`cursor-build.ts`). That card is in Done, not in Run. Run holds cards that are still open: a swarm pack waiting on `due`, or a review that has not been marked done.

Describe and Engineer are the columns `advanceClientWork` pulls from. Build is the cloud-run column. The work wake does not pull Build or Run. That rule stays.

## Three boards, one query

`boardCards(tasks)` in `handoff/src/lib/board-model.ts` places each task in one column and sorts by `position`, then `created_at`. The page decides the scope before that function runs.

| Board | Route | Scope |
|---|---|---|
| Project | `/projects/[id]` | `project_id = that project` |
| Client | `/clients/[id]?tab=work` | `organization_id = that client` |
| Studio | `/work` | every task on a client that is not archived |

Filters are query params, not new routes.

- Client board: `?project=<id>` keeps one project's cards. Chips list each project and its open count. "No project" is a chip for `project_id` null. Each chip also opens `/projects/[id]`. The client Overview lists the same projects, with status and the requirements note.

- Studio board: `?client=<id>&project=<id>` narrows the same way. Late, this week, and blocked stay as filters (`?late=1`, `?week=1`, `?blocked=1`). They are not columns.
- Group by person and group by client go away on `/work`. The column is the group. The card shows the client and the project.

Column header count is the number of cards in that column after the filter. That is the rollup. A client column count is the sum of that stage across the client's projects. A studio column count is the sum across clients.

Paused, done, and cancelled projects stay on their own project page. The client and studio boards hide their open cards unless the filter names that project. The agent skips those projects the same way it skips a paused client.

Done shows the 30 most recent `done_at` cards. Older done cards stay in the database and are not a second board.

## How the agent executes from the board

The wake stays per client. What changes is which card it takes.

1. `clientContext` returns every non-archived project, not one. Each task includes `projectId` and `position`.
2. A pure function `nextSteps(cards, budget)` picks the work:
   - Drop cards that are done, blocked with no new answer, in `build` or `run`, missing a project, or on a paused, done, or cancelled project.
   - Group the rest by project.
   - Sort each group by `position`, then `created_at`.
   - Hand out one card per project, then a second, until `budget` (8) or the groups are empty.
3. `advanceClientWork` runs those cards in that order and still does one skill step each. A client with three active projects no longer spends all eight steps on whichever task was saved last.
4. Starting a step sets `status = 'doing'` in the same column. Finishing the last non-plan step sets `status = 'done'` and `stage = 'run'`, which places the card in Done.
5. A plan step still writes `build-brief.md` and moves the card to Build through the shared move. `startBuild` either starts the run, waits on `max_cloud_runs`, or blocks with the existing reason (`link_a_repo`, `missing_build_brief`, and the rest). A refused build leaves the card in the column it left, and leaves the plan skill to do, so answering the question lets the next wake try the move again. The plan skill is marked done only after the card is in Build. The cloud run uses the latest `build-brief.md` on the deliverable.
6. Staff notes on a card (`staff.instruction`) still arrive on that task in `client_context`. Order does not throw them away.
7. The minute cron still wakes each client that has open work. The studio board does not need its own cron.

`eligible` in `client-plan.ts` remains the per-card rule. `nextSteps` is the order across projects. Tests cover both.

## Moves

New function `moveTaskStage` in `handoff/src/lib/task-stage.ts` (name can match the file the implementation chooses; the behavior is the contract).

Callers:

- `setTaskStage` in `hq-tools.ts`
- the stage branch of `updateTask` in `db/agent-work.ts`
- a staff server action used by the board menu

Behavior:

| Move | Effect |
|---|---|
| To Describe, Engineer | Set `stage`. Clear `blocked_reason` only when the caller is not setting blocked. Append the card at the end of that column unless a `position` was passed. |
| To Build | Call `startBuild`. On failure, do not change stage. On `cap_reached`, stage may already be `build` with status `todo`, which is the waiting card the board shows in Build. |
| To Run | Set `stage = 'run'`, then the existing swarm schedule and `due` wake. |
| To Done | Set `status = 'done'` and `done_at`. Leave `stage` as it is. |
| Out of Done | Set `status = 'todo'`, clear `done_at`, set the target stage through the same function. A move to Build that starts or resumes a run sets `status = 'doing'` and clears `done_at`. A move that waits on the cap sets `status = 'todo'` and clears `done_at`. |
| Reorder inside a column | Rewrite `position` for that column's scope: `(organization_id, ifnull(project_id, ''), column)`. |
| Block | Set `status = 'blocked'` and `blocked_reason`. The card stays in its stage column. |

Every successful move writes the activity the callers write today (`staff.task_stage` or `agent.*`). A repeated move to the same stage only rewrites `position` when the caller sent one.

The project task form and the client task form create the card in Describe at the end of that column. Creating a task on a client with no project selected leaves `project_id` null. A project chip on the client Work tab sets `project_id`. The form on a project page sets `project_id`.

## Card

Same face on all three boards. The project board hides the project line. The client board hides the client line.

- Title
- Status dot (`todo`, `doing`, `blocked`)
- Round, when `round > 1`
- Bot mark when `created_by_kind = 'agent'`
- Skill progress: done steps / all steps, from `skills_json`
- Due, red when late
- Blocked reason, and the one clearing action already named in the agent spec (pick a repo, retry the repo, approve the brief, answer the question, retry the run)
- In Build: elapsed time, `n / max_cloud_runs` is a column note rather than a per-card note, and the PR link when `cloud_runs` has one
- Client name links to `/clients/[id]`. Project name links to `/projects/[id]`.

The menu moves to the other columns, blocks, and reorders up or down one place. A drawer, the same pattern as the leads card menu, shows the skill checklist and the latest `agent.*` activities for that task. That drawer is the second slice, after the columns render real cards.

Empty column copy is one sentence: "Nothing in Describe." An empty project board still shows the five columns and Add a task.

## Screens

**Project.** Replace the tasks `DataTable` on `/projects/[id]` with the board. Keep milestones, deliverables, status, repos, and people.

**Client.** Replace the task list in `work-tab.tsx` with the board. The project list becomes the filter chips. Add a task still exists. Add a project still exists.

**Studio.** Replace the table on `/work` with the board. Keep the late / this week / blocked counts. `workCounts` keeps counting; the chips filter the board.

**Today.** No new board. A task link still opens the project board, or the client board when the task has no project.

**Nav counts.** Unchanged: late or blocked open tasks.

## Schema

Migration `handoff/migrations/0018_task_position.sql`:

```sql
ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
CREATE INDEX tasks_board ON tasks (organization_id, project_id, stage, status, position);
```

Register it in `handoff/src/db/migrate.ts` and copy the SQL into `handoff/src/db/migration-sql.ts`, the same way `0015_mcp_catalog.sql` is registered. The column check is `tasks.position`.

Backfill in the migration is not required beyond the default `0`. The first read treats equal positions as `created_at` order. The first reorder writes unique positions.

`WORK_COLUMNS` gains `stage`, `position`, `blocked_reason`, `skills_json`, `round`, `created_by_kind`, `cursor_agent_id`, and the project name. `listWork` and `listProjectTasks` use that list. `TASK_COLUMNS` used by the client task list is replaced by the board query, so the client tab no longer depends on the short column list.

No change to the stage CHECK. No change to `cloud_runs`.

## Build order

Each slice is a failing test, then the code, then the screen that calls it. Do not start the next slice while the current tests are red.

1. **Place cards.** `boardCards` and `nextSteps`. No SQL. Tests for the column rules, done-versus-run, blocked staying in its stage, equal `position`, the 8-step round-robin, and skipped projects.
2. **Read the board.** `listBoard` in `crm.ts` for the three scopes, including no-project cards and archived clients excluded. Extend `clientContext` so tasks carry `projectId` and `position`, and projects are the full list.
3. **Move.** `moveTaskStage` with the build gate and the run schedule. Tests: Build without a brief does not change stage; Run with a pack schedules; Done sets `status` and leaves `stage`; reorder rewrites `position` only inside that column.
4. **Wire the callers.** `setTaskStage` and the agent stage update call `moveTaskStage`. Existing `cursor-build` and `hq-tools` tests stay green.
5. **Stop guessing the project.** `planClientWork` uses the brief's project, the only active project, or `ask_staff`. A test with two projects creates no task and does not attach to the newer one.
6. **Agent order.** `advanceClientWork` uses `nextSteps`. A test with two projects and three eligible cards in the first project advances the first card of each project before the second card of the first.
7. **Project board.** Server page loads `listBoard`. Client component matches `leads/board.tsx`. Menu calls the staff action.
8. **Client board and studio board.** Same component. Chips and the existing late / week / blocked filters.
9. **Drawer.** Skills checklist and recent agent activity.
10. **Drag.** Only if the menu is already the real move. The drop calls that same action.

## Tests to add

| Test | Proves |
|---|---|
| `boardCards` puts a done+run card in Done and an open run card in Run | Column rule |
| `boardCards` leaves a blocked describe card in Describe | Blocked is a mark |
| `nextSteps` round-robins two projects and stops at 8 | The agent queue |
| `nextSteps` skips a null project, a paused project, and a build card | What the agent will not take |
| `listBoard` for a project excludes the sibling project | Project scope |
| `listBoard` for a client includes every project and the no-project card | Client rollup |
| `listBoard` for the studio includes two clients and excludes an archived client | Studio rollup |
| `moveTaskStage` to build without a brief returns the gate error and does not change stage | The board cannot skip the gate |
| `planClientWork` with two active projects asks and writes no task | No more "latest project" |
| `advanceClientWork` order follows `position` inside a project | The top card is the next card |

Run from `handoff/`:

```bash
npx vitest run src/lib/board-model.test.ts src/lib/client-plan.test.ts src/lib/hq-tools.test.ts src/lib/cursor-build.test.ts src/db/crm.test.ts src/lib/agent-context.test.ts
npx eslint src/app/work src/app/projects src/app/clients src/lib/task-stage.ts src/lib/client-plan.ts src/db/crm.ts src/db/agent-work.ts src/lib/hq-tools.ts src/lib/agent-context.ts
npx tsc --noEmit
```

Add the new test files to that vitest list when they exist. `npm test` in `handoff/` is the full suite before the work is called done.

## Docs to change in the same commits as the code

- `handoff/README.md` — the sentences that say the work page is a grouped table, and that a project page puts tasks on the left. Say the three boards and that the agent takes the top card in Describe or Engineer.
- `handoff/CHANGELOG.md` — one entry per slice, newest first.
- `docs/hq-agent-spec.md` sections 12.4 and 12.5 — replace the chip layout with this column layout once it is on the screen.
- `docs/agency-dashboard-gameplan.md` Work paragraph — point at the three boards.
- Root `README.md` — the Handoff paragraph, if the staff routes it names change meaning.

No `.env.example` change.

## Out of scope

- A board on the client host.
- Deal stages. `/leads` stays the pipeline.
- A new task status or a new stage value.
- Per-project cloud-run caps. The studio cap stays `agent_settings.max_cloud_runs`.
- Undo beyond moving the card back. Money and sent mail stay as they are.
- Rebuilding Today as a board.
- Workflow rows as their own cards. A workflow that has a `task_id` is that task's card.

## Risks

| Risk | What to do |
|---|---|
| Two writes still move a task, and the board calls the status one | Slice 4 deletes the stage write from the old path. A test calls the board action and expects `startBuild`. |
| `position` ties make the queue flicker | Sort by `position`, then `created_at`, then `id`. |
| Build waiting on the cap looks like a stuck card | The Build column shows the waiting reason `cap_reached` on that card. |
| Client context grows because it returns every project | Return id, name, and status only. Milestones stay on the newest project until a later change, or move milestone loading to the project the task names. Do not embed file bodies. |
| Done column hides a card someone still needs | The 30-card cap is only the column. The project page status rail is unchanged. |
