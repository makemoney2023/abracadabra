import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "@/db/migrate";
import { recordFeedback } from "@/db/deliverables";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { listAgentDispatches } from "./agent-dispatch";
import { agentForToken, registerClientAgent } from "./agent-work-filing";
import { CLIENT_CHANGES_KIND, openClientChangeRequest } from "./client-change-request";
import { listClientUpdates, readSpaceForReview } from "./client-work";
import { attachCardSkills, cardSkillPacks } from "./skill-packs";

const NOW = 1_800_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");

/**
 * A D1 stand-in over sqlite that refuses SQL transaction statements the way Cloudflare D1 does. The fakes in other
 * tests let a prepared BEGIN through, which is why the client feedback write never failed under test.
 */
function strictD1(db: DatabaseSync): D1Like {
  const refuse = (statement: string) => {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(statement)) {
      throw new Error(
        "D1_ERROR: To execute a transaction, please use the state.storage.transaction() or state.storage.transactionSync() APIs instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements.",
      );
    }
  };
  return {
    prepare: (statement: string) => ({
      bind: (...params: unknown[]) => {
        const args = params as never[];
        return {
          run: async () => {
            refuse(statement);
            return db.prepare(statement).run(...args);
          },
          all: async <T>() => ({ results: db.prepare(statement).all(...args) as T[] }),
          first: async <T>() => (db.prepare(statement).get(...args) as T | undefined) ?? null,
          statement,
          args,
        };
      },
    }),
    exec: async (statement: string) => {
      refuse(statement);
      db.exec(statement);
    },
    batch: async (statements: unknown[]) => {
      db.exec("BEGIN");
      try {
        for (const entry of statements as { statement: string; args: never[] }[]) db.prepare(entry.statement).run(...entry.args);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Like;
}

let sql: Sql;
const ids = { org: "org-abra", project: "proj-social", space: "ws-abra", deliverable: "del-1", item: "item-1", item2: "item-2", task: "task-1" };

const clientCaller: Caller = {
  userId: "client-1",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: ids.space, role: "client_member" }],
};

async function agent(agentId: string, role: "lead" | "hire") {
  const made = await registerClientAgent(sql, { agentId, label: agentId, organizationId: ids.org, role, actor: "test", now: NOW });
  if (!made.ok) throw new Error("register failed");
  const principal = await agentForToken(sql, `Bearer ${made.token as string}`);
  if (!principal) throw new Error("token failed");
  return principal;
}

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const d1 = strictD1(db);
  // Migrations run on plain sqlite; the code under test runs through the strict D1 stand-in.
  const { sqliteSql } = await import("@/db/sql");
  await migrate(sqliteSql(db));
  sql = d1Sql(d1);
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, 'Abracadabra', 'abra-ca-dabra.app', 'client', ?, ?)", [ids.org, NOW, NOW]);
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Social', 'active', ?, ?)", [ids.project, ids.org, NOW, NOW]);
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES (?, 'abra-ca-dabra-app', 'Abracadabra', 'Abracadabra', 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?, ?)`,
    [ids.space, NOW, ids.org, ids.project],
  );
  await sql.run(
    "INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at) VALUES ('mem-1', ?, 'client-1', 'client@example.com', 'client_member', ?, NULL)",
    [ids.space, NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (id, organization_id, project_id, workspace_id, title, kind, status, version, published_version, published_at, actor_kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Social media: Facebook posts', 'document', 'in_review', 1, 1, ?, 'system', ?, ?)`,
    [ids.deliverable, ids.org, ids.project, ids.space, NOW, NOW, NOW],
  );
  for (const [id, title, sort] of [[ids.item, "facebook-posts.md", 0], [ids.item2, "linkedin-banner.png", 1]] as const) {
    await sql.run(
      `INSERT INTO deliverable_items (id, deliverable_id, version, format, title, copy_text, media_json, status, sort)
       VALUES (?, ?, 1, 'page', ?, 'Copy', '[]', 'pending', ?)`,
      [id, ids.deliverable, title, sort],
    );
  }
  await sql.run(
    `INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at, done_at, stage, skills_json, created_by_kind, round, position, deliverable_id)
     VALUES (?, ?, ?, 'Social media: Facebook posts', 'done', ?, ?, ?, 'describe', '[]', 'agent', 1, 0, ?)`,
    [ids.task, ids.project, ids.org, NOW, NOW, NOW, ids.deliverable],
  );
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.AGENT_MODE;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("client feedback on D1", () => {
  it("saves an Ask for changes on finished work (D1 refuses SQL BEGIN; this used to throw)", async () => {
    const saved = await recordFeedback(
      sql,
      clientCaller,
      { deliverableId: ids.deliverable, itemId: ids.item, version: 1, decision: "changes", body: "Make the first post shorter." },
      NOW + 1,
    );
    expect(saved.ok).toBe(true);
    const feedback = await sql.all<{ id: string; decision: string; body: string; item_id: string; version: number; author_kind: string }>(
      "SELECT id, decision, body, item_id, version, author_kind FROM deliverable_feedback",
    );
    expect(feedback).toEqual([
      expect.objectContaining({ decision: "changes", body: "Make the first post shorter.", item_id: ids.item, version: 1, author_kind: "client" }),
    ]);
    if (saved.ok) expect(saved.value.feedbackId).toBe(feedback[0].id);
    const row = await sql.get<{ status: string }>("SELECT status FROM deliverables WHERE id = ?", [ids.deliverable]);
    expect(row?.status).toBe("changes_requested");
  });

  it("saves approvals and notes too", async () => {
    await expect(
      recordFeedback(sql, clientCaller, { deliverableId: ids.deliverable, itemId: ids.item2, version: 1, decision: "approve", body: "" }, NOW + 1),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      recordFeedback(sql, clientCaller, { deliverableId: ids.deliverable, itemId: null, version: 1, decision: "comment", body: "Love it" }, NOW + 2),
    ).resolves.toMatchObject({ ok: true });
  });

  it("leaves nothing behind when one write fails", async () => {
    await sql.run("DROP TABLE activities");
    await expect(
      recordFeedback(sql, clientCaller, { deliverableId: ids.deliverable, itemId: ids.item, version: 1, decision: "changes", body: "x" }, NOW + 1),
    ).rejects.toThrow();
    const count = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM deliverable_feedback");
    expect(count?.n).toBe(0);
  });
});

describe("openClientChangeRequest", () => {
  it("opens a To do card for the lead agent with the note and link, hands it over, and tells Client Services", async () => {
    const lead = await agent("abracadabra-client", "lead");
    await attachCardSkills(sql, { taskId: ids.task, prefixes: ["marketing/social"], actor: { kind: "agent", id: "abracadabra-client" }, now: NOW });
    const opened = await openClientChangeRequest(sql, {
      deliverableId: ids.deliverable,
      itemId: ids.item,
      version: 1,
      feedbackId: "fb-1",
      note: "Make the first post shorter.",
      author: { kind: "client", id: "client-1" },
      now: NOW + 5,
    });
    expect(opened).toMatchObject({ created: true, agentId: "abracadabra-client" });
    const card = await sql.get<{
      title: string; status: string; stage: string; project_id: string; deliverable_id: string; round: number; assignee_agent_id: string; review_note: string;
    }>("SELECT title, status, stage, project_id, deliverable_id, round, assignee_agent_id, review_note FROM tasks WHERE id = ?", [opened!.taskId]);
    expect(card).toMatchObject({
      title: "Changes requested: Social media: Facebook posts",
      status: "todo",
      stage: "describe",
      project_id: ids.project,
      deliverable_id: ids.deliverable,
      round: 2,
      assignee_agent_id: "abracadabra-client",
    });
    expect(card?.review_note).toContain('on "facebook-posts.md" (v1): Make the first post shorter.');
    expect(card?.review_note).toContain("https://handoff.abra-ca-dabra.app/w/abra-ca-dabra-app/work/del-1");
    expect(await cardSkillPacks(sql, opened!.taskId)).toEqual(["marketing/social"]);

    const dispatches = await listAgentDispatches(sql, lead);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({ task_id: opened!.taskId, deliverable_id: ids.deliverable, reason: "changes", project_id: ids.project });
    expect(dispatches[0].note).toContain("Make the first post shorter.");

    const activity = await sql.get<{ data_json: string; body: string }>("SELECT data_json, body FROM activities WHERE kind = ?", [CLIENT_CHANGES_KIND]);
    expect(JSON.parse(activity!.data_json)).toMatchObject({
      deliverable_id: ids.deliverable, version: 1, item_id: ids.item, feedback_id: "fb-1", task_id: opened!.taskId, to: "abracadabra-client",
    });
    const updates = await listClientUpdates(sql, { since: null, now: NOW + 10_000, origin: "https://hq.example" });
    if (!Array.isArray(updates)) throw new Error("bad feed");
    const update = updates.find((row) => row.kind === CLIENT_CHANGES_KIND);
    expect(update?.summary).toContain("asked for changes");
    expect(update?.links.map((link) => link.url)).toContain("https://handoff.abra-ca-dabra.app/w/abra-ca-dabra-app/work/del-1");
    expect(updates.some((row) => row.kind === "client_agent.dispatch")).toBe(true);
  });

  it("gives the card to the original card's agent while it is still on the client", async () => {
    await agent("abracadabra-client", "lead");
    await agent("social-hire", "hire");
    await sql.run("UPDATE tasks SET assignee_agent_id = 'social-hire' WHERE id = ?", [ids.task]);
    const opened = await openClientChangeRequest(sql, {
      deliverableId: ids.deliverable, itemId: null, version: 1, feedbackId: null, note: "Swap the photo.", author: { kind: "client", id: "client-1" }, now: NOW + 5,
    });
    expect(opened?.agentId).toBe("social-hire");
    const card = await sql.get<{ assignee_agent_id: string }>("SELECT assignee_agent_id FROM tasks WHERE id = ?", [opened!.taskId]);
    expect(card?.assignee_agent_id).toBe("social-hire");
  });

  it("adds a second ask to the open change card instead of opening another", async () => {
    const lead = await agent("abracadabra-client", "lead");
    const first = await openClientChangeRequest(sql, {
      deliverableId: ids.deliverable, itemId: ids.item, version: 1, feedbackId: null, note: "Shorter.", author: { kind: "client", id: "client-1" }, now: NOW + 5,
    });
    const second = await openClientChangeRequest(sql, {
      deliverableId: ids.deliverable, itemId: ids.item2, version: 1, feedbackId: null, note: "Brighter banner.", author: { kind: "client", id: "client-1" }, now: NOW + 6,
    });
    expect(second).toMatchObject({ taskId: first!.taskId, created: false });
    const open = await sql.all<{ id: string; review_note: string }>("SELECT id, review_note FROM tasks WHERE status != 'done'");
    expect(open).toHaveLength(1);
    expect(open[0].review_note).toContain("Shorter.");
    expect(open[0].review_note).toContain("Brighter banner.");
    expect(await listAgentDispatches(sql, lead)).toHaveLength(2);
  });

  it("opens a card even when no card built the piece, and says it needs a lead when none is assigned", async () => {
    await sql.run("DELETE FROM tasks");
    const opened = await openClientChangeRequest(sql, {
      deliverableId: ids.deliverable, itemId: null, version: 1, feedbackId: null, note: "Fix the typo.", author: { kind: "client", id: "client-1" }, now: NOW + 5,
    });
    expect(opened).toMatchObject({ created: true, agentId: null });
    const card = await sql.get<{ round: number; stage: string }>("SELECT round, stage FROM tasks WHERE id = ?", [opened!.taskId]);
    expect(card).toEqual({ round: 1, stage: "describe" });
    const dispatch = await sql.get<{ body: string }>("SELECT body FROM activities WHERE kind = 'client_agent.dispatch'");
    expect(dispatch?.body).toContain("needs a lead agent");
  });

  it("leaves briefs to their own flow", async () => {
    await sql.run("UPDATE deliverables SET kind = 'brief' WHERE id = ?", [ids.deliverable]);
    await expect(
      openClientChangeRequest(sql, {
        deliverableId: ids.deliverable, itemId: null, version: 1, feedbackId: null, note: "No.", author: { kind: "client", id: "client-1" }, now: NOW,
      }),
    ).resolves.toBeNull();
  });
});

describe("Ask for changes from the client space (server action)", () => {
  async function action() {
    vi.doMock("@/lib/current", () => ({ openSession: async () => ({ sql, caller: clientCaller }) }));
    vi.doMock("next/cache", () => ({ revalidatePath: () => undefined }));
    vi.doMock("next/navigation", () => ({
      redirect: (url: string) => {
        throw Object.assign(new Error(`REDIRECT ${url}`), { url });
      },
    }));
    return (await import("@/app/w/[slug]/work/actions")).feedbackAction;
  }

  function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  it("captures the note, opens a card for the agent, and lands on a confirmation", async () => {
    process.env.AGENT_MODE = "agents";
    const lead = await agent("abracadabra-client", "lead");
    const feedbackAction = await action();
    await expect(
      feedbackAction(
        { message: "" },
        form({ slug: "abra-ca-dabra-app", deliverableId: ids.deliverable, itemId: ids.item, version: "1", decision: "changes", body: "Make the first post shorter." }),
      ),
    ).rejects.toMatchObject({ url: `/w/abra-ca-dabra-app/work/${ids.deliverable}?sent=changes` });
    const cards = await sql.all<{ id: string; title: string; stage: string; assignee_agent_id: string }>(
      "SELECT id, title, stage, assignee_agent_id FROM tasks WHERE status != 'done'",
    );
    expect(cards).toEqual([expect.objectContaining({ stage: "describe", assignee_agent_id: "abracadabra-client" })]);
    const dispatches = await listAgentDispatches(sql, lead);
    expect(dispatches[0]).toMatchObject({ task_id: cards[0].id, reason: "changes" });
    const review = await readSpaceForReview(sql, ids.space);
    expect(review?.deliverables[0]).toMatchObject({ status: "changes_requested", client_services: "changes_requested" });
    const feedback = await sql.get<{ id: string }>("SELECT id FROM deliverable_feedback");
    const activity = await sql.get<{ data_json: string }>("SELECT data_json FROM activities WHERE kind = ?", [CLIENT_CHANGES_KIND]);
    expect(JSON.parse(activity!.data_json).feedback_id).toBe(feedback?.id);
  });

  it("shows a friendly message instead of crashing when the save fails", async () => {
    process.env.AGENT_MODE = "agents";
    await sql.run("DROP TABLE activities");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const feedbackAction = await action();
    const state = await feedbackAction(
      { message: "" },
      form({ slug: "abra-ca-dabra-app", deliverableId: ids.deliverable, itemId: ids.item, version: "1", decision: "changes", body: "Shorter." }),
    );
    expect(state.message).toBe("That didn't go through. Please try again in a minute.");
    expect(errors).toHaveBeenCalled();
  });
});
