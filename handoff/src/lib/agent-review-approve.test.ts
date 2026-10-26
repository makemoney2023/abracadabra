import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { GET as boardTaskGet, POST as boardTaskPost } from "@/app/api/agent-board/tasks/[taskId]/route";
import { POST as boardCreatePost } from "@/app/api/agent-board/tasks/route";
import { GET as boardGet } from "@/app/api/agent-board/route";
import { GET as workItemGet } from "@/app/api/agent-work/[id]/route";
import { GET as workListGet } from "@/app/api/agent-work/route";
import { listAgentBoard, parseBoardAction, updateAgentTask } from "./agent-board";
import { agentForToken, registerClientAgent, type AgentPrincipal } from "./agent-work-filing";
import { listClientUpdates } from "./client-work";
import { REVIEW_APPROVERS, canApproveReviews } from "./review-approvers";
import { agentWork, agentWorkStats } from "@/app/today-feed";
import { clientServicesReview } from "./task-review";
import { moveTaskStage } from "./task-stage";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
const ORGS = {
  abracadabra: "17c4b7b6-1def-4098-a706-9ceacae390de",
  renew: "8f26ca67-f722-4826-a964-63f94cc373dc",
  strongfoam: "c76df001-6a5a-4ddd-a71d-1caadf8c61e9",
  liocorr: "ee92cb98-b8ab-4a6c-b186-033a9a060de2",
} as const;
const OTHER = "org-milrcorr"; // scrum-master is a hire here too, but not listed as an approver.
const UNASSIGNED = "org-everleigh"; // scrum-master is not on this client at all.
const staff = { kind: "staff" as const, id: "staff-1" };

let sql: Sql;
const tokens: Record<string, string> = {};

function d1Over(db: DatabaseSync): D1Like {
  const prepare = (statement: string) => ({
    bind: (...params: unknown[]) => {
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

async function register(agentId: string, organizationId: string, role: "lead" | "hire"): Promise<void> {
  const made = await registerClientAgent(sql, { agentId, label: agentId === "scrum-master" ? "Scrum Master" : agentId, organizationId, role, actor: "test", now: NOW });
  if (!made.ok) throw new Error(made.message);
  if (made.token) tokens[agentId] = made.token;
}

async function principal(agentId: string): Promise<AgentPrincipal> {
  const found = await agentForToken(sql, `Bearer ${tokens[agentId]}`);
  if (!found) throw new Error(`no principal for ${agentId}`);
  return found;
}

/** A card on that client's board, moved to Waiting on Client Services by staff (or by the given agent). */
async function reviewCard(organizationId: string, id: string, input: { assignee?: string; askedBy?: string } = {}): Promise<string> {
  await sql.run(
    `INSERT INTO tasks (id, project_id, organization_id, title, status, stage, position, created_at, updated_at, assignee_agent_id)
     VALUES (?, ?, ?, ?, 'doing', 'build', 0, ?, ?, ?)`,
    [id, `proj-${organizationId}`, organizationId, `Card ${id}`, NOW, NOW, input.assignee ?? null],
  );
  const actor = input.askedBy ? { kind: "agent" as const, id: input.askedBy } : staff;
  const moved = await moveTaskStage(sql, { taskId: id, to: "review", note: "Ready.", now: NOW + 1, actor });
  if (!moved.ok) throw new Error("review move failed");
  return id;
}

async function card(id: string) {
  return sql.get<{ status: string; review_requested_at: number | null; done_at: number | null }>(
    "SELECT status, review_requested_at, done_at FROM tasks WHERE id = ?",
    [id],
  );
}

function bearer(agentId: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { authorization: `Bearer ${tokens[agentId]}`, "content-type": "application/json", ...(init.headers ?? {}) } };
}

async function postBoard(agentId: string, taskId: string, body: unknown): Promise<Response> {
  return boardTaskPost(
    new Request(`https://hq.example/api/agent-board/tasks/${taskId}`, bearer(agentId, { method: "POST", body: JSON.stringify(body) })),
    { params: Promise.resolve({ taskId }) },
  );
}

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
  for (const [name, id] of [...Object.entries(ORGS), ["milrcorr", OTHER], ["everleigh", UNASSIGNED]]) {
    await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)", [id, name, `${name}.example`, NOW, NOW]);
    await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'HQ platform', 'active', ?, ?)", [`proj-${id}`, id, NOW, NOW]);
  }
  for (const id of [...Object.values(ORGS), OTHER]) await register("scrum-master", id, "hire");
  await register("seo-analytics", ORGS.abracadabra, "hire");
  await register("abracadabra-client", ORGS.abracadabra, "lead");
  await register("everleigh-lead", UNASSIGNED, "lead");
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
});

describe("review approvers config", () => {
  it("lists only scrum-master, on the four clients Christopher named", () => {
    expect(Object.keys(REVIEW_APPROVERS)).toEqual(["scrum-master"]);
    expect([...REVIEW_APPROVERS["scrum-master"]].sort()).toEqual(Object.values(ORGS).sort());
  });

  it("also needs a live assignment: an ended one loses the permission", async () => {
    const agent = await principal("scrum-master");
    expect(canApproveReviews(agent, ORGS.renew)).toBe(true);
    expect(canApproveReviews(agent, OTHER)).toBe(false);
    expect(canApproveReviews({ ...agent, assignments: agent.assignments.filter((row) => row.organizationId !== ORGS.renew) }, ORGS.renew)).toBe(false);
    expect(canApproveReviews({ ...agent, agentId: "seo-analytics" }, ORGS.renew)).toBe(false);
  });
});

describe("scrum-master approves review cards to Done", () => {
  for (const [name, organizationId] of Object.entries(ORGS)) {
    it(`approves Waiting on Client Services to Done on ${name}, with its own token, audited as scrum-master`, async () => {
      const taskId = await reviewCard(organizationId, `t-${name}`);
      const response = await postBoard("scrum-master", taskId, { action: "approve", note: "Checked the PR and the live URL." });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; task: { column: string; status: string } };
      expect(body).toMatchObject({ ok: true, task: { column: "done", status: "done" } });
      expect(await card(taskId)).toMatchObject({ status: "done", done_at: expect.any(Number) });
      const audit = await sql.all<{ kind: string; actor_kind: string; actor_id: string; body: string; data_json: string }>(
        "SELECT kind, actor_kind, actor_id, body, data_json FROM activities WHERE kind = 'client_agent.task_review' AND json_extract(data_json, '$.taskId') = ?",
        [taskId],
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actor_kind: "agent", actor_id: "scrum-master" });
      expect(JSON.parse(audit[0].data_json)).toMatchObject({ decision: "approve", agent_id: "scrum-master", note: "Checked the PR and the live URL." });
      expect(audit[0].body).toContain("Scrum Master (agent scrum-master): review approved");
      // Never written as a Client Services decision.
      expect(await sql.get("SELECT id FROM activities WHERE kind = 'client_services.task_review' AND json_extract(data_json, '$.taskId') = ?", [taskId])).toBeUndefined();
      const stage = await sql.get<{ kind: string; actor_id: string }>(
        "SELECT kind, actor_id FROM activities WHERE kind = 'agent.task_stage' AND json_extract(data_json, '$.taskId') = ? AND json_extract(data_json, '$.stage') = 'done'",
        [taskId],
      );
      expect(stage).toMatchObject({ actor_id: "scrum-master" });
    });
  }

  it("shows in the Client Services feed and the Today feed as an agent approval", async () => {
    const taskId = await reviewCard(ORGS.renew, "t-feed");
    expect((await postBoard("scrum-master", taskId, { action: "approve" })).status).toBe(200);
    const updates = await listClientUpdates(sql, { since: "0", now: NOW + 10, origin: "https://hq.example" });
    expect(Array.isArray(updates) && updates.some((item) => (item as { kind?: string }).kind === "client_agent.task_review")).toBe(true);
    const events = (await sql.all<{ id: string; kind: string; body: string; data_json: string; created_at: number; organization_id: string }>(
      "SELECT id, kind, body, data_json, created_at, organization_id FROM activities WHERE kind = 'client_agent.task_review'",
    )).map((row) => ({ id: row.id, kind: row.kind, body: row.body, data: JSON.parse(row.data_json), createdAt: row.created_at, organizationId: row.organization_id, taskTitle: "Card t-feed" }));
    const rows = agentWork(events as never);
    expect(rows[0]).toMatchObject({ decision: "approved", body: "Approved by agent scrum-master" });
    expect(agentWorkStats(events as never, 0)).toMatchObject({ approved: 1, sentBack: 0 });
  });

  it("is refused on a client that is not listed (403) and on a client it is not on (404); nothing moves", async () => {
    const listed = await reviewCard(OTHER, "t-other");
    const refused = await postBoard("scrum-master", listed, { action: "approve" });
    expect(refused.status).toBe(403);
    expect(await card(listed)).toMatchObject({ status: "doing", review_requested_at: NOW + 1 });
    const foreign = await reviewCard(UNASSIGNED, "t-foreign");
    expect((await postBoard("scrum-master", foreign, { action: "approve" })).status).toBe(404);
    expect(await card(foreign)).toMatchObject({ status: "doing", review_requested_at: NOW + 1 });
    expect(await sql.get("SELECT id FROM activities WHERE kind = 'client_agent.task_review'")).toBeUndefined();
    // The refusal is written on the card's timeline, as every refused board change is.
    expect(await sql.get("SELECT id FROM activities WHERE kind = 'client_agent.board_refused' AND json_extract(data_json, '$.action') = 'approve'")).toBeTruthy();
  });

  it("only approves: no send back, no other moves out of Review, and no Doing to Done", async () => {
    const agent = await principal("scrum-master");
    const taskId = await reviewCard(ORGS.abracadabra, "t-moves");
    expect(parseBoardAction({ action: "send_back", note: "x" })).toBeNull();
    expect((await postBoard("scrum-master", taskId, { action: "send_back", note: "Fix it" })).status).toBe(400);
    for (const to of ["done", "doing", "todo"] as const) {
      const moved = await updateAgentTask(sql, agent, { taskId, change: { action: "move", to }, now: NOW + 2 });
      expect(moved).toMatchObject({ ok: false, status: 403 });
    }
    expect(await card(taskId)).toMatchObject({ status: "doing", review_requested_at: NOW + 1 });
    // A card in Doing (not waiting on review) can't be approved to Done.
    await sql.run(
      "INSERT INTO tasks (id, project_id, organization_id, title, status, stage, position, created_at, updated_at) VALUES ('t-doing', ?, ?, 'Doing card', 'doing', 'build', 0, ?, ?)",
      [`proj-${ORGS.abracadabra}`, ORGS.abracadabra, NOW, NOW],
    );
    const doing = await postBoard("scrum-master", "t-doing", { action: "approve" });
    expect(doing.status).toBe(409);
    expect(await card("t-doing")).toMatchObject({ status: "doing" });
    // Done already: still 409, no second audit row.
    expect((await postBoard("scrum-master", taskId, { action: "approve" })).status).toBe(200);
    expect((await postBoard("scrum-master", taskId, { action: "approve" })).status).toBe(409);
    expect((await sql.all("SELECT id FROM activities WHERE kind = 'client_agent.task_review'")).length).toBe(1);
  });

  it("never approves its own work: its own card, a review it asked for, or a card it filed work on", async () => {
    const assigned = await reviewCard(ORGS.strongfoam, "t-own", { assignee: "scrum-master" });
    const asked = await reviewCard(ORGS.strongfoam, "t-asked", { askedBy: "scrum-master" });
    const filed = await reviewCard(ORGS.strongfoam, "t-filed");
    await sql.run(
      `INSERT INTO agent_work_items (id, agent_id, external_id, state, kind, title, organization_id, task_id, filed_at, created_at, updated_at)
       VALUES ('w-own', 'scrum-master', 'ext-1', 'filed', 'note', 'My note', ?, 't-filed', ?, ?, ?)`,
      [ORGS.strongfoam, NOW, NOW, NOW],
    );
    for (const taskId of [assigned, asked, filed]) {
      const response = await postBoard("scrum-master", taskId, { action: "approve" });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { error: string }).error).toContain("own work");
      expect(await card(taskId)).toMatchObject({ status: "doing" });
    }
  });

  it("every other agent still gets 403: another hire and the client's lead", async () => {
    const taskId = await reviewCard(ORGS.abracadabra, "t-others");
    for (const agentId of ["seo-analytics", "abracadabra-client"]) {
      const response = await postBoard(agentId, taskId, { action: "approve" });
      expect(response.status).toBe(403);
    }
    expect(await card(taskId)).toMatchObject({ status: "doing", review_requested_at: NOW + 1 });
  });

  it("leaves the Client Services path unchanged: approve and send back, logged as Client Services", async () => {
    const approved = await reviewCard(ORGS.abracadabra, "t-cs-approve");
    const decided = await clientServicesReview(sql, { taskId: approved, action: "approve", now: NOW + 3 });
    expect(decided).toMatchObject({ ok: true, column: "done" });
    const log = await sql.get<{ actor_kind: string; actor_id: string }>(
      "SELECT actor_kind, actor_id FROM activities WHERE kind = 'client_services.task_review' AND json_extract(data_json, '$.taskId') = ?",
      [approved],
    );
    expect(log).toEqual({ actor_kind: "system", actor_id: "client-services" });
    const sentBack = await reviewCard(ORGS.abracadabra, "t-cs-back");
    expect(await clientServicesReview(sql, { taskId: sentBack, action: "send_back", note: "Fix the header", now: NOW + 4 })).toMatchObject({ ok: true, column: "doing" });
    expect(await clientServicesReview(sql, { taskId: sentBack, action: "send_back", now: NOW + 4 })).toMatchObject({ ok: false });
  });
});

describe("card briefs and the extra agent reads", () => {
  it("create stores a description with requirements and acceptance criteria; board GET and task GET return them", async () => {
    const created = await boardCreatePost(new Request("https://hq.example/api/agent-board/tasks", bearer("abracadabra-client", {
      method: "POST",
      body: JSON.stringify({
        title: "Search tab polish",
        client: { organization_id: ORGS.abracadabra },
        description: "Tidy the Search tab.",
        requirements: ["Totals compare with the previous period", "Empty state says why"],
        acceptance_criteria: "- Screenshot attached\n- Tests pass",
      }),
    })));
    expect(created.status).toBe(201);
    const made = (await created.json()) as { task: { id: string; description: string; requirements: string[]; acceptance_criteria: string[] } };
    expect(made.task).toMatchObject({
      description: "Tidy the Search tab.",
      requirements: ["Totals compare with the previous period", "Empty state says why"],
      acceptance_criteria: ["Screenshot attached", "Tests pass"],
    });
    const board = await boardGet(new Request(`https://hq.example/api/agent-board?client=${ORGS.abracadabra}`, bearer("scrum-master")));
    const listed = ((await board.json()) as { tasks: { id: string; description: string | null }[] }).tasks.find((task) => task.id === made.task.id);
    expect(listed).toMatchObject({ description: "Tidy the Search tab.", described_by: "abracadabra-client" });
    const one = await boardTaskGet(new Request(`https://hq.example/api/agent-board/tasks/${made.task.id}`, bearer("scrum-master")), { params: Promise.resolve({ taskId: made.task.id }) });
    expect(one.status).toBe(200);
    expect(((await one.json()) as { task: unknown }).task).toMatchObject({ id: made.task.id, requirements: ["Totals compare with the previous period", "Empty state says why"] });
  });

  it("an old card's note reads as its description; describe updates it and keeps fields not sent", async () => {
    const lead = await principal("abracadabra-client");
    const created = await boardCreatePost(new Request("https://hq.example/api/agent-board/tasks", bearer("abracadabra-client", {
      method: "POST", body: JSON.stringify({ title: "Old style card", client: { organization_id: ORGS.abracadabra }, note: "Spec lives in the note." }),
    })));
    const id = ((await created.json()) as { task: { id: string } }).task.id;
    let board = await listAgentBoard(sql, lead, {});
    expect(board.ok && board.tasks.find((task) => task.id === id)?.description).toBe("Spec lives in the note.");
    const described = await postBoard("abracadabra-client", id, { action: "describe", acceptance_criteria: ["Reviewer can check it"] });
    expect(described.status).toBe(200);
    board = await listAgentBoard(sql, lead, {});
    expect(board.ok && board.tasks.find((task) => task.id === id)).toMatchObject({
      description: "Spec lives in the note.", acceptance_criteria: ["Reviewer can check it"], requirements: [],
    });
    // A hire that does not own the card can't rewrite it (it adds a note instead).
    expect((await postBoard("seo-analytics", id, { action: "describe", description: "Mine now" })).status).toBe(403);
    expect((await postBoard("abracadabra-client", id, { action: "describe", requirements: [1] })).status).toBe(400);
  });

  it("GET /api/agent-board/tasks/<id> is org-scoped: 404 for another client's card, 401 without a token", async () => {
    const foreign = await reviewCard(UNASSIGNED, "t-get-foreign");
    const refused = await boardTaskGet(new Request(`https://hq.example/api/agent-board/tasks/${foreign}`, bearer("scrum-master")), { params: Promise.resolve({ taskId: foreign }) });
    expect(refused.status).toBe(404);
    const missing = await boardTaskGet(new Request("https://hq.example/api/agent-board/tasks/nope", bearer("scrum-master")), { params: Promise.resolve({ taskId: "nope" }) });
    expect(missing.status).toBe(404);
    const anonymous = await boardTaskGet(new Request(`https://hq.example/api/agent-board/tasks/${foreign}`), { params: Promise.resolve({ taskId: foreign }) });
    expect(anonymous.status).toBe(401);
    const own = await boardTaskGet(new Request(`https://hq.example/api/agent-board/tasks/${foreign}`, bearer("everleigh-lead")), { params: Promise.resolve({ taskId: foreign }) });
    expect(own.status).toBe(200);
  });

  it("filings carry skills_used on the agent-work GETs and on the task GET, with the card's brief on one filing", async () => {
    const taskId = await reviewCard(ORGS.liocorr, "t-skills");
    await sql.run(
      `INSERT INTO activities (id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at)
       VALUES ('act-desc', ?, ?, 'client_agent.board', 'agent', 'scrum-master', 'described', ?, ?)`,
      [ORGS.liocorr, `proj-${ORGS.liocorr}`, JSON.stringify({ action: "describe", task_id: taskId, description: "LioCorr card brief", requirements: ["R1"], acceptance_criteria: ["A1"] }), NOW + 2],
    );
    await sql.run(
      `INSERT INTO agent_work_items (id, agent_id, external_id, state, kind, title, organization_id, task_id, filed_at, created_at, updated_at, skills_used_json, context_md)
       VALUES ('w-skills', 'seo-analytics', 'ext-s', 'filed', 'note', 'Audit', ?, ?, ?, ?, ?, ?, 'body')`,
      [ORGS.liocorr, taskId, NOW + 3, NOW, NOW, JSON.stringify(["plugins/superpowers/test-driven-development/SKILL.md"])],
    );
    const list = await workListGet(new Request(`https://hq.example/api/agent-work?client=${ORGS.liocorr}`, bearer("scrum-master")));
    const items = ((await list.json()) as { items: { id: string; skills_used: string[] }[] }).items;
    expect(items.find((item) => item.id === "w-skills")?.skills_used).toEqual(["plugins/superpowers/test-driven-development/SKILL.md"]);
    const one = await workItemGet(new Request("https://hq.example/api/agent-work/w-skills", bearer("scrum-master")), { params: Promise.resolve({ id: "w-skills" }) });
    expect(await one.json()).toMatchObject({
      skills_used: ["plugins/superpowers/test-driven-development/SKILL.md"],
      task: { id: taskId, description: "LioCorr card brief", requirements: ["R1"], acceptance_criteria: ["A1"] },
    });
    const card = await boardTaskGet(new Request(`https://hq.example/api/agent-board/tasks/${taskId}`, bearer("scrum-master")), { params: Promise.resolve({ taskId }) });
    expect(((await card.json()) as { task: unknown }).task).toMatchObject({
      description: "LioCorr card brief",
      filings: [{ id: "w-skills", skills_used: ["plugins/superpowers/test-driven-development/SKILL.md"] }],
    });
    // Another client's agent can't read the filing.
    const foreign = await workItemGet(new Request("https://hq.example/api/agent-work/w-skills", bearer("everleigh-lead")), { params: Promise.resolve({ id: "w-skills" }) });
    expect(foreign.status).toBe(404);
  });
});
