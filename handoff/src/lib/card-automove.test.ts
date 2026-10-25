import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { POST as agentWorkPost } from "@/app/api/agent-work/route";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { applyGithubDelivery } from "@/lib/github/consume";
import { agentForToken, fileAgentWork, fileUnfiledWork, registerClientAgent } from "./agent-work-filing";
import { updateAgentTask } from "./agent-board";
import { reviewDeliverable } from "./client-work";
import { cardRefsFromPull } from "./card-automove";
import { listOpenReviews } from "./task-review";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");

let sql: Sql;
let d1: D1Like;
let store: ObjectStore;
let root: string;
/** When set, any statement containing this text throws (as D1 would), to simulate a failure mid-filing. */
let failOn: string | null = null;

function d1Over(db: DatabaseSync): D1Like {
  const prepare = (statement: string) => ({
    bind: (...params: unknown[]) => {
      if (failOn && statement.includes(failOn)) {
        const boom = async () => {
          throw new Error(`D1_ERROR: simulated failure on ${failOn}`);
        };
        return { run: boom, all: boom, first: boom, stmt: { run: () => { throw new Error(`D1_ERROR: simulated failure on ${failOn}`); } }, args: [] };
      }
      // D1 refuses a LIKE or GLOB pattern over 50 bytes (SQLITE_LIMIT_LIKE_PATTERN_LENGTH); local SQLite allows 50,000.
      if (/\b(LIKE|GLOB)\s+\?/i.test(statement) && params.some((value) => typeof value === "string" && /[%*]/.test(value) && new TextEncoder().encode(value).byteLength > 50)) {
        const tooComplex = async () => {
          throw new Error("D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR");
        };
        return { run: tooComplex, all: tooComplex, first: tooComplex, stmt: { run: () => { throw new Error("D1_ERROR: LIKE or GLOB pattern too complex"); } }, args: [] };
      }
      const stmt = db.prepare(statement);
      const args = params as never[];
      return {
        run: async () => stmt.run(...args),
        all: async <T>() => ({ results: stmt.all(...args) as T[] }),
        first: async <T>() => (stmt.get(...args) as T | undefined) ?? null,
        stmt,
        args,
      };
    },
  });
  return {
    prepare,
    exec: async (statement: string) => db.exec(statement),
    batch: async (statements: unknown[]) => {
      db.exec("BEGIN");
      try {
        for (const entry of statements as { stmt: { run: (...a: never[]) => unknown }; args: never[] }[]) entry.stmt.run(...entry.args);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Like;
}

beforeEach(async () => {
  failOn = null;
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  root = mkdtempSync(path.join(tmpdir(), "card-automove-"));
  store = localObjectStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.HANDOFF_OBJECT_PATH;
});

async function setup() {
  const acme = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, 'Acme', 'acme.example', 'client', ?, ?)", [acme, NOW, NOW]);
  const projectId = crypto.randomUUID();
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Website', 'active', ?, ?)", [projectId, acme, NOW, NOW]);
  const spaceId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES (?, 'acme', 'acme', 'Acme', 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?, ?)`,
    [spaceId, NOW, acme, projectId],
  );
  const made = await registerClientAgent(sql, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, role: "lead", actor: "test", now: NOW });
  if (!made.ok || !made.token) throw new Error("register failed");
  const agent = (await agentForToken(sql, `Bearer ${made.token}`))!;
  return { acme, projectId, spaceId, agent, token: made.token };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** A card in Doing (stage build, status doing), To do, or Done. */
async function card(ctx: Ctx, column: "doing" | "todo" | "done" = "doing", title = "Homepage hero"): Promise<string> {
  const id = crypto.randomUUID();
  const stage = column === "todo" ? "describe" : "build";
  const status = column === "done" ? "done" : column === "doing" ? "doing" : "todo";
  await sql.run(
    "INSERT INTO tasks (id, project_id, organization_id, title, status, stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, ctx.projectId, ctx.acme, title, status, stage, NOW, NOW],
  );
  return id;
}

async function taskRow(id: string) {
  return (await sql.get<{ status: string; stage: string; review_requested_at: number | null; review_note: string | null; done_at: number | null }>(
    "SELECT status, stage, review_requested_at, review_note, done_at FROM tasks WHERE id = ?",
    [id],
  ))!;
}

async function cardActivities(taskId: string) {
  const rows = await sql.all<{ kind: string; actor_kind: string; actor_id: string | null; body: string; data_json: string }>(
    "SELECT kind, actor_kind, actor_id, body, data_json FROM activities ORDER BY created_at, rowid",
  );
  return rows
    .map((row) => ({ ...row, data: JSON.parse(row.data_json ?? "{}") as Record<string, unknown> }))
    .filter((row) => row.data.taskId === taskId || row.data.task_id === taskId);
}

const work = { title: "Hero copy", kind: "document", summary: "New hero copy.", content: "# Hero\n\nSmile." };

describe("1) filing a deliverable moves a Doing card to Waiting on Client Services", () => {
  it("an agent filing (held) on a Doing card moves it to review with an activity", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "doing");
    const filed = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "f1", task_id: taskId }, NOW + 10);
    expect(filed).toMatchObject({ ok: true, state: "filed", held: true });
    expect(await taskRow(taskId)).toMatchObject({ status: "doing", review_requested_at: NOW + 10 });
    const moves = (await cardActivities(taskId)).filter((row) => row.kind === "agent.task_stage");
    expect(moves).toHaveLength(1);
    expect(moves[0]?.body).toContain("Moved to Waiting on Client Services.");
    expect(moves[0]?.data).toMatchObject({ stage: "review", column: "review" });
  });

  it("staff filing an unfiled item onto a Doing card moves it to review too", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "doing");
    // Unfiled: names a client this agent is not on.
    const unfiled = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "u1", client: { domain: "nobody.example" } }, NOW + 10);
    expect(unfiled).toMatchObject({ ok: true, state: "unfiled" });
    if (!unfiled.ok) return;
    const filed = await fileUnfiledWork(sql, store, {
      id: unfiled.workItemId, organizationId: ctx.acme, workspaceId: ctx.spaceId, taskId, actor: "user-staff", now: NOW + 20,
    });
    expect(filed).toMatchObject({ ok: true });
    expect((await taskRow(taskId)).review_requested_at).toBe(NOW + 20);
  });
});

describe("2) Client Services asking for changes sends the card back to Doing", () => {
  async function inReview(ctx: Ctx) {
    const taskId = await card(ctx, "doing");
    const filed = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: `r-${taskId}`, task_id: taskId }, NOW + 10);
    if (!filed.ok || filed.state !== "filed" || !filed.review?.deliverableId) throw new Error("not filed");
    return { taskId, deliverableId: filed.review.deliverableId, workItemId: filed.workItemId };
  }

  it("changes on the whole deliverable move the card back to Doing and keep the filing held", async () => {
    const ctx = await setup();
    const { taskId, deliverableId, workItemId } = await inReview(ctx);
    const result = await reviewDeliverable(sql, { spaceId: ctx.spaceId, deliverableId, decision: "changes", body: "Use the approved wording.", now: NOW + 20 });
    expect(result).toMatchObject({ ok: true, status: "changes_requested" });
    const row = await taskRow(taskId);
    expect(row.review_requested_at).toBeNull();
    expect(row.status).toBe("doing");
    expect(["engineer", "build", "run"]).toContain(row.stage);
    expect(row.review_note).toBe("Use the approved wording.");
    const sentBack = (await cardActivities(taskId)).filter((entry) => entry.kind === "client_services.task_review");
    expect(sentBack).toHaveLength(1);
    expect(sentBack[0]?.data).toMatchObject({ decision: "progress", note: "Use the approved wording." });
    const held = await sql.get<{ released_at: number | null }>("SELECT released_at FROM agent_work_items WHERE id = ?", [workItemId]);
    expect(held?.released_at).toBeNull();
  });

  it("changes on one piece send the card back as well", async () => {
    const ctx = await setup();
    const { taskId, deliverableId } = await inReview(ctx);
    const item = await sql.get<{ id: string; version: number }>("SELECT id, version FROM deliverable_items WHERE deliverable_id = ? LIMIT 1", [deliverableId]);
    const result = await reviewDeliverable(sql, { spaceId: ctx.spaceId, deliverableId, itemId: item!.id, decision: "changes", body: "Fix the headline.", now: NOW + 20 });
    expect(result.ok).toBe(true);
    expect((await taskRow(taskId)).review_requested_at).toBeNull();
  });

  it("a comment or an approval does not send it back; approval still goes to Done as before", async () => {
    const ctx = await setup();
    const { taskId, deliverableId } = await inReview(ctx);
    await reviewDeliverable(sql, { spaceId: ctx.spaceId, deliverableId, decision: "comment", body: "Looks close.", now: NOW + 20 });
    expect((await taskRow(taskId)).review_requested_at).toBe(NOW + 10);
    await reviewDeliverable(sql, { spaceId: ctx.spaceId, deliverableId, decision: "approve", body: "", now: NOW + 30 });
    expect((await taskRow(taskId)).status).toBe("done");
  });

  it("changes on a deliverable whose card is not waiting on review leave the card where it is", async () => {
    const ctx = await setup();
    const { taskId, deliverableId } = await inReview(ctx);
    await reviewDeliverable(sql, { spaceId: ctx.spaceId, deliverableId, decision: "approve", body: "", now: NOW + 20 });
    expect((await taskRow(taskId)).status).toBe("done");
    await reviewDeliverable(sql, { spaceId: ctx.spaceId, deliverableId, decision: "changes", body: "One more tweak.", now: NOW + 30 });
    expect((await taskRow(taskId)).status).toBe("done");
  });
});

describe("3) a merged GitHub PR linked to a card moves it to Waiting on Client Services", () => {
  async function linkRepo(ctx: Ctx) {
    await sql.run("INSERT INTO github_installations (id, account_login, account_type, created_at) VALUES (7, 'abracadabra', 'Organization', ?)", [NOW]);
    await sql.run(
      `INSERT INTO repos (id, github_repo_id, installation_id, full_name, organization_id, project_id, default_branch, is_private, owned_by, created_at)
       VALUES ('repo-1', 99, 7, 'acme/site', ?, ?, 'main', 1, 'agency', ?)`,
      [ctx.acme, ctx.projectId, NOW],
    );
  }

  function merged(input: { number?: number; body?: string | null; branch?: string; merged?: boolean; action?: string; repoId?: number }, deliveryId = crypto.randomUUID()) {
    const number = input.number ?? 42;
    return {
      source: "github" as const,
      deliveryId,
      event: "pull_request",
      payload: {
        action: input.action ?? "closed",
        pull_request: {
          number,
          title: "Hero copy",
          body: input.body ?? null,
          html_url: `https://github.com/acme/site/pull/${number}`,
          merged: input.merged ?? true,
          user: { login: "ada" },
          head: { ref: input.branch ?? "feature/hero" },
        },
        repository: { id: input.repoId ?? 99, full_name: "acme/site", default_branch: "main" },
      },
    };
  }

  it("reads full card ids from the body and branch, and short ids only after the word card", () => {
    const id = "62409040-4597-4161-a6e4-6ecc041a1186";
    expect(cardRefsFromPull(`Closes HQ card ${id}.`, "main")).toEqual({ ids: [id], prefixes: [] });
    expect(cardRefsFromPull(null, `card-${id}`)).toEqual({ ids: [id], prefixes: [] });
    expect(cardRefsFromPull("HQ card: 62409040", "fix/thing")).toEqual({ ids: [], prefixes: ["62409040"] });
    expect(cardRefsFromPull(null, "card-62409040-hero")).toEqual({ ids: [], prefixes: ["62409040"] });
    // A bare short hex (a commit sha) is not a card reference.
    expect(cardRefsFromPull("Reverts 62409040 and a1b2c3d4", "main")).toEqual({ ids: [], prefixes: [] });
  });

  it("moves a Doing card to review with 'PR #N merged' and the link; never to Done", async () => {
    const ctx = await setup();
    await linkRepo(ctx);
    const taskId = await card(ctx, "doing");
    const result = await applyGithubDelivery(sql, merged({ number: 216, body: `Card: ${taskId}` }), NOW + 10);
    expect(result).toEqual({ ok: true, duplicate: false });
    const row = await taskRow(taskId);
    expect(row.status).toBe("doing");
    expect(row.done_at).toBeNull();
    expect(row.review_requested_at).toBe(NOW + 10);
    expect(row.review_note).toContain("PR #216 merged");
    expect(row.review_note).toContain("https://github.com/acme/site/pull/216");
    const moves = (await cardActivities(taskId)).filter((entry) => entry.kind === "github.task_stage");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ actor_kind: "system", actor_id: "github" });
    expect(moves[0]?.data).toMatchObject({ stage: "review", column: "review", pr_number: 216, url: "https://github.com/acme/site/pull/216" });
    // Client Services sees it in its review queue, asked by GitHub.
    const reviews = await listOpenReviews(sql, { organizationId: ctx.acme });
    expect(reviews.map((review) => review.task_id)).toContain(taskId);
    expect(reviews.find((review) => review.task_id === taskId)?.requested_by).toEqual({ kind: "system", id: "github" });
  });

  it("moves a To do card linked by branch name with a short id", async () => {
    const ctx = await setup();
    await linkRepo(ctx);
    const taskId = await card(ctx, "todo");
    await applyGithubDelivery(sql, merged({ branch: `card-${taskId.slice(0, 8)}-hero` }), NOW + 10);
    expect((await taskRow(taskId)).review_requested_at).toBe(NOW + 10);
  });

  it("does not reopen a Done card; it notes the merge on the card instead", async () => {
    const ctx = await setup();
    await linkRepo(ctx);
    const taskId = await card(ctx, "done");
    await applyGithubDelivery(sql, merged({ body: taskId }), NOW + 10);
    const row = await taskRow(taskId);
    expect(row.status).toBe("done");
    expect(row.review_requested_at).toBeNull();
    const notes = (await cardActivities(taskId)).filter((entry) => entry.kind === "github.card_note");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toContain("PR #42 merged");
  });

  it("a card already waiting on review keeps its ask time and gets a note", async () => {
    const ctx = await setup();
    await linkRepo(ctx);
    const taskId = await card(ctx, "doing");
    await sql.run("UPDATE tasks SET review_requested_at = ?, review_note = 'Filed v1.' WHERE id = ?", [NOW + 1, taskId]);
    await applyGithubDelivery(sql, merged({ body: taskId }), NOW + 10);
    const row = await taskRow(taskId);
    expect(row.review_requested_at).toBe(NOW + 1);
    expect((await cardActivities(taskId)).some((entry) => entry.kind === "github.card_note")).toBe(true);
  });

  it("ignores a closed-unmerged PR, an opened PR, an unlinked repo, and a card of another client", async () => {
    const ctx = await setup();
    await linkRepo(ctx);
    const taskId = await card(ctx, "doing");
    await applyGithubDelivery(sql, merged({ body: taskId, merged: false }), NOW + 10);
    await applyGithubDelivery(sql, merged({ body: taskId, action: "opened", merged: false }), NOW + 11);
    await applyGithubDelivery(sql, merged({ body: taskId, repoId: 12345 }), NOW + 12);
    expect((await taskRow(taskId)).review_requested_at).toBeNull();
    const other = crypto.randomUUID();
    await sql.run("INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES (?, 'Other', 'client', ?, ?)", [other, NOW, NOW]);
    const otherCard = crypto.randomUUID();
    await sql.run(
      "INSERT INTO tasks (id, project_id, organization_id, title, status, stage, created_at, updated_at) VALUES (?, NULL, ?, 'Theirs', 'doing', 'build', ?, ?)",
      [otherCard, other, NOW, NOW],
    );
    await applyGithubDelivery(sql, merged({ body: otherCard }), NOW + 13);
    expect((await taskRow(otherCard)).review_requested_at).toBeNull();
    expect(await cardActivities(otherCard)).toEqual([]);
  });

  it("a short id that matches more than one card of the client moves nothing", async () => {
    const ctx = await setup();
    await linkRepo(ctx);
    const one = "abcdef12-0000-4000-8000-000000000001";
    const two = "abcdef12-0000-4000-8000-000000000002";
    for (const id of [one, two]) {
      await sql.run(
        "INSERT INTO tasks (id, project_id, organization_id, title, status, stage, created_at, updated_at) VALUES (?, ?, ?, 'T', 'doing', 'build', ?, ?)",
        [id, ctx.projectId, ctx.acme, NOW, NOW],
      );
    }
    await applyGithubDelivery(sql, merged({ body: "card abcdef12" }), NOW + 10);
    expect((await taskRow(one)).review_requested_at).toBeNull();
    expect((await taskRow(two)).review_requested_at).toBeNull();
  });
});

describe("4) failed filings and refused moves are reported and recorded on the card", () => {
  it("root cause of the 500s: a long title in the default folder files under D1's 50-byte LIKE limit", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "doing");
    // The title of the filing that failed in production (work item e90ba068), with no folder: the default folder
    // "Finished work/<date> <title>" made a 99-byte LIKE pattern, which D1 refuses.
    const title = "Skill library republished: SEO content-system skill is client-neutral";
    const first = await fileAgentWork(sql, store, ctx.agent, { ...work, title, external_id: "long-1", task_id: taskId }, NOW + 10);
    expect(first).toMatchObject({ ok: true, state: "filed" });
    // A second filing in the same folder still sees the first one's names and does not clash.
    const second = await fileAgentWork(sql, store, ctx.agent, { ...work, title, external_id: "long-2", task_id: taskId }, NOW + 20);
    expect(second).toMatchObject({ ok: true, state: "filed" });
    if (!first.ok || first.state !== "filed" || !second.ok || second.state !== "filed") return;
    expect(first.paths[0]).toMatch(/summary\.md$/);
    expect(second.paths[0]).toMatch(/summary \(2\)\.md$/);
    expect((await taskRow(taskId)).review_requested_at).toBe(NOW + 10);
  });

  it("a filing that fails inside HQ returns a clear error, logs it on the card, and is not left stuck", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "doing");
    failOn = "INSERT INTO batches";
    const failed = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "boom-1", task_id: taskId }, NOW + 10);
    failOn = null;
    expect(failed).toMatchObject({ ok: false, error: "failed" });
    if (failed.ok || failed.error !== "failed") return;
    expect(failed.message).toContain("did not reach the card");
    expect(failed.workItemId).toBeTruthy();
    const item = await sql.get<{ state: string; unfiled_reason: string | null }>("SELECT state, unfiled_reason FROM agent_work_items WHERE id = ?", [failed.workItemId]);
    expect(item).toEqual({ state: "unfiled", unfiled_reason: "filing_error" });
    const logged = (await cardActivities(taskId)).filter((entry) => entry.kind === "client_agent.work_failed");
    expect(logged).toHaveLength(1);
    expect(logged[0]?.data).toMatchObject({ task_id: taskId, work_item_id: failed.workItemId, agent_id: "acme-lead" });
    expect(String(logged[0]?.data.error)).toContain("simulated failure");
    expect((await taskRow(taskId)).review_requested_at).toBeNull();

    // Sending the same request again files it (same work item) and moves the card.
    const retried = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "boom-1", task_id: taskId }, NOW + 20);
    expect(retried).toMatchObject({ ok: true, state: "filed", duplicate: false, workItemId: failed.workItemId });
    expect((await taskRow(taskId)).review_requested_at).toBe(NOW + 20);
  });

  it("an item stuck in received from an earlier crash is filed again on retry", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "doing");
    const stuck = crypto.randomUUID();
    await sql.run(
      `INSERT INTO agent_work_items (id, agent_id, external_id, state, kind, title, summary, organization_id, payload_json, links_json, created_at, updated_at)
       VALUES (?, 'acme-lead', 'stuck-1', 'received', 'document', 'Hero copy', NULL, ?, '{}', '[]', ?, ?)`,
      [stuck, ctx.acme, NOW, NOW],
    );
    const retried = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "stuck-1", task_id: taskId }, NOW + 10 * 60_000);
    expect(retried).toMatchObject({ ok: true, state: "filed", workItemId: stuck });
    expect((await taskRow(taskId)).review_requested_at).toBe(NOW + 10 * 60_000);
  });

  it("a fresh received item (maybe still in flight) is not filed twice", async () => {
    const ctx = await setup();
    const stuck = crypto.randomUUID();
    await sql.run(
      `INSERT INTO agent_work_items (id, agent_id, external_id, state, kind, title, summary, organization_id, payload_json, links_json, created_at, updated_at)
       VALUES (?, 'acme-lead', 'fresh-1', 'received', 'document', 'Hero copy', NULL, ?, '{}', '[]', ?, ?)`,
      [stuck, ctx.acme, NOW, NOW],
    );
    const again = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "fresh-1" }, NOW + 1000);
    expect(again).toMatchObject({ ok: true, duplicate: true, state: "received" });
  });

  it("POST /api/agent-work answers a failed filing with a 500 and a JSON error naming the work item", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "doing");
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1, FILES: undefined } };
    process.env.HANDOFF_OBJECT_PATH = root;
    failOn = "INSERT INTO batches";
    const response = await agentWorkPost(new Request("https://hq.example/api/agent-work", {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.token}`, "content-type": "application/json" },
      body: JSON.stringify({ ...work, external_id: "route-boom", task_id: taskId }),
    }));
    failOn = null;
    expect(response.status).toBe(500);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ code: "filing_failed", task_id: taskId });
    expect(typeof body.error).toBe("string");
    expect(typeof body.work_item_id).toBe("string");
  });

  it("a filing that names a card but ends up unfiled says the card did not move, and notes it on the card", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "doing");
    // A second space with no project link makes the space ambiguous when the card has no project.
    await sql.run("UPDATE tasks SET project_id = NULL WHERE id = ?", [taskId]);
    await sql.run(
      `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
       VALUES (?, 'acme-2', 'acme-2', 'Acme 2', 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?, NULL)`,
      [crypto.randomUUID(), NOW, ctx.acme],
    );
    await sql.run("UPDATE agent_assignments SET workspace_id = NULL, project_id = NULL WHERE agent_id = 'acme-lead'");
    const result = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "amb-1", task_id: taskId }, NOW + 10);
    expect(result).toMatchObject({ ok: true, state: "unfiled", reason: "ambiguous_space" });
    const logged = (await cardActivities(taskId)).filter((entry) => entry.kind === "client_agent.work_unfiled");
    expect(logged).toHaveLength(1);
    expect((await taskRow(taskId)).review_requested_at).toBeNull();
  });

  it("an agent's refused move is returned as an error and recorded on the card", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "doing");
    await sql.run("UPDATE tasks SET review_requested_at = ? WHERE id = ?", [NOW, taskId]);
    const refused = await updateAgentTask(sql, ctx.agent, { taskId, change: { action: "move", to: "done" }, now: NOW + 10 });
    expect(refused).toMatchObject({ ok: false, status: 403 });
    const logged = (await cardActivities(taskId)).filter((entry) => entry.kind === "client_agent.board_refused");
    expect(logged).toHaveLength(1);
    expect(logged[0]?.data).toMatchObject({ task_id: taskId, agent_id: "acme-lead", action: "move", status: 403 });
    expect(logged[0]?.body).toContain("waiting on Client Services");
    // Still waiting on review: permissions are unchanged.
    expect((await taskRow(taskId)).review_requested_at).toBe(NOW);
  });

  it("a refused move on another client's card is not written to that client's timeline", async () => {
    const ctx = await setup();
    const other = crypto.randomUUID();
    await sql.run("INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES (?, 'Other', 'client', ?, ?)", [other, NOW, NOW]);
    const theirs = crypto.randomUUID();
    await sql.run(
      "INSERT INTO tasks (id, project_id, organization_id, title, status, stage, created_at, updated_at) VALUES (?, NULL, ?, 'Theirs', 'doing', 'build', ?, ?)",
      [theirs, other, NOW, NOW],
    );
    const refused = await updateAgentTask(sql, ctx.agent, { taskId: theirs, change: { action: "move", to: "done" }, now: NOW + 10 });
    expect(refused).toMatchObject({ ok: false, status: 404 });
    expect(await cardActivities(theirs)).toEqual([]);
  });
});
