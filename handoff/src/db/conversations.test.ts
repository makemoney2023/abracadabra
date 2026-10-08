import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { listClientThreads, recordStaffReply, recordThreadMessage, setWorkRequestState, threadState, workRequestById } from "./conversations";
import { migrate } from "./migrate";
import { sqliteSql, type Sql } from "./sql";

const NOW = 1_700_000_000_000;
let sql: Sql;

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
});

const message = {
  organizationId: "org-1",
  channel: "email" as const,
  threadId: "<m-1>",
  sender: "ada@client.example",
  asked: true,
  replyBody: "Got it. What should this achieve?",
};

describe("client threads", () => {
  it("keeps one open request per thread and counts what was asked", async () => {
    const first = await recordThreadMessage(sql, { ...message, body: "Please add a pricing page.", state: "clarifying" }, NOW);
    const second = await recordThreadMessage(
      sql,
      { ...message, body: "So that buyers can compare, by Friday.", state: "proposed", goal: "compare", dueText: "Friday", asked: false, replyBody: "Got it." },
      NOW + 1000,
    );
    expect(second).toBe(first);
    const row = await workRequestById(sql, first);
    expect(row?.state).toBe("proposed");
    expect(row?.question_count).toBe(1);
    expect(row?.body).toBe("Please add a pricing page.\n\nSo that buyers can compare, by Friday.");
    expect(row?.due_text).toBe("Friday");
    const state = await threadState(sql, "org-1", "<m-1>", NOW + 2000);
    expect(state).toEqual({ replies: 2, questionCount: 1, text: row?.body });
  });

  it("starts a new request once the last one was decided", async () => {
    const first = await recordThreadMessage(sql, { ...message, body: "Add a page.", state: "proposed" }, NOW);
    await setWorkRequestState(sql, first, { state: "declined", decidedBy: "staff-1", declineReason: "Not this quarter." }, NOW);
    const declined = await workRequestById(sql, first);
    expect(declined).toMatchObject({ state: "declined", decided_by: "staff-1", decline_reason: "Not this quarter." });
    const next = await recordThreadMessage(sql, { ...message, body: "Add a blog instead.", state: "clarifying" }, NOW + 1);
    expect(next).not.toBe(first);
  });

  it("lists a thread in order and marks a staff reply", async () => {
    await recordThreadMessage(sql, { ...message, body: "Please add a page.", state: "clarifying" }, NOW);
    await recordThreadMessage(sql, { ...message, body: "By Friday.", state: "proposed", asked: false }, NOW + 1);
    await recordStaffReply(sql, { organizationId: "org-1", userId: "staff-1", threadId: "<m-1>", channel: "email", body: "We can do Friday." }, NOW + 2);
    const threads = await listClientThreads(sql, "org-1");
    expect(threads).toHaveLength(1);
    expect(threads[0]?.messages.map((row) => row.body)).toEqual([
      "Please add a page.",
      "Got it. What should this achieve?",
      "By Friday.",
      "Got it. What should this achieve?",
      "We can do Friday.",
    ]);
    expect(threads[0]?.messages.at(-1)?.actorKind).toBe("staff");
  });
});
