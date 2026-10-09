# Project swarm runs — design specification

**Date:** 2026-10-09
**Product:** Handoff HQ (`hq.abra-ca-dabra.app`) and the swarm worker
**Status:** Proposed, implementation-ready
**Requirements:** SWR-001 through SWR-018
**Lives in:** [`handoff/`](../../../handoff/) and [`swarm/`](../../../swarm/)
**Plan:** [`docs/superpowers/plans/2026-10-09-project-swarm-runs.md`](../plans/2026-10-09-project-swarm-runs.md)

## Executive summary

Staff can already start a swarm for a client. After it finishes, the only record is a short timeline line, and the Swarm page always opens a blank canvas. The run itself is still on the swarm worker. This spec stores each run on the client and on a project when we know which one, and lets staff open that exact run again.

```text
a lead wake, a workflow run, or a scheduled run
  → one swarm_runs row (client, project when known, execution id, status)
  → project page lists the runs for that project
  → client Work tab lists runs that have no project yet
  → Open loads the swarm canvas at ?executionId=
  → the canvas paints the saved graph, outputs, and artifacts
  → a run that is still going keeps the live socket
```

Clients do not see this list. The timeline note stays.

## Current state

Checked against the code on 2026-10-09.

- The swarm worker routes every `/api/*` call to one Durable Object named `orchestrator` (`swarm/src/index.ts`).
- That object stores each execution under `ex:{id}` and each workflow under `wf:{id}`. On startup it loads both back into memory (`swarm/src/do/WorkflowDO.ts`).
- `GET /api/status?id=`, `GET /api/get?id=`, and `GET /api/artifacts?executionId=` already return a past run. `GET /api/ws?executionId=` is the live socket.
- The swarm canvas (`swarm/frontend/src/App.tsx`) keeps `executionId` in React state. A fresh visit has no id, so the board is empty. Nothing reads the query string.
- HQ embeds that origin in `handoff/src/app/swarm/swarm-frame.tsx` with no execution id. Focus and Open already exist. Open goes to the bare origin.
- Handoff writes `activities.kind = 'agent.swarm_run'` from `recordSwarmRun` (`handoff/src/db/agent-work.ts`), from `runWorkflow` (`handoff/src/lib/hq-tools.ts`), and from `claimDueWorkflow` (`handoff/src/lib/client-workflows.ts`). The JSON has `executionId`, `packId`, `packName`, and `trigger`. It has no `project_id`.
- `client_workflows` stores only `last_execution_id` and `last_status`, so a repeat replaces the previous id.
- `client_workflows.project_id` is set when staff assign the workflow to a project. Lead qualification (`qualifyLead`) has no project.
- Saved output files use `agent/swarm/{run}/{node}.md` (`workflowSpacePath` in `handoff/src/lib/workflow-files.ts`). The `{run}` segment is the execution id with characters outside `[a-z0-9]` turned into hyphens.
- An admin reset of the swarm worker deletes Durable Object storage and the R2 prefixes listed in `swarm/src/admin/reset.ts`. After that, `/api/status` cannot reload the graph. This spec does not copy a snapshot to R2. That is a later slice (see Deferred).

## Goals

- Every swarm start that HQ or the agent records is a row staff can find later.
- A project page lists the runs for that project, newest first.
- Opening a run shows that run, not a blank canvas.
- A finished run is read-only. A running run stays live.
- A run with no project stays on the client until staff attach it.
- A client with exactly one open project receives lead and scan runs on that project.
- Old timeline rows that already have an execution id are copied in once.

## Non-goals

- Rebuilding the swarm editor.
- Moving execution storage out of the Durable Object.
- Showing the swarm to the client.
- Copying a full node-by-node snapshot into R2 (deferred).
- Changing who may start a swarm.

## Requirements

### Record

- **SWR-001.** Each start writes one `swarm_runs` row for the client.
- **SWR-002.** The same `execution_id` updates that row. It does not insert a second row.
- **SWR-003.** A start that returns no execution id is stored with status `failed` or `not_started` and a null execution id. It has no Open link.
- **SWR-004.** A run that comes from a client workflow copies that workflow's `project_id` when it is set.
- **SWR-005.** A lead or scan run with no workflow project attaches to the client's only open project. Open means status `planned`, `active`, or `waiting_on_client`. Zero or many open projects leave `project_id` null.
- **SWR-006.** The existing `agent.swarm_run` timeline note is still written.
- **SWR-007.** `client_workflows.last_execution_id` is still updated.

### Find and attach

- **SWR-008.** The project page lists that project's runs, newest first: name, status, trigger, and time.
- **SWR-009.** The client Work tab lists runs whose `project_id` is null, with the same columns, plus a control to attach the run to one of that client's projects.
- **SWR-010.** Attach refuses a project that belongs to a different client.
- **SWR-011.** Only staff can list or attach runs.

### Open

- **SWR-012.** Each row with an execution id links to `{SWARM_ORIGIN}/?executionId={id}` inside the HQ frame and in a new tab.
- **SWR-013.** The swarm canvas reads `executionId` from the query string, loads `/api/status` and `/api/get`, paints node status and output, and loads `/api/artifacts`.
- **SWR-014.** When status is `running`, the canvas opens the existing websocket for that id. When status is `completed` or `failed`, it does not open a socket and it does not start a new run.
- **SWR-015.** An unknown execution id shows an error in the canvas. The board stays empty.

### History

- **SWR-016.** A one-time backfill copies `agent.swarm_run` activities that have an `executionId` into `swarm_runs`. Project id comes from the workflow named in the activity when that workflow has one, otherwise from SWR-005.
- **SWR-017.** The same backfill copies `client_workflows.last_execution_id` when that id is not already a row.
- **SWR-018.** Backfill is safe to run twice. The second run inserts nothing.

## Data model

Migration `handoff/migrations/0016_swarm_runs.sql`. The same text is added to `handoff/src/db/migration-sql.ts`, and `handoff/src/db/migrate.ts` gains a step whose table is `swarm_runs`.

```sql
CREATE TABLE swarm_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  workflow_id TEXT REFERENCES client_workflows(id),
  swarm_workflow_id TEXT,
  execution_id TEXT,
  template_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'not_started')),
  trigger TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE UNIQUE INDEX swarm_runs_execution
  ON swarm_runs (execution_id)
  WHERE execution_id IS NOT NULL AND length(execution_id) > 0;

CREATE INDEX swarm_runs_project_started
  ON swarm_runs (project_id, started_at);

CREATE INDEX swarm_runs_org_started
  ON swarm_runs (organization_id, started_at);
```

`name` is the pack name or the workflow name, at most 120 characters. `trigger` is the same string already stored on the activity (`lead_created`, `scan_ready`, `chat`, `due`, or the wake reason). `swarm_workflow_id` is the id sent to `/api/execute`, such as `client-{workflowId}` or `lead-{wakeId}`. `finished_at` is set when status becomes `completed` or `failed`.

## Write path

One function, `saveSwarmRun`, in `handoff/src/lib/swarm-runs.ts`.

```ts
saveSwarmRun(sql, {
  organizationId,
  projectId,       // optional; ignored when it is not this client's project
  workflowId,      // optional Handoff workflow id
  swarmWorkflowId, // optional id sent to the swarm
  executionId,     // optional
  templateId,
  name,
  status,
  trigger,
  now,
})
```

Resolution order for `project_id`:

1. The caller `projectId` when that project belongs to `organizationId`.
2. `client_workflows.project_id` for `workflowId` when that workflow belongs to the same client.
3. The only open project for the client (SWR-005).
4. Null.

When `executionId` is non-empty and a row already has it, update `status`, `finished_at`, `name`, `trigger`, and fill any null `project_id`, `workflow_id`, or `swarm_workflow_id`. Do not move a run off a project it already has.

Call `saveSwarmRun` from:

- `recordSwarmRun` in `handoff/src/db/agent-work.ts` (lead qualification and the refresh poll).
- `runWorkflow` in `handoff/src/lib/hq-tools.ts` (staff chat).
- `claimDueWorkflow` in `handoff/src/lib/client-workflows.ts` (the schedule).

`recordSwarmRun` does not know the swarm workflow id. Pass `swarmWorkflowId` when the caller has it. The lead path can pass `lead-{requestId}` only when that value is the one sent to `/api/execute`. `runClientWorkflow` uses `client-{workflow.id}`. Thread that string through the activity `data.swarmWorkflowId` so the refresh poll can store it. If it is missing, leave the column null. Opening still works from `executionId` alone, because `/api/status` returns `workflowId`.

Status mapping before insert:

| Incoming | Stored |
| --- | --- |
| `completed` | `completed` |
| `failed` | `failed` |
| `running` | `running` |
| `not_started` | `not_started` |
| anything else | `failed` |

`finished_at` is `now` for `completed` and `failed`. It stays null for `running` and `not_started`.

## Read and attach

```ts
listProjectSwarmRuns(sql, caller, projectId): Promise<SwarmRunRow[]>
listUnassignedSwarmRuns(sql, caller, organizationId): Promise<SwarmRunRow[]>
assignSwarmRun(sql, caller, { runId, projectId }, now): Promise<{ ok: true } | { ok: false; error: "forbidden" | "missing" }>
```

Staff only. A missing project, a missing run, or a project on another client returns `missing`. Assign sets `project_id` and does not change status.

`swarmRunHref(origin, executionId)` returns `` `${origin}/?executionId=${encodeURIComponent(executionId)}` ``. A blank execution id returns null.

## Backfill

`backfillSwarmRuns(sql, now)` reads activities where `kind = 'agent.swarm_run'` and `json_extract(data_json, '$.executionId')` is a non-empty string. For each, call `saveSwarmRun` with the activity's organization, pack name, status, trigger, execution id, template id, and `workflowId` from the JSON when present. `started_at` is the activity `created_at`. Then do the same for each `client_workflows.last_execution_id` that is non-empty, using the workflow name, template, project, and `last_status` (mapped as above; a null status becomes `running`).

Call it once from `migrate` after the `0016` step, inside the same process, not as a second migration file. It must be idempotent (SWR-018).

## Swarm canvas

Add `executionIdFromSearch(search: string): string | null` in `swarm/frontend/src/lib/execution-link.ts`. It reads the `executionId` query parameter and returns null when it is missing or blank.

On mount, `App` calls it with `window.location.search`. When it returns an id:

1. `GET /api/status?id=`
2. If the body has `error` or no `workflowId`, set an error string and stop.
3. `GET /api/get?id={workflowId}` and replace nodes, edges, and the input with `execution.input`.
4. For each entry in `execution.results`, set that node's status and output.
5. `GET /api/artifacts?executionId=` and show the panel when the list is non-empty.
6. If `execution.status === 'running'`, open the websocket already used by `executeWorkflow`. Otherwise leave `isExecuting` false.

The Execute button stays. Using it starts a new run and clears the query id from the board's state. It does not delete the old row in Handoff.

## HQ screens

**Project** (`handoff/src/app/projects/[id]/page.tsx`). A card titled "Swarms" under the task card. Empty copy: "No swarms on this project yet." Each row is a link through `SwarmFrame`'s origin helper: name, a status word, the trigger, and the relative time. The frame is not embedded on the project page. The link goes to `/swarm?executionId=`. The swarm page reads that query and passes it to `SwarmFrame`.

**Swarm page** (`handoff/src/app/swarm/page.tsx`). `searchParams.executionId` is appended to the iframe `src`. Open uses the same URL.

**Client Work tab** (`handoff/src/app/clients/[id]/work-tab.tsx`). A second card, "Swarms not on a project", listing `listUnassignedSwarmRuns`. Each row has the same link and a small form: a project select and "Put on project", posted to `assignSwarmRunAction`.

No new nav item. The existing Swarm nav item remains the blank canvas when opened with no query.

## Permissions

`listProjectSwarmRuns`, `listUnassignedSwarmRuns`, and `assignSwarmRun` return nothing or `forbidden` unless `caller.staff` is set, matching `organizationById`. The project page and the client page already call `requireHqStaffPage`. The swarm worker's `/api/status` and `/api/get` stay as they are today: the HQ iframe loads them from the staff browser. This spec does not add a new auth layer on the swarm worker.

## Failure

- The swarm worker is down when staff open a run. The canvas shows the error from SWR-015. The Handoff row remains.
- Status is `running` but the socket never opens. The canvas still shows the last saved node results from `/api/status`.
- Admin reset wiped the Durable Object. The row and the link remain. The canvas shows the SWR-015 error. Restoring the graph after a reset is the deferred snapshot.

## Deferred

**SWR-019.** When a run reaches `completed` or `failed`, write `traces/{executionId}.json` to the swarm `ARTIFACTS` bucket with status, input, workflow id, and each node's status and output. The canvas reads that file when `/api/status` misses. Not part of the implementation plan for this spec.

## Verification

- `npx vitest run src/lib/swarm-runs.test.ts` in `handoff/` covers save, update, project resolution, assign, list, and backfill.
- `node --test frontend/src/lib/execution-link.test.mjs` in `swarm/` covers the query parser.
- `npx vitest run` in `handoff/` stays green.
- `npm test` in `swarm/` stays green.
- After deploy, a staff session on a project with a stored execution id opens `/swarm?executionId=` and the iframe shows that run's nodes.
