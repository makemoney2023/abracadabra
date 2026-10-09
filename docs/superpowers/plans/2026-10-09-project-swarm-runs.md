# Project swarm runs implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every swarm run on the client and on a project when we know which one, and open that exact run from HQ.

**Architecture:** Handoff writes a `swarm_runs` row from the three places that already record a swarm activity. The project page and the client Work tab list those rows. The Swarm page appends `executionId` to the iframe. The swarm canvas loads `/api/status`, `/api/get`, and `/api/artifacts` for that id and opens the websocket only while the run is still going.

**Tech Stack:** Next.js 16, React 19, Vitest, D1 (SQL migrations applied in memory by `migrate`), the existing swarm Vite app, one Durable Object named `orchestrator`.

**Design:** [`docs/superpowers/specs/2026-10-09-project-swarm-runs-design.md`](../specs/2026-10-09-project-swarm-runs-design.md). Requirements SWR-001 through SWR-018. SWR-019 is deferred and is not a task in this plan.

---

## Repository boundary

Work is in [`handoff/`](../../../handoff/) and [`swarm/`](../../../swarm/) on this branch. Do not add a Cloudflare binding, a secret, or an environment variable. Staff gates stay `requireHqStaffPage`. Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>` with `GIT_AUTHOR_*` and `GIT_COMMITTER_*` on the commit command. Do not change git config.

## File structure

| Path | Responsibility |
| --- | --- |
| `handoff/migrations/0016_swarm_runs.sql` | Table and indexes |
| `handoff/src/db/migration-sql.ts` | Same SQL embedded for the worker |
| `handoff/src/db/migrate.ts` | Step for `swarm_runs`, then backfill |
| `handoff/src/lib/swarm-runs.ts` | Save, list, assign, project resolution, backfill |
| `handoff/src/lib/swarm-runs.test.ts` | Those behaviors |
| `handoff/src/db/agent-work.ts` | `recordSwarmRun` also calls `saveSwarmRun` |
| `handoff/src/lib/hq-tools.ts` | `runWorkflow` also calls `saveSwarmRun` |
| `handoff/src/lib/client-workflows.ts` | `claimDueWorkflow` also calls `saveSwarmRun` |
| `handoff/src/app/swarm/swarm-link.ts` | `swarmRunHref` |
| `handoff/src/app/swarm/swarm-link.test.ts` | Href helper |
| `handoff/src/app/swarm/page.tsx` | Pass `executionId` into the frame |
| `handoff/src/app/swarm/swarm-frame.tsx` | Iframe and Open use that URL |
| `handoff/src/app/projects/[id]/page.tsx` | Swarms card |
| `handoff/src/app/clients/[id]/work-tab.tsx` | Unassigned runs and attach form |
| `handoff/src/app/clients/actions.ts` | `assignSwarmRunAction` |
| `swarm/frontend/src/lib/execution-link.ts` | Read `executionId` from a query string |
| `swarm/frontend/src/lib/execution-link.test.mjs` | Parser |
| `swarm/frontend/src/App.tsx` | Load that run on mount |

## Global constraints

- Status stored in SQL is only `running`, `completed`, `failed`, or `not_started`.
- A second save with the same execution id updates the row.
- Assign never moves a run onto another client's project.
- The timeline activity write stays.
- Do not implement the R2 trace snapshot (SWR-019).

---

### Task 1: Table and `saveSwarmRun`

**Files:**
- Create: `handoff/migrations/0016_swarm_runs.sql`
- Create: `handoff/src/lib/swarm-runs.ts`
- Test: `handoff/src/lib/swarm-runs.test.ts`
- Modify: `handoff/src/db/migrate.ts`
- Modify: `handoff/src/db/migration-sql.ts`

- [ ] **Step 1: Write the failing test**

Create `handoff/src/lib/swarm-runs.test.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { assignSwarmRun, listProjectSwarmRuns, listUnassignedSwarmRuns, saveSwarmRun } from "./swarm-runs";

const NOW = 1_700_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
const outsider: Caller = { userId: "client-1", staff: null, operatorOf: [], memberships: [] };

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
     VALUES ('proj-1', 'org-1', 'Site', 'active', ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

describe("saveSwarmRun", () => {
  it("stores a run on the only open project and updates that same execution", async () => {
    const sql = await database();
    const first = await saveSwarmRun(sql, {
      organizationId: "org-1",
      executionId: "ex-1",
      name: "Schema readiness",
      status: "running",
      trigger: "lead_created",
      now: NOW,
    });
    expect(first.projectId).toBe("proj-1");
    await saveSwarmRun(sql, {
      organizationId: "org-1",
      executionId: "ex-1",
      name: "Schema readiness",
      status: "completed",
      trigger: "lead_created",
      now: NOW + 5,
    });
    const rows = await sql.all<{ n: number; status: string; finished_at: number }>(
      "SELECT count(*) AS n, status, finished_at FROM swarm_runs",
    );
    expect(rows).toEqual([{ n: 1, status: "completed", finished_at: NOW + 5 }]);
  });

  it("leaves the project empty when the client has two open projects and none was named", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
       VALUES ('proj-2', 'org-1', 'Ads', 'planned', ?, ?)`,
      [NOW, NOW],
    );
    const saved = await saveSwarmRun(sql, {
      organizationId: "org-1",
      executionId: "ex-2",
      name: "Pack",
      status: "running",
      trigger: "scan_ready",
      now: NOW,
    });
    expect(saved.projectId).toBeNull();
    expect(await listUnassignedSwarmRuns(sql, staff, "org-1")).toHaveLength(1);
    expect(await listUnassignedSwarmRuns(sql, outsider, "org-1")).toEqual([]);
  });

  it("refuses to attach a run to another client's project", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-2', 'Other', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
       VALUES ('proj-9', 'org-2', 'Theirs', 'active', ?, ?)`,
      [NOW, NOW],
    );
    const saved = await saveSwarmRun(sql, {
      organizationId: "org-1",
      executionId: "",
      name: "Pack",
      status: "not_started",
      trigger: "chat",
      now: NOW,
    });
    expect(await assignSwarmRun(sql, staff, { runId: saved.id, projectId: "proj-9" }, NOW)).toEqual({
      ok: false,
      error: "missing",
    });
    expect(await assignSwarmRun(sql, staff, { runId: saved.id, projectId: "proj-1" }, NOW)).toEqual({ ok: true });
    expect(await listProjectSwarmRuns(sql, staff, "proj-1")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd handoff && npx vitest run src/lib/swarm-runs.test.ts`

Expected: FAIL because `./swarm-runs` does not exist.

- [ ] **Step 3: Add the migration**

Create `handoff/migrations/0016_swarm_runs.sql` with the `CREATE TABLE` and three indexes from the spec. No leading comment: `statementsFromMigration` drops comment-only lines, and D1 rejects a script whose first statement is empty. The file may start with a `--` comment only if the SQL statements follow on their own lines. Prefer no comment so the first statement is `CREATE TABLE`.

In `handoff/src/db/migrate.ts`, append to `STEPS`:

```ts
{ file: "0016_swarm_runs.sql", table: "swarm_runs" },
```

In `handoff/src/db/migration-sql.ts`, add a key `"0016_swarm_runs.sql"` whose string value is the file contents. The worker has no migrations folder at runtime, so a file that is not in this map never runs.

- [ ] **Step 4: Implement `saveSwarmRun`, the two lists, and `assignSwarmRun`**

Create `handoff/src/lib/swarm-runs.ts`:

```ts
import type { Caller } from "@/lib/authz";
import type { Sql } from "@/db/sql";

const STATUSES = new Set(["running", "completed", "failed", "not_started"]);
const OPEN = new Set(["planned", "active", "waiting_on_client"]);

export type SwarmRunRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  workflow_id: string | null;
  swarm_workflow_id: string | null;
  execution_id: string | null;
  template_id: string | null;
  name: string;
  status: string;
  trigger: string;
  started_at: number;
  finished_at: number | null;
};

export type SaveSwarmRunInput = {
  organizationId: string;
  projectId?: string | null;
  workflowId?: string | null;
  swarmWorkflowId?: string | null;
  executionId?: string | null;
  templateId?: string | null;
  name: string;
  status: string;
  trigger: string;
  now: number;
};

function storedStatus(status: string): "running" | "completed" | "failed" | "not_started" {
  return STATUSES.has(status) ? (status as "running" | "completed" | "failed" | "not_started") : "failed";
}

function staff(caller: Caller): boolean {
  return caller.staff !== null;
}

async function projectInOrg(sql: Sql, organizationId: string, projectId: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM projects WHERE id = ? AND organization_id = ?",
    [projectId, organizationId],
  );
  return Boolean(row);
}

async function resolveProject(
  sql: Sql,
  input: SaveSwarmRunInput,
): Promise<string | null> {
  const named = input.projectId?.trim() ?? "";
  if (named && (await projectInOrg(sql, input.organizationId, named))) return named;
  const workflowId = input.workflowId?.trim() ?? "";
  if (workflowId) {
    const workflow = await sql.get<{ project_id: string | null; organization_id: string }>(
      "SELECT project_id, organization_id FROM client_workflows WHERE id = ?",
      [workflowId],
    );
    if (workflow?.organization_id === input.organizationId && workflow.project_id) return workflow.project_id;
  }
  const open = await sql.all<{ id: string; status: string }>(
    "SELECT id, status FROM projects WHERE organization_id = ?",
    [input.organizationId],
  );
  const usable = open.filter((row) => OPEN.has(row.status));
  return usable.length === 1 ? usable[0].id : null;
}

export async function saveSwarmRun(
  sql: Sql,
  input: SaveSwarmRunInput,
): Promise<{ id: string; projectId: string | null }> {
  const status = storedStatus(input.status);
  const executionId = input.executionId?.trim() ?? "";
  const name = input.name.trim().slice(0, 120) || "Swarm";
  const trigger = input.trigger.trim().slice(0, 40) || "lead_created";
  const finishedAt = status === "completed" || status === "failed" ? input.now : null;
  const projectId = await resolveProject(sql, input);
  if (executionId) {
    const existing = await sql.get<{ id: string; project_id: string | null }>(
      "SELECT id, project_id FROM swarm_runs WHERE execution_id = ?",
      [executionId],
    );
    if (existing) {
      await sql.run(
        `UPDATE swarm_runs
         SET status = ?, name = ?, trigger = ?, finished_at = ?,
             project_id = COALESCE(project_id, ?),
             workflow_id = COALESCE(workflow_id, ?),
             swarm_workflow_id = COALESCE(swarm_workflow_id, ?),
             template_id = COALESCE(template_id, ?)
         WHERE id = ?`,
        [
          status,
          name,
          trigger,
          finishedAt,
          projectId,
          input.workflowId?.trim() || null,
          input.swarmWorkflowId?.trim() || null,
          input.templateId?.trim() || null,
          existing.id,
        ],
      );
      return { id: existing.id, projectId: existing.project_id ?? projectId };
    }
  }
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO swarm_runs (
      id, organization_id, project_id, workflow_id, swarm_workflow_id, execution_id,
      template_id, name, status, trigger, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.organizationId,
      projectId,
      input.workflowId?.trim() || null,
      input.swarmWorkflowId?.trim() || null,
      executionId || null,
      input.templateId?.trim() || null,
      name,
      status,
      trigger,
      input.now,
      finishedAt,
    ],
  );
  return { id, projectId };
}

const COLUMNS =
  "id, organization_id, project_id, workflow_id, swarm_workflow_id, execution_id, template_id, name, status, trigger, started_at, finished_at";

export async function listProjectSwarmRuns(sql: Sql, caller: Caller, projectId: string): Promise<SwarmRunRow[]> {
  if (!staff(caller)) return [];
  return sql.all<SwarmRunRow>(
    `SELECT ${COLUMNS} FROM swarm_runs WHERE project_id = ? ORDER BY started_at DESC, id DESC`,
    [projectId],
  );
}

export async function listUnassignedSwarmRuns(
  sql: Sql,
  caller: Caller,
  organizationId: string,
): Promise<SwarmRunRow[]> {
  if (!staff(caller)) return [];
  return sql.all<SwarmRunRow>(
    `SELECT ${COLUMNS} FROM swarm_runs
     WHERE organization_id = ? AND project_id IS NULL
     ORDER BY started_at DESC, id DESC`,
    [organizationId],
  );
}

export async function assignSwarmRun(
  sql: Sql,
  caller: Caller,
  input: { runId: string; projectId: string },
  _now: number,
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "missing" }> {
  if (!staff(caller)) return { ok: false, error: "forbidden" };
  const run = await sql.get<{ organization_id: string }>("SELECT organization_id FROM swarm_runs WHERE id = ?", [
    input.runId,
  ]);
  if (!run) return { ok: false, error: "missing" };
  if (!(await projectInOrg(sql, run.organization_id, input.projectId))) return { ok: false, error: "missing" };
  await sql.run("UPDATE swarm_runs SET project_id = ? WHERE id = ?", [input.projectId, input.runId]);
  return { ok: true };
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd handoff && npx vitest run src/lib/swarm-runs.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
GIT_AUTHOR_NAME='makemoney2023' \
GIT_AUTHOR_EMAIL='124006256+makemoney2023@users.noreply.github.com' \
GIT_COMMITTER_NAME='makemoney2023' \
GIT_COMMITTER_EMAIL='124006256+makemoney2023@users.noreply.github.com' \
git commit -m "Add a swarm_runs row for each swarm execution"
```

---

### Task 2: Write the row from every start path

**Files:**
- Modify: `handoff/src/db/agent-work.ts` (`recordSwarmRun`)
- Modify: `handoff/src/lib/hq-tools.ts` (`runWorkflow`)
- Modify: `handoff/src/lib/client-workflows.ts` (`claimDueWorkflow`)
- Test: extend `handoff/src/lib/client-workflows.test.ts` and `handoff/src/lib/hq-tools.test.ts`

- [ ] **Step 1: Write the failing workflow test**

In `handoff/src/lib/client-workflows.test.ts`, inside the test that already asserts `executionId: "run-9"` (the template run), add after the existing execution assertion:

```ts
const recorded = await sql.get<{ execution_id: string; trigger: string }>(
  "SELECT execution_id, trigger FROM swarm_runs",
);
expect(recorded).toEqual({ execution_id: "run-9", trigger: "due" });
```

That assertion belongs on the scheduled-run test (`claimDueWorkflow`), where `trigger` is `due`. On the manual `runClientWorkflow` test, do not expect a `swarm_runs` row: `runClientWorkflow` only updates `last_execution_id`. The row is written by `claimDueWorkflow` and by `runWorkflow`.

In `handoff/src/lib/hq-tools.test.ts`, find the test that runs `run_workflow` and returns `executionId`. After that call, assert:

```ts
const recorded = await sql.get<{ execution_id: string; trigger: string }>(
  "SELECT execution_id, trigger FROM swarm_runs",
);
expect(recorded).toEqual({ execution_id: expect.any(String), trigger: "chat" });
```

Use the execution id the fake fetch returned. If that test's fake returns `run-1`, expect `run-1`.

- [ ] **Step 2: Run those tests and confirm they fail**

Run: `cd handoff && npx vitest run src/lib/client-workflows.test.ts src/lib/hq-tools.test.ts`

Expected: FAIL on the new `swarm_runs` assertions. The table exists after Task 1, and the row does not.

- [ ] **Step 3: Call `saveSwarmRun` next to each `recordAgentRun` for `agent.swarm_run`**

In `recordSwarmRun` (`handoff/src/db/agent-work.ts`), after `recordAgentRun` returns, call:

```ts
await saveSwarmRun(sql, {
  organizationId: actor.organizationId,
  workflowId: args.workflowId,
  swarmWorkflowId: args.swarmWorkflowId,
  executionId: args.executionId,
  templateId: args.packId,
  name: packName,
  status,
  trigger: args.trigger?.trim() || "lead_created",
  now,
});
```

Add optional `workflowId` and `swarmWorkflowId` to the args type `WorkArgs` if they are not already strings there. `qualifyLead` already sends `executionId`, `packId`, `packName`, `status`, and `trigger` through `record_swarm_run`.

In `runWorkflow` (`handoff/src/lib/hq-tools.ts`), after the existing `recordAgentRun` call:

```ts
await saveSwarmRun(sql, {
  organizationId: row.organization_id,
  workflowId,
  swarmWorkflowId: `client-${workflowId}`,
  executionId: started.ok ? started.executionId : "",
  templateId: row.template_id,
  name: row.name,
  status: started.ok ? started.status : "failed",
  trigger: "chat",
  now,
});
```

In `claimDueWorkflow` (`handoff/src/lib/client-workflows.ts`), after its `recordAgentRun` call:

```ts
await saveSwarmRun(input.sql, {
  organizationId: input.organizationId,
  workflowId: row.id,
  swarmWorkflowId: `client-${row.id}`,
  executionId: started.ok ? started.executionId : "",
  templateId: row.template_id,
  name: row.name,
  status: started.ok ? started.status : "failed",
  trigger: "due",
  now: input.now,
});
```

`runClientWorkflow` uses `workflowId: \`client-${workflow.id}\`` when it calls `runLeadSwarm`. The string above matches that.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd handoff && npx vitest run src/lib/client-workflows.test.ts src/lib/hq-tools.test.ts src/lib/client-plan.test.ts src/db/agent-work.test.ts`

Expected: PASS. `client-plan.test.ts` still sees `record_swarm_run`. If `agent-work` tests insert a swarm run, they now also need the `swarm_runs` table, which `migrate` provides.

- [ ] **Step 5: Commit**

```bash
git commit -m "Record each swarm start on the client's swarm_runs row"
```

Use the same `GIT_AUTHOR_*` and `GIT_COMMITTER_*` exports as Task 1.

---

### Task 3: Backfill

**Files:**
- Modify: `handoff/src/lib/swarm-runs.ts`
- Modify: `handoff/src/db/migrate.ts`
- Test: `handoff/src/lib/swarm-runs.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `describe` in `swarm-runs.test.ts` a new `describe("backfillSwarmRuns")`:

```ts
it("copies a timeline execution once", async () => {
  const sql = await database();
  await sql.run(
    `INSERT INTO activities (
      id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
    ) VALUES ('act-1', 'org-1', 'agent.swarm_run', 'agent', 'swarm', 'Done', ?, ?)`,
    [JSON.stringify({ executionId: "ex-old", packName: "Schema readiness", status: "completed", trigger: "chat" }), NOW],
  );
  const { backfillSwarmRuns } = await import("./swarm-runs");
  expect(await backfillSwarmRuns(sql, NOW + 1)).toBe(1);
  expect(await backfillSwarmRuns(sql, NOW + 2)).toBe(0);
  const row = await sql.get<{ execution_id: string; project_id: string; started_at: number }>(
    "SELECT execution_id, project_id, started_at FROM swarm_runs",
  );
  expect(row).toEqual({ execution_id: "ex-old", project_id: "proj-1", started_at: NOW });
});
```

Import `backfillSwarmRuns` at the top instead of the dynamic import if the test file already imports from `./swarm-runs`. One static import is enough.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd handoff && npx vitest run src/lib/swarm-runs.test.ts`

Expected: FAIL because `backfillSwarmRuns` is not exported.

- [ ] **Step 3: Implement and call it from migrate**

Add to `swarm-runs.ts`:

```ts
export async function backfillSwarmRuns(sql: Sql, now: number): Promise<number> {
  const table = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'swarm_runs'",
  );
  if (!table) return 0;
  const activities = await sql.all<{
    organization_id: string;
    created_at: number;
    data_json: string;
    body: string | null;
  }>(
    `SELECT organization_id, created_at, data_json, body FROM activities
     WHERE kind = 'agent.swarm_run' AND organization_id IS NOT NULL`,
  );
  let inserted = 0;
  for (const activity of activities) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(activity.data_json) as Record<string, unknown>;
    } catch {
      continue;
    }
    const executionId = typeof data.executionId === "string" ? data.executionId.trim() : "";
    if (!executionId) continue;
    const before = await sql.get<{ id: string }>("SELECT id FROM swarm_runs WHERE execution_id = ?", [executionId]);
    if (before) continue;
    const status = typeof data.status === "string" ? data.status : "completed";
    await saveSwarmRun(sql, {
      organizationId: activity.organization_id,
      workflowId: typeof data.workflowId === "string" ? data.workflowId : null,
      swarmWorkflowId: typeof data.swarmWorkflowId === "string" ? data.swarmWorkflowId : null,
      executionId,
      templateId: typeof data.packId === "string" ? data.packId : null,
      name: typeof data.packName === "string" ? data.packName : activity.body || "Swarm",
      status,
      trigger: typeof data.trigger === "string" ? data.trigger : "lead_created",
      now: activity.created_at,
    });
    inserted += 1;
  }
  const workflows = await sql.all<{
    id: string;
    organization_id: string;
    project_id: string | null;
    name: string;
    template_id: string;
    last_execution_id: string | null;
    last_status: string | null;
    updated_at: number;
  }>(
    `SELECT id, organization_id, project_id, name, template_id, last_execution_id, last_status, updated_at
     FROM client_workflows
     WHERE last_execution_id IS NOT NULL AND length(last_execution_id) > 0`,
  );
  for (const workflow of workflows) {
    const executionId = workflow.last_execution_id?.trim() ?? "";
    if (!executionId) continue;
    const before = await sql.get<{ id: string }>("SELECT id FROM swarm_runs WHERE execution_id = ?", [executionId]);
    if (before) continue;
    await saveSwarmRun(sql, {
      organizationId: workflow.organization_id,
      projectId: workflow.project_id,
      workflowId: workflow.id,
      swarmWorkflowId: `client-${workflow.id}`,
      executionId,
      templateId: workflow.template_id,
      name: workflow.name,
      status: workflow.last_status || "running",
      trigger: "due",
      now: workflow.updated_at || now,
    });
    inserted += 1;
  }
  return inserted;
}
```

The `now` parameter is only the fallback clock for a workflow row. Activity rows keep `created_at` as `started_at`. `saveSwarmRun` uses `input.now` as `started_at` on insert, so pass `activity.created_at`.

At the end of `migrate` in `handoff/src/db/migrate.ts`, after every step has been applied:

```ts
const { backfillSwarmRuns } = await import("../lib/swarm-runs");
await backfillSwarmRuns(sql, Date.now());
```

A static import is fine if it does not cycle. `swarm-runs.ts` imports `Sql` and `Caller` only, so a static import from `migrate.ts` is safe. Use that.

- [ ] **Step 4: Run the test**

Run: `cd handoff && npx vitest run src/lib/swarm-runs.test.ts src/db/migrate.test.ts`

Expected: PASS. If `migrate.test.ts` snapshots the step list, add `0016_swarm_runs.sql` to that expectation.

- [ ] **Step 5: Commit**

```bash
git commit -m "Backfill swarm_runs from the timeline and the last workflow execution"
```

---

### Task 4: Swarm canvas loads `executionId`

**Files:**
- Create: `swarm/frontend/src/lib/execution-link.ts`
- Test: `swarm/frontend/src/lib/execution-link.test.mjs`
- Modify: `swarm/frontend/src/App.tsx`

- [ ] **Step 1: Write the failing test**

`swarm/frontend/src/lib/execution-link.test.mjs` uses `node:test`, matching `pack-catalog.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { executionIdFromSearch } from "./execution-link.ts";

test("reads executionId and ignores a blank value", () => {
  assert.equal(executionIdFromSearch("?executionId=ex-1"), "ex-1");
  assert.equal(executionIdFromSearch("?executionId="), null);
  assert.equal(executionIdFromSearch(""), null);
});
```

If the frontend package does not resolve `.ts` from `node --test`, put the function in `execution-link.mjs` and test that file. Keep the export name `executionIdFromSearch`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd swarm && node --test frontend/src/lib/execution-link.test.mjs`

Expected: FAIL, module not found.

- [ ] **Step 3: Implement the parser and the mount effect**

```ts
export function executionIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("executionId");
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
```

In `App.tsx`, add a `useEffect` with an empty dependency array:

```tsx
useEffect(() => {
  const executionId = executionIdFromSearch(window.location.search);
  if (!executionId) return;
  let cancelled = false;
  (async () => {
    const statusResponse = await fetch("/api/status?id=" + encodeURIComponent(executionId));
    const execution = (await statusResponse.json()) as {
      error?: string;
      workflowId?: string;
      input?: string;
      status?: string;
      results?: Record<string, { status?: string; output?: string }>;
    };
    if (cancelled) return;
    if (!statusResponse.ok || execution.error || !execution.workflowId) {
      toast.error("This swarm run is not on the worker anymore.");
      return;
    }
    const workflowResponse = await fetch("/api/get?id=" + encodeURIComponent(execution.workflowId));
    const workflow = (await workflowResponse.json()) as {
      error?: string;
      name?: string;
      nodes?: { id: string; type: string; name: string; instructions: string; position: { x: number; y: number } }[];
      edges?: { id: string; source: string; target: string }[];
    };
    if (cancelled || workflow.error || !workflow.nodes) {
      toast.error("This swarm run is not on the worker anymore.");
      return;
    }
    setWorkflowName(workflow.name || "Swarm");
    setInputText(execution.input || "");
    setExecutionId(executionId);
    setNodes(
      workflow.nodes.map((node) => {
        const result = execution.results?.[node.id];
        const status =
          result?.status === "done" || result?.status === "error" || result?.status === "running"
            ? result.status
            : "idle";
        return {
          id: node.id,
          type: node.type,
          position: node.position,
          data: {
            name: node.name,
            instructions: node.instructions,
            status,
            output: result?.output || "",
            toolsUsed: [],
          },
        };
      }),
    );
    setEdges((workflow.edges || []).map((edge) => ({ ...edge })));
    const arts = await fetch("/api/artifacts?executionId=" + encodeURIComponent(executionId));
    if (!cancelled && arts.ok) {
      const list = await arts.json();
      if (Array.isArray(list) && list.length > 0) {
        setArtifacts(list);
        setShowArtifacts(true);
      }
    }
    if (execution.status === "running") {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws?executionId=${executionId}`);
      wsRef.current = ws;
      setIsExecuting(true);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as WSMessage;
        // Reuse the same node_done / node_error / workflow_complete branches as executeWorkflow.
      };
    }
  })();
  return () => {
    cancelled = true;
  };
}, []);
```

Extract the `ws.onmessage` body from `executeWorkflow` into `applySwarmMessage(msg, setNodes, setArtifacts, setIsExecuting)` in the same file and call it from both places. Do not duplicate the status mapping.

Node `type` values must match the React Flow node types already registered in `App.tsx`. Copy the mapping `executeWorkflow` uses when it builds nodes from a template, if a raw API node type is not a registered type. Read the template load path in `App.tsx` and use that same shape.

- [ ] **Step 4: Run the parser test and the swarm unit tests**

Run: `cd swarm && node --test frontend/src/lib/execution-link.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "Open a stored swarm execution from the executionId query"
```

---

### Task 5: HQ links, project card, and attach

**Files:**
- Create: `handoff/src/app/swarm/swarm-link.ts`
- Test: `handoff/src/app/swarm/swarm-link.test.ts`
- Modify: `handoff/src/app/swarm/page.tsx`
- Modify: `handoff/src/app/swarm/swarm-frame.tsx`
- Modify: `handoff/src/app/projects/[id]/page.tsx`
- Modify: `handoff/src/app/clients/[id]/work-tab.tsx`
- Modify: `handoff/src/app/clients/[id]/page.tsx`
- Modify: `handoff/src/app/clients/actions.ts`

- [ ] **Step 1: Write the failing href test**

```ts
import { describe, expect, it } from "vitest";
import { swarmRunHref } from "./swarm-link";

describe("swarmRunHref", () => {
  it("builds the canvas url and skips a run with no execution", () => {
    expect(swarmRunHref("https://swarm.example/", "ex-1")).toBe("https://swarm.example/?executionId=ex-1");
    expect(swarmRunHref("https://swarm.example", "")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd handoff && npx vitest run src/app/swarm/swarm-link.test.ts`

Expected: FAIL, module not found.

- [ ] **Step 3: Implement the helper, the frame, the cards, and the action**

`swarm-link.ts`:

```ts
export function swarmRunHref(origin: string, executionId: string | null): string | null {
  const id = executionId?.trim() ?? "";
  if (!id) return null;
  const base = origin.replace(/\/$/, "");
  return `${base}/?executionId=${encodeURIComponent(id)}`;
}

export function hqSwarmHref(executionId: string | null): string {
  const id = executionId?.trim() ?? "";
  return id ? `/swarm?executionId=${encodeURIComponent(id)}` : "/swarm";
}
```

`page.tsx` for `/swarm` reads `searchParams: Promise<{ executionId?: string }>` and passes `executionId` to `SwarmFrame`. `SwarmFrame` sets `src` and the Open href to `swarmRunHref(origin, executionId) ?? origin`.

On the project page, load `listProjectSwarmRuns(sql, caller, project.id)` beside the other queries. Render a card:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Swarms</CardTitle>
  </CardHeader>
  <CardContent>
    {runs.length === 0 ? (
      <p className="text-sm text-muted-foreground">No swarms on this project yet.</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {runs.map((run) => (
          <li key={run.id} className="text-sm">
            <Link href={hqSwarmHref(run.execution_id)}>{run.name}</Link>
            <span className="ml-2 text-muted-foreground">{run.status}</span>
            <span className="ml-2 text-muted-foreground">{run.trigger}</span>
          </li>
        ))}
      </ul>
    )}
  </CardContent>
</Card>
```

Place it after the Tasks card.

`assignSwarmRunAction` in `handoff/src/app/clients/actions.ts`:

```ts
export async function assignSwarmRunAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const assigned = await assignSwarmRun(
    sql,
    caller,
    { runId: String(formData.get("runId") ?? ""), projectId: String(formData.get("projectId") ?? "") },
    Date.now(),
  );
  if (!assigned.ok) return fail(assigned.error === "forbidden" ? "You cannot move that." : "Pick a project on this client.");
  revalidatePath(`/clients/${organizationId}`);
  revalidatePath(`/projects/${String(formData.get("projectId") ?? "")}`);
  return ok("This swarm is on that project.");
}
```

The Work tab receives `unassignedRuns` and `projects` from `clients/[id]/page.tsx`. The form posts `runId`, `projectId`, and `organizationId`. The select lists that client's projects. Empty copy: "Every swarm is on a project."

- [ ] **Step 4: Run the tests**

Run: `cd handoff && npx vitest run src/app/swarm/swarm-link.test.ts src/lib/swarm-runs.test.ts && npx eslint src/app/swarm/page.tsx src/app/swarm/swarm-frame.tsx src/app/projects/[id]/page.tsx src/app/clients/[id]/work-tab.tsx src/app/clients/actions.ts src/lib/swarm-runs.ts`

Expected: tests PASS, ESLint reports no errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "Open a project's swarm runs from the staff project and client pages"
```

---

### Task 6: Docs

**Files:**
- Modify: `handoff/CHANGELOG.md`
- Modify: `handoff/README.md` (the Agent section)

- [ ] **Step 1: Changelog entry at the top**

```md
## 2026-10-09

- **What changed** — Each swarm run is stored on the client and on a project when one is known. Staff open that run from the project page.
- **Why** — A finished swarm only left a timeline line, and the Swarm page always opened a blank canvas.
- **Code touchpoints** — `handoff/src/lib/swarm-runs.ts`, `handoff/migrations/0016_swarm_runs.sql`, `handoff/src/app/projects/[id]/page.tsx`, `handoff/src/app/swarm/page.tsx`, `swarm/frontend/src/App.tsx`
- **Data-flow impact** — Start paths write `swarm_runs`. The canvas reads `executionId` from the query string.
- **API / schema impact** — New table `swarm_runs`. No new route and no new secret.
- **Verification** — `npx vitest run` in `handoff`. `npm test` and `node --test frontend/src/lib/execution-link.test.mjs` in `swarm`.
```

Fill the verification line with the counts from the commands you actually ran.

- [ ] **Step 2: One sentence in the Handoff README Agent section**

"A swarm run is stored on the client and, when we know it, on a project. The project page opens that run in the swarm canvas."

- [ ] **Step 3: Commit**

```bash
git commit -m "Document swarm runs on the client project"
```

---

## Self-review

Spec coverage:

| Requirement | Task |
| --- | --- |
| SWR-001, SWR-002, SWR-003, SWR-005 | Task 1 |
| SWR-004, SWR-006, SWR-007 | Task 2 |
| SWR-008, SWR-009, SWR-010, SWR-011, SWR-012 | Task 5 |
| SWR-013, SWR-014, SWR-015 | Task 4 |
| SWR-016, SWR-017, SWR-018 | Task 3 |
| SWR-019 | Deferred. No task. |

Placeholder scan: tasks name files, SQL, function bodies, and commands. The websocket handler in Task 4 tells the implementer to reuse `executeWorkflow`'s message handler rather than invent a second one. That is a pointer at code that already exists in `App.tsx`, not a missing behavior.

Type check: `saveSwarmRun` returns `{ id, projectId }`. Tests use `first.projectId` and `saved.id`. `assignSwarmRun` returns `{ ok: true }` or `{ ok: false, error: "forbidden" | "missing" }`. The action checks `assigned.ok`. `swarmRunHref` returns `string | null`. `hqSwarmHref` always returns a string.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-10-09-project-swarm-runs.md`.
