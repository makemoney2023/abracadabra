import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { POST as workPost } from "@/app/api/intake/work-request/route";
import { GET as updatesGet } from "@/app/api/client-services/updates/route";
import { GET as spaceGet } from "@/app/api/client-services/spaces/[spaceId]/route";
import { POST as reviewPost } from "@/app/api/client-services/spaces/[spaceId]/review/route";
import { approveWorkRequest, consumeWorkRequest, listClientUpdates, syncClientUpdates, workRequestBodyReady } from "./client-work";
import { consumeIntake } from "./intake/consume";
import { handleLeadIntakeBatch } from "./intake/queue";
import { signIntakeBody } from "./intake/sign";
import { markTaskDone } from "./task-done";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.CLIENT_SERVICES_SIGNING_SECRET;
  delete process.env.CLIENT_SERVICES_TOKEN;
});

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

async function setup(): Promise<{ sql: Sql; d1: D1Like }> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const d1 = d1Over(db);
  const sql = d1Sql(d1);
  await migrate(sql);
  return { sql, d1 };
}

async function client(sql: Sql, domain = "acme.example", kind = "client"): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    "INSERT INTO organizations (id, name, domain, website, kind, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)",
    [id, "Acme", domain, kind, NOW, NOW],
  );
  return id;
}

async function project(sql: Sql, organizationId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    "INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)",
    [id, organizationId, name, NOW, NOW],
  );
  return id;
}

const request = {
  source_message_id: "<msg-1@mail.example>",
  client_email: "pat@acme.example",
  subject: "New landing page for spring promo",
  brief: { request: "Build a spring promo landing page.", deliverables: ["Landing page", "Hero copy"], deadline: "2026-11-01" },
  attachments: ["https://drive.example/brief.pdf"],
};

describe("work-request intake route", () => {
  it("rejects a bad signature and queues a signed request", async () => {
    process.env.CLIENT_SERVICES_SIGNING_SECRET = "cs-key";
    const sent: unknown[] = [];
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { LEAD_INTAKE: { send: async (b: unknown) => void sent.push(b) } } };
    const body = JSON.stringify(request);
    const ts = String(Date.now());
    const bad = await workPost(new Request("https://hq.example/api/intake/work-request", { method: "POST", body, headers: { "x-intake-signature": "00", "x-intake-timestamp": ts } }));
    expect(bad.status).toBe(401);
    const other = await workPost(new Request("https://hq.example/api/intake/work-request", { method: "POST", body, headers: { "x-intake-signature": await signIntakeBody("lead-key", body), "x-intake-timestamp": ts } }));
    expect(other.status).toBe(401);
    const ok = await workPost(new Request("https://hq.example/api/intake/work-request", { method: "POST", body, headers: { "x-intake-signature": await signIntakeBody("cs-key", body), "x-intake-timestamp": ts } }));
    expect(ok.status).toBe(202);
    expect(sent).toEqual([{ source: "work_request", payload: request }]);
  });

  it("validates the body", () => {
    expect(workRequestBodyReady(request)).toBe(true);
    expect(workRequestBodyReady({ ...request, source_message_id: "" })).toBe(false);
    expect(workRequestBodyReady({ ...request, client_email: undefined })).toBe(false);
    expect(workRequestBodyReady({ ...request, client_email: undefined, client_domain: "acme.example" })).toBe(true);
    expect(workRequestBodyReady({ ...request, brief: "plain text brief" })).toBe(true);
    expect(workRequestBodyReady({ ...request, estimate_hours: "lots" })).toBe(false);
  });
});

describe("consumeWorkRequest", () => {
  it("creates a project, Space, task and brief for a known client with no open project", async () => {
    const { sql } = await setup();
    const org = await client(sql);
    const result = await consumeWorkRequest(sql, request, NOW);
    expect(result).toMatchObject({ ok: true, duplicate: false, state: "accepted", kickoffOrganizationId: org });
    const row = await sql.get<{ state: string; project_id: string; workspace_id: string; task_id: string; match_kind: string }>(
      "SELECT state, project_id, workspace_id, task_id, match_kind FROM client_work_requests",
    );
    expect(row).toMatchObject({ state: "accepted", match_kind: "new" });
    const space = await sql.get<{ project_id: string; organization_id: string }>("SELECT project_id, organization_id FROM workspaces WHERE id = ?", [row!.workspace_id]);
    expect(space).toEqual({ project_id: row!.project_id, organization_id: org });
    const task = await sql.get<{ stage: string; status: string; project_id: string }>("SELECT stage, status, project_id FROM tasks WHERE id = ?", [row!.task_id]);
    expect(task).toEqual({ stage: "describe", status: "todo", project_id: row!.project_id });
    const brief = await sql.get<{ body: string }>("SELECT body FROM activities WHERE kind = 'agent.task_brief'");
    expect(brief?.body).toContain("Landing page");
    expect(brief?.body).toContain("Deadline: 2026-11-01");
    expect(brief?.body).toContain("https://drive.example/brief.pdf");
    expect(await consumeWorkRequest(sql, request, NOW)).toMatchObject({ ok: true, duplicate: true });
  });

  it("attaches to the only open project, or the hinted one", async () => {
    const { sql } = await setup();
    const org = await client(sql);
    const only = await project(sql, org, "Website");
    await consumeWorkRequest(sql, request, NOW);
    const second = await project(sql, org, "Ads");
    await consumeWorkRequest(sql, { ...request, source_message_id: "m2", project_id: second }, NOW);
    const rows = await sql.all<{ project_id: string; match_kind: string }>("SELECT project_id, match_kind FROM client_work_requests ORDER BY created_at, match_kind");
    expect(rows).toEqual(expect.arrayContaining([
      { project_id: only, match_kind: "only_open" },
      { project_id: second, match_kind: "hint" },
    ]));
    expect(await sql.get<{ n: number }>("SELECT count(*) AS n FROM projects")).toEqual({ n: 2 });
  });

  it("holds unknown, ambiguous and oversized requests for approval", async () => {
    const { sql } = await setup();
    expect(await consumeWorkRequest(sql, request, NOW)).toMatchObject({ state: "needs_approval" });
    const org = await client(sql);
    await project(sql, org, "Website");
    await project(sql, org, "Ads");
    expect(await consumeWorkRequest(sql, { ...request, source_message_id: "m2" }, NOW)).toMatchObject({ state: "needs_approval" });
    expect(await consumeWorkRequest(sql, { ...request, source_message_id: "m3", subject: "Ads refresh" }, NOW)).toMatchObject({ state: "accepted" });
    expect(await consumeWorkRequest(sql, { ...request, source_message_id: "m4", subject: "Ads", estimate_hours: 40 }, NOW)).toMatchObject({ state: "needs_approval" });
    const reasons = await sql.all<{ approval_reason: string }>("SELECT approval_reason FROM client_work_requests WHERE state = 'needs_approval' ORDER BY created_at, approval_reason");
    expect(reasons.map((r) => r.approval_reason).sort()).toEqual(["ambiguous_project", "over_size_threshold", "unknown_client"]);
    expect(await sql.get<{ n: number }>("SELECT count(*) AS n FROM tasks")).toEqual({ n: 1 });
    const held = await sql.get<{ id: string }>("SELECT id FROM client_work_requests WHERE approval_reason = 'unknown_client'");
    expect(await approveWorkRequest(sql, { id: held!.id, actor: "staff-1", now: NOW })).toEqual({ ok: false, error: "needs_client" });
    expect(await approveWorkRequest(sql, { id: held!.id, organizationId: org, projectId: "new", actor: "staff-1", now: NOW })).toEqual({ ok: true, organizationId: org });
    expect(await sql.get<{ state: string }>("SELECT state FROM client_work_requests WHERE id = ?", [held!.id])).toEqual({ state: "accepted" });
  });
});

describe("queue kickoff, update feed and review", () => {
  // These cover the old wake path, which now needs AGENT_WAKES=all (the default is off).
  beforeEach(() => {
    process.env.AGENT_WAKES = "all";
  });
  afterEach(() => {
    delete process.env.AGENT_WAKES;
  });

  it("wakes the agent, reports back, and lets Client Services approve", async () => {
    const { sql, d1 } = await setup();
    const org = await client(sql);
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return new Response("ok");
    }) as unknown as typeof fetch;
    let acked = 0;
    await handleLeadIntakeBatch(
      [{ body: { source: "work_request", payload: request }, ack: () => void (acked += 1), retry: () => {} }],
      d1,
      NOW,
      { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake" },
      fetchImpl,
    );
    expect(acked).toBe(1);
    expect(calls).toEqual(["https://agent.example/wake"]);
    const kickoff = await sql.get<{ data_json: string }>("SELECT data_json FROM activities WHERE kind = 'client_work.kickoff'");
    expect(JSON.parse(kickoff!.data_json)).toMatchObject({ woke: 1 });

    const row = await sql.get<{ task_id: string; workspace_id: string; project_id: string }>("SELECT task_id, workspace_id, project_id FROM client_work_requests");
    const deliverableId = crypto.randomUUID();
    await sql.run(
      `INSERT INTO deliverables (id, organization_id, project_id, workspace_id, title, kind, status, version, published_at, actor_kind, created_at, updated_at, published_version)
       VALUES (?, ?, ?, ?, 'Promo page', 'website', 'in_review', 1, ?, 'agent', ?, ?, 1)`,
      [deliverableId, org, row!.project_id, row!.workspace_id, NOW + 5, NOW + 5, NOW + 5],
    );
    await sql.run(
      `INSERT INTO deliverable_items (id, deliverable_id, version, format, title, status, sort) VALUES (?, ?, 1, 'page', 'Home', 'pending', 0)`,
      [crypto.randomUUID(), deliverableId],
    );
    await markTaskDone(sql, { taskId: row!.task_id, now: NOW + 10, actor: { kind: "agent", id: "handoff-agent" } });

    // The route syncs from the wall clock's last week; these rows are dated NOW, so sync them first.
    expect(await syncClientUpdates(sql, NOW + 20, "https://hq.example")).toBe(3);
    process.env.CLIENT_SERVICES_TOKEN = "cs-token";
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
    const denied = await updatesGet(new Request("https://hq.example/api/client-services/updates"));
    expect(denied.status).toBe(401);
    const res = await updatesGet(new Request(`https://hq.example/api/client-services/updates?since=${NOW - 1}`, { headers: { authorization: "Bearer cs-token" } }));
    expect(res.status).toBe(200);
    const { updates } = (await res.json()) as { updates: { kind: string; project: { id: string } | null; needs_review: { deliverable_id: string }[]; links: { label: string }[] }[] };
    expect(updates.map((u) => u.kind)).toEqual(["client_work.accepted", "client_work.kickoff", "agent.task_stage"]);
    const done = updates[2];
    expect(done.project?.id).toBe(row!.project_id);
    expect(done.needs_review).toEqual([expect.objectContaining({ deliverable_id: deliverableId })]);
    expect(done.links.map((l) => l.label)).toEqual(expect.arrayContaining(["Space", "Review API", "Project"]));
    const again = await listClientUpdates(sql, { since: new Date(NOW + 10).toISOString(), now: NOW + 20, origin: "https://hq.example" });
    expect(again).toEqual([]);

    const ctx = { params: Promise.resolve({ spaceId: row!.workspace_id }) };
    const read = await spaceGet(new Request("https://hq.example/x", { headers: { authorization: "Bearer cs-token" } }), ctx);
    expect(read.status).toBe(200);
    const space = (await read.json()) as { deliverables: { id: string; items: unknown[] }[] };
    expect(space.deliverables[0]).toMatchObject({ id: deliverableId });
    const noBody = await reviewPost(
      new Request("https://hq.example/x", { method: "POST", headers: { authorization: "Bearer cs-token" }, body: JSON.stringify({ deliverable_id: deliverableId, decision: "changes" }) }),
      { params: Promise.resolve({ spaceId: row!.workspace_id }) },
    );
    expect(noBody.status).toBe(400);
    const approve = await reviewPost(
      new Request("https://hq.example/x", { method: "POST", headers: { authorization: "Bearer cs-token" }, body: JSON.stringify({ deliverable_id: deliverableId, decision: "approve", body: "Looks right." }) }),
      { params: Promise.resolve({ spaceId: row!.workspace_id }) },
    );
    expect(await approve.json()).toEqual({ ok: true, status: "approved" });
    expect(await sql.get("SELECT status FROM deliverables WHERE id = ?", [deliverableId])).toEqual({ status: "approved" });
    expect(await sql.get("SELECT decision, author_id FROM deliverable_feedback")).toEqual({ decision: "approve", author_id: "client-services" });
    expect(await sql.get("SELECT count(*) AS n FROM activities WHERE kind = 'client_services.approved'")).toEqual({ n: 1 });
    const wrongToken = await reviewPost(
      new Request("https://hq.example/x", { method: "POST", headers: { authorization: "Bearer nope" }, body: "{}" }),
      { params: Promise.resolve({ spaceId: row!.workspace_id }) },
    );
    expect(wrongToken.status).toBe(401);
  });

  it("deal-closed creates the project and Space", async () => {
    const { sql } = await setup();
    const org = await client(sql, "won.example", "lead");
    const dealId = crypto.randomUUID();
    await sql.run(
      "INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at) VALUES (?, ?, 'Won Co website', 'proposal', 'bdr', ?, ?)",
      [dealId, org, NOW, NOW],
    );
    expect(await consumeIntake(sql, { source: "deal_closed", payload: { external_id: "w1", deal_id: dealId } }, NOW)).toMatchObject({ ok: true, duplicate: false });
    const proj = await sql.get<{ id: string; deal_id: string; name: string }>("SELECT id, deal_id, name FROM projects WHERE organization_id = ?", [org]);
    expect(proj).toMatchObject({ deal_id: dealId, name: "Won Co website" });
    expect(await sql.get("SELECT project_id FROM workspaces WHERE organization_id = ?", [org])).toEqual({ project_id: proj!.id });
    expect(await sql.get("SELECT kind FROM organizations WHERE id = ?", [org])).toEqual({ kind: "client" });
  });
});
