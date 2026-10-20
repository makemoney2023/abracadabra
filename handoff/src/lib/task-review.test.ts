import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { listAgentBoard, updateAgentTask } from "./agent-board";
import { agentForToken, registerClientAgent } from "./agent-work-filing";
import { boardCards, columnOf, nextSteps, type StepCard } from "./board-model";
import { listClientUpdates } from "./client-work";
import { retryCappedBuilds, type BuildDeps } from "./cursor-build";
import { runHqTool } from "./hq-tools";
import { decideReview } from "./task-review";
import { moveTaskStage } from "./task-stage";
import { markTaskDone } from "./task-done";

const NOW = 1_700_000_000_000;
const staff = { kind: "staff" as const, id: "staff-1" };
let sql: Sql;

/** Build deps that fail the test if anything tries to start a Cursor run. */
function noStarts(): BuildDeps & { calls: number } {
  const deps = {
    calls: 0,
    cursorKey: "test-key",
    now: NOW,
    put: async () => {
      deps.calls += 1;
      return "key";
    },
    fetch: (async () => {
      deps.calls += 1;
      throw new Error("nothing should start");
    }) as unknown as typeof fetch,
  };
  return deps;
}

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  sql = sqliteSql(db);
  await migrate(sql);
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [NOW, NOW]);
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES ('proj-1', 'org-1', 'Website', 'active', ?, ?)", [NOW, NOW]);
  for (const [id, stage, status, position] of [
    ["t-describe", "describe", "todo", 0],
    ["t-build", "build", "todo", 0],
    ["t-run", "run", "doing", 0],
  ] as const) {
    await sql.run(
      `INSERT INTO tasks (id, project_id, organization_id, title, status, stage, position, created_at, updated_at)
       VALUES (?, 'proj-1', 'org-1', ?, ?, ?, ?, ?, ?)`,
      [id, `Card ${id}`, status, stage, position, NOW, NOW],
    );
  }
});

afterEach(() => {
  delete process.env.AGENT_MODE;
  vi.restoreAllMocks();
});

async function row(id: string) {
  return sql.get<{ stage: string; status: string; review_requested_at: number | null; review_note: string | null; done_at: number | null }>(
    "SELECT stage, status, review_requested_at, review_note, done_at FROM tasks WHERE id = ?",
    [id],
  );
}

async function count(kind: string): Promise<number> {
  const found = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM activities WHERE kind = ?", [kind]);
  return Number(found?.n ?? 0);
}

describe("board model", () => {
  it("puts Review after run and before done, and done still wins", () => {
    expect(columnOf({ status: "doing", stage: "build", review_requested_at: NOW })).toBe("review");
    expect(columnOf({ status: "blocked", stage: "run", review_requested_at: NOW })).toBe("review");
    expect(columnOf({ status: "done", stage: "build", review_requested_at: NOW })).toBe("done");
    expect(columnOf({ status: "doing", stage: "build", review_requested_at: null })).toBe("build");
    expect(columnOf({ status: "doing", stage: "build" })).toBe("build");
    const columns = boardCards([
      { id: "a", status: "doing", stage: "build", position: 0, created_at: 0, done_at: null, review_requested_at: NOW },
      { id: "b", status: "doing", stage: "build", position: 1, created_at: 0, done_at: null, review_requested_at: null },
    ]);
    expect(Object.keys(columns)).toEqual(["describe", "engineer", "build", "run", "review", "done"]);
    expect(columns.review.map((card) => card.id)).toEqual(["a"]);
    expect(columns.build.map((card) => card.id)).toEqual(["b"]);
  });

  it("keeps Review cards out of the HQ agent's queue", () => {
    const card = (id: string, inReview: boolean): StepCard => ({
      id, projectId: "p", projectStatus: "active", status: "todo", stage: "describe", position: 0, createdAt: 0,
      blockedAnswered: false, hasSkill: true, inReview,
    });
    expect(nextSteps([card("x", true), card("y", false)], 5).map((item) => item.id)).toEqual(["y"]);
  });
});

describe("moving into Review", () => {
  for (const mode of ["legacy", "agents"] as const) {
    it(`starts nothing in AGENT_MODE=${mode}: no Cursor run, no swarm, no wake, no dispatch`, async () => {
      if (mode === "agents") process.env.AGENT_MODE = "agents";
      const build = noStarts();
      const wake = vi.fn(async () => true);
      const fetchSwarm = vi.fn(async () => new Response("{}"));
      for (const id of ["t-describe", "t-build", "t-run"]) {
        const moved = await moveTaskStage(sql, {
          taskId: id, to: "review", note: "Draft is in the space.", now: NOW + 1, actor: staff, build, wake,
          swarm: { origin: "https://swarm.example", fetchImpl: fetchSwarm as unknown as typeof fetch },
        });
        expect(moved).toMatchObject({ ok: true, column: "review", status: "doing" });
      }
      expect(build.calls).toBe(0);
      expect(wake).not.toHaveBeenCalled();
      expect(fetchSwarm).not.toHaveBeenCalled();
      expect(await count("client_agent.dispatch")).toBe(0);
      expect(await row("t-build")).toEqual({ stage: "build", status: "doing", review_requested_at: NOW + 1, review_note: "Draft is in the space.", done_at: null });
      const positions = await sql.all<{ id: string; position: number }>(
        "SELECT id, position FROM tasks WHERE review_requested_at IS NOT NULL ORDER BY position",
      );
      expect(positions.map((item) => item.position)).toEqual([0, 1, 2]);
    });
  }

  it("refuses a done card, and a waiting build in Review is not retried", async () => {
    await sql.run("UPDATE tasks SET status = 'done', done_at = ? WHERE id = 't-describe'", [NOW]);
    expect(await moveTaskStage(sql, { taskId: "t-describe", to: "review", now: NOW, actor: staff })).toEqual({ ok: false, error: "invalid" });
    await moveTaskStage(sql, { taskId: "t-build", to: "review", now: NOW, actor: staff });
    await sql.run("UPDATE tasks SET status = 'todo' WHERE id = 't-build'");
    const build = noStarts();
    await retryCappedBuilds(sql, build);
    expect(build.calls).toBe(0);
    expect((await row("t-build"))?.status).toBe("todo");
  });

  it("blocking keeps the card in Review; reordering stays inside Review", async () => {
    await moveTaskStage(sql, { taskId: "t-build", to: "review", now: NOW, actor: staff });
    await moveTaskStage(sql, { taskId: "t-run", to: "review", now: NOW, actor: staff });
    await moveTaskStage(sql, { taskId: "t-run", blockedReason: "Waiting on the logo", now: NOW, actor: staff });
    expect(columnOf((await row("t-run"))!)).toBe("review");
    const moved = await moveTaskStage(sql, { taskId: "t-run", direction: "up", now: NOW, actor: staff });
    expect(moved).toMatchObject({ ok: true, column: "review" });
    const order = await sql.all<{ id: string }>("SELECT id FROM tasks WHERE review_requested_at IS NOT NULL ORDER BY position");
    expect(order.map((item) => item.id)).toEqual(["t-run", "t-build"]);
  });

  it("a plain move out of Review drops the flag and keeps the card", async () => {
    await moveTaskStage(sql, { taskId: "t-describe", to: "review", now: NOW, actor: staff });
    const moved = await moveTaskStage(sql, { taskId: "t-describe", to: "engineer", now: NOW + 1, actor: staff });
    expect(moved).toMatchObject({ ok: true, column: "engineer" });
    expect(await row("t-describe")).toMatchObject({ stage: "engineer", review_requested_at: null });
  });

  it("filing or the deliverable PR path (markTaskDone) still finishes a Review card", async () => {
    await moveTaskStage(sql, { taskId: "t-build", to: "review", now: NOW, actor: staff });
    await markTaskDone(sql, { taskId: "t-build", now: NOW + 2, actor: staff });
    expect(await row("t-build")).toMatchObject({ status: "done", review_requested_at: null, done_at: NOW + 2 });
  });
});

describe("staff review decisions", () => {
  beforeEach(async () => {
    await moveTaskStage(sql, { taskId: "t-build", to: "review", note: "Ready", now: NOW, actor: staff });
  });

  it("approve moves to done, records staff.task_review, and the feed carries it", async () => {
    const decided = await decideReview(sql, { taskId: "t-build", decision: "approve", now: NOW + 5, actor: staff, build: noStarts() });
    expect(decided).toMatchObject({ ok: true, column: "done", status: "done" });
    expect(await row("t-build")).toMatchObject({ status: "done", review_requested_at: null, review_note: null, done_at: NOW + 5 });
    expect(await count("staff.task_review")).toBe(1);
    const updates = await listClientUpdates(sql, { since: null, now: NOW + 10_000, origin: "https://hq.example" });
    expect(Array.isArray(updates) && updates.some((update) => update.summary.includes("Review approved"))).toBe(true);
  });

  it("send back needs a note, and only works on a Review card", async () => {
    expect(await decideReview(sql, { taskId: "t-build", decision: "progress", note: " ", now: NOW, actor: staff })).toEqual({ ok: false, error: "note_required" });
    expect(await decideReview(sql, { taskId: "t-run", decision: "approve", now: NOW, actor: staff })).toEqual({ ok: false, error: "not_in_review" });
    expect(await decideReview(sql, { taskId: "nope", decision: "approve", now: NOW, actor: staff })).toEqual({ ok: false, error: "missing" });
  });

  it("send back to in progress returns the card to its stage as doing and starts nothing (legacy)", async () => {
    const build = noStarts();
    const decided = await decideReview(sql, { taskId: "t-build", decision: "progress", note: "Fix the header", now: NOW + 5, actor: staff, build });
    expect(decided).toMatchObject({ ok: true, column: "build", stage: "build", status: "doing" });
    expect(decided).not.toHaveProperty("handedTo");
    expect(build.calls).toBe(0);
    expect(await row("t-build")).toMatchObject({ stage: "build", status: "doing", review_requested_at: null, review_note: "Fix the header" });
    expect(await count("client_agent.dispatch")).toBe(0);
  });

  it("with AGENT_MODE=agents, send back hands the note to the lead agent as a changes dispatch", async () => {
    process.env.AGENT_MODE = "agents";
    await registerClientAgent(sql, { agentId: "acme-lead", label: "Acme lead", organizationId: "org-1", role: "lead", actor: "test", now: NOW });
    const progress = await decideReview(sql, { taskId: "t-build", decision: "progress", note: "Fix the header", now: NOW + 5, actor: staff });
    expect(progress).toMatchObject({ ok: true, handedTo: "acme-lead" });
    await moveTaskStage(sql, { taskId: "t-run", to: "review", now: NOW + 6, actor: staff });
    const build = noStarts();
    const toBuild = await decideReview(sql, { taskId: "t-run", decision: "build", note: "Rebuild with the new copy", now: NOW + 7, actor: staff, build });
    expect(toBuild).toMatchObject({ ok: true, column: "build", handedTo: "acme-lead" });
    expect(build.calls).toBe(0);
    const reasons = await sql.all<{ data_json: string }>("SELECT data_json FROM activities WHERE kind = 'client_agent.dispatch' ORDER BY created_at");
    expect(reasons.map((item) => JSON.parse(item.data_json).reason)).toEqual(["changes", "build"]);
  });
});

describe("client agent review action", () => {
  async function lead() {
    const made = await registerClientAgent(sql, { agentId: "acme-lead", label: "Acme lead", organizationId: "org-1", role: "lead", actor: "test", now: NOW });
    if (!made.ok) throw new Error("register failed");
    const principal = await agentForToken(sql, `Bearer ${made.token}`);
    if (!principal) throw new Error("token failed");
    return principal;
  }

  it("moves the card into the Review column and still posts to the feed; done waits on staff", async () => {
    const agent = await lead();
    const reviewed = await updateAgentTask(sql, agent, { taskId: "t-build", change: { action: "review", note: "Draft filed." }, now: NOW + 1 });
    expect(reviewed).toMatchObject({ ok: true, task: { column: "review", stage: "build", review_note: "Draft filed." } });
    const board = await listAgentBoard(sql, agent, {});
    expect(board.ok && board.tasks.find((item) => item.id === "t-build")?.column).toBe("review");
    const refused = await updateAgentTask(sql, agent, { taskId: "t-build", change: { action: "move", to: "done" }, now: NOW + 2 });
    expect(refused).toMatchObject({ ok: false, status: 403 });
    const back = await updateAgentTask(sql, agent, { taskId: "t-build", change: { action: "start" }, now: NOW + 3 });
    expect(back).toMatchObject({ ok: true, task: { column: "build", review_requested_at: null } });
    const updates = await listClientUpdates(sql, { since: null, now: NOW + 10_000, origin: "https://hq.example" });
    expect(Array.isArray(updates) && updates.some((update) => update.summary.includes("ready for review"))).toBe(true);
  });
});

describe("HQ chat tools", () => {
  const caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };

  beforeEach(async () => {
    await sql.run(
      "INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)",
      [NOW],
    );
  });

  it("set_task_stage takes review, list_tasks shows the column, review_task decides it", async () => {
    const build = noStarts();
    const toReview = await runHqTool(
      sql, caller as never,
      { tool: "set_task_stage", input: { taskId: "t-run", stage: "review", note: "Check it" }, idempotencyKey: "r1", approved: true },
      NOW, { build } as never,
    );
    expect(toReview).toMatchObject({ ok: true, value: { taskId: "t-run", stage: "review" } });
    const listed = await runHqTool(sql, caller as never, { tool: "list_tasks", input: { organizationId: "org-1" } }, NOW);
    expect(listed).toMatchObject({ ok: true });
    const value = (listed as { value: { id: string; column: string; review_note: string | null }[] }).value;
    expect(value.find((item) => item.id === "t-run")).toMatchObject({ column: "review", review_note: "Check it" });
    const noNote = await runHqTool(
      sql, caller as never,
      { tool: "review_task", input: { taskId: "t-run", decision: "progress" }, idempotencyKey: "r2", approved: true },
      NOW, { build } as never,
    );
    expect(noNote).toEqual({ ok: false, error: "invalid" });
    const approved = await runHqTool(
      sql, caller as never,
      { tool: "review_task", input: { taskId: "t-run", decision: "approve" }, idempotencyKey: "r3", approved: true },
      NOW + 1, { build } as never,
    );
    expect(approved).toMatchObject({ ok: true, value: { column: "done", status: "done" } });
    expect(build.calls).toBe(0);
  });
});
