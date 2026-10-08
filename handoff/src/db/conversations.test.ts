import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { deskContext, listClientThreads, recordStaffReply, recordThreadMessage, setWorkRequestState, threadState, workRequestById } from "./conversations";
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

  it("returns only this client's published desk", async () => {
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-2', 'Harbor', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purge_after, purged_at, organization_id
      ) VALUES (
        '11111111-1111-4111-8111-111111111111', 'northwind', 'Northwind', 'Northwind', NULL, 'Northwind', 'standard',
        1, 1, 0, 'active', ?, NULL, NULL, NULL, 'org-1'
      )`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
       VALUES ('proj-1', 'org-1', 'Site', 'active', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverables (
        id, organization_id, project_id, workspace_id, title, kind, status, version,
        published_at, actor_kind, created_at, updated_at, published_version
      ) VALUES ('brief-1', 'org-1', 'proj-1', '11111111-1111-4111-8111-111111111111', 'Brief', 'brief', 'approved', 1, ?, 'staff', ?, ?, 1)`,
      [NOW, NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
        id, deliverable_id, version, format, title, copy_text, media_json, status, sort
      ) VALUES ('item-1', 'brief-1', 1, 'page', 'brief.md', 'They sell foam.', '[]', 'approved', 0)`,
    );
    await sql.run(
      `INSERT INTO deliverables (
        id, organization_id, project_id, workspace_id, title, kind, status, version,
        actor_kind, created_at, updated_at, published_version
      ) VALUES ('brief-draft', 'org-1', 'proj-1', '11111111-1111-4111-8111-111111111111', 'Draft', 'brief', 'draft', 2, 'staff', ?, ?, NULL)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
        id, deliverable_id, version, format, title, copy_text, media_json, status, sort
      ) VALUES ('item-draft', 'brief-draft', 2, 'page', 'brief.md', 'Unpublished secret.', '[]', 'pending', 0)`,
    );
    await sql.run(
      `INSERT INTO status_updates (
        id, project_id, organization_id, health, audience, body, state, actor_kind, created_at, published_at
      ) VALUES ('stat-1', 'proj-1', 'org-1', 'on_track', 'client', 'Copy is in review.', 'published', 'staff', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purge_after, purged_at, organization_id
      ) VALUES (
        '22222222-2222-4222-8222-222222222222', 'harbor', 'Harbor', 'Harbor', NULL, 'Harbor', 'standard',
        1, 1, 0, 'active', ?, NULL, NULL, NULL, 'org-2'
      )`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO deliverables (
        id, organization_id, project_id, workspace_id, title, kind, status, version,
        published_at, actor_kind, created_at, updated_at, published_version
      ) VALUES ('brief-2', 'org-2', NULL, '22222222-2222-4222-8222-222222222222', 'Other', 'brief', 'approved', 1, ?, 'staff', ?, ?, 1)`,
      [NOW, NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
        id, deliverable_id, version, format, title, copy_text, media_json, status, sort
      ) VALUES ('item-2', 'brief-2', 1, 'page', 'brief.md', 'Harbor private.', '[]', 'approved', 0)`,
    );
    await recordThreadMessage(sql, { ...message, body: "Where are we?", state: "clarifying", replyBody: "Checking." }, NOW);
    const desk = await deskContext(sql, "org-1", "<m-1>");
    expect(desk.name).toBe("Northwind");
    expect(desk.brief).toBe("They sell foam.");
    expect(desk.brief).not.toContain("Unpublished");
    expect(desk.brief).not.toContain("Harbor");
    expect(desk.status).toBe("Copy is in review.");
    expect(desk.messages.map((row) => row.body)).toEqual(["Where are we?", "Checking."]);
    const missing = await deskContext(sql, "missing", "<m-1>");
    expect(missing).toEqual({ name: "", brief: "", status: "", requests: [], messages: [] });
  });
});
