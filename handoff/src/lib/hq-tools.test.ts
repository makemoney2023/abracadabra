import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { organizationForSlackChannel, recordThreadMessage, workRequestById } from "@/db/conversations";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { runHqTool, type HqToolResult } from "./hq-tools";

const NOW = 1_700_000_000_000;

const staff: Caller = {
  userId: "staff-1",
  staff: { superAdmin: false },
  operatorOf: [],
  memberships: [],
};

const outsider: Caller = {
  userId: "client-1",
  staff: null,
  operatorOf: [],
  memberships: [],
};

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at
     ) VALUES (
       'ws-1', 'strongfoam', 'Strongfoam', 'Strongfoam', NULL, 'Studio', 'standard',
       1000, 30, 0, 'active', ?
     )`,
    [NOW],
  );
  return sql;
}

describe("runHqTool", () => {
  it("refuses someone who is not staff and an unknown tool", async () => {
    const sql = await database();
    expect(await runHqTool(sql, outsider, { tool: "search_clients", input: {} }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await runHqTool(sql, staff, { tool: "nope", input: {}, idempotencyKey: "k" }, NOW)).toEqual({
      ok: false,
      error: "unknown",
    });
  });

  it("finds a client and stamps the staff write", async () => {
    const sql = await database();
    const created = await runHqTool(
      sql,
      staff,
      { tool: "create_client", input: { name: "Northwind" }, idempotencyKey: "create-1" },
      NOW,
    );
    expect(valueOf(created)).toBeDefined();
    const again = await runHqTool(
      sql,
      staff,
      { tool: "create_client", input: { name: "Other" }, idempotencyKey: "create-1" },
      NOW,
    );
    expect(again).toEqual(created);
    const found = await runHqTool(sql, staff, { tool: "search_clients", input: { query: "north" } }, NOW);
    expect(valueOf(found)).toHaveLength(1);
    const stamped = await sql.get<{ via: string }>(
      "SELECT json_extract(data_json, '$.via') AS via FROM activities WHERE actor_id = 'staff-1' AND created_at = ?",
      [NOW],
    );
    expect(stamped?.via).toBe("hq_chat");
    const missing = await runHqTool(sql, staff, { tool: "client_summary", input: { organizationId: "missing" } }, NOW);
    expect(missing).toEqual({ ok: false, error: "missing" });
  });

  it("previews a client-facing write and stores nothing until it is approved", async () => {
    const sql = await database();
    const created = await runHqTool(
      sql,
      staff,
      { tool: "create_client", input: { name: "Northwind" }, idempotencyKey: "org" },
      NOW,
    );
    const organizationId = String((valueOf(created) as { id?: string } | undefined)?.id ?? "");
    await sql.run("UPDATE workspaces SET organization_id = ? WHERE id = 'ws-1'", [organizationId]);
    const preview = await runHqTool(
      sql,
      staff,
      {
        tool: "add_work",
        input: { organizationId, kind: "page", outcome: "A landing page", goal: "so buyers can enquire", due: "Friday" },
        idempotencyKey: "work-1",
      },
      NOW,
    );
    expect(preview).toEqual({ needsApproval: true, preview: "Approve add_work for Northwind." });
    const briefs = await sql.get<{ count: number }>("SELECT COUNT(*) AS count FROM deliverables");
    expect(briefs?.count).toBe(0);
    await sql.run("UPDATE organizations SET brief_approval = 'staff' WHERE id = ?", [organizationId]);
    const wakes: string[] = [];
    const approved = await runHqTool(
      sql,
      staff,
      {
        tool: "add_work",
        input: { organizationId, kind: "page", outcome: "A landing page", goal: "so buyers can enquire", due: "Friday" },
        idempotencyKey: "work-1",
        approved: true,
      },
      NOW + 1,
      { wake: async (_id, reason) => { wakes.push(reason); } },
    );
    expect(approved).toMatchObject({ ok: true });
    expect(wakes).toEqual(["brief_changed"]);
    const saved = await sql.get<{ body: string }>("SELECT copy_text AS body FROM deliverable_items");
    expect(saved?.body).toContain("page — A landing page");
    const brief = await sql.get<{ status: string }>("SELECT status FROM deliverables WHERE kind = 'brief'");
    expect(brief?.status).toBe("approved");
  });

  it("leaves an addendum for the client to approve when the client owns brief approval", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const wakes: string[] = [];
    const result = await runHqTool(
      sql,
      staff,
      {
        tool: "add_work",
        input: { organizationId, kind: "page", outcome: "A landing page", goal: "so buyers can enquire", due: "Friday" },
        idempotencyKey: "work-2",
        approved: true,
      },
      NOW,
      { wake: async (_id, reason) => { wakes.push(reason); } },
    );
    expect(result).toMatchObject({ ok: true, value: { waitingFor: "client" } });
    expect(wakes).toEqual([]);
    const brief = await sql.get<{ status: string; published_version: number | null }>(
      "SELECT status, published_version FROM deliverables WHERE kind = 'brief'",
    );
    expect(brief).toEqual({ status: "in_review", published_version: 1 });
  });

  it("turns an approved client request into a brief piece and records who decided", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    await sql.run("UPDATE organizations SET brief_approval = 'staff' WHERE id = ?", [organizationId]);
    const requestId = await recordThreadMessage(
      sql,
      {
        organizationId,
        channel: "email",
        threadId: "<m-1>",
        sender: "ada@client.example",
        body: "Please add a pricing page so that buyers can compare, by Friday.",
        state: "proposed",
        goal: "buyers can compare",
        dueText: "Friday",
      },
      NOW,
    );
    const wakes: string[] = [];
    const options = { wake: async (_id: string, reason: string) => { wakes.push(reason); } };
    const unnamed = await runHqTool(
      sql,
      staff,
      { tool: "decide_work_request", input: { id: requestId, decision: "approved" }, idempotencyKey: "d-0", approved: true },
      NOW,
      options,
    );
    expect(unnamed).toEqual({ ok: false, error: "invalid" });
    const approved = await runHqTool(
      sql,
      staff,
      {
        tool: "decide_work_request",
        input: { id: requestId, decision: "approved", kind: "page", outcome: "A pricing page" },
        idempotencyKey: "d-1",
        approved: true,
      },
      NOW + 1,
      options,
    );
    expect(approved).toMatchObject({ ok: true });
    expect(wakes).toEqual(["brief_changed"]);
    const row = await workRequestById(sql, requestId);
    expect(row).toMatchObject({ state: "approved", decided_by: "staff-1", piece_title: "page: A pricing page", brief_version: 1 });
    const saved = await sql.get<{ body: string }>("SELECT copy_text AS body FROM deliverable_items");
    expect(saved?.body).toContain("page — A pricing page");
    const invoice = await sql.get<{ status: string; description: string; total: number }>(
      `SELECT i.status, item.description, i.total_cents AS total
       FROM invoices i JOIN invoice_items item ON item.invoice_id = i.id`,
    );
    expect(invoice).toEqual({ status: "draft", description: "page: A pricing page", total: 0 });
    const logged = await sql.get<{ via: string }>(
      "SELECT json_extract(data_json, '$.via') AS via FROM activities WHERE kind = 'staff.work_request'",
    );
    expect(logged?.via).toBe("hq_chat");
  });

  it("needs a reason to decline and logs a pause as the staff member", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const requestId = await recordThreadMessage(
      sql,
      { organizationId, channel: "slack", threadId: "1.2", sender: "U1", body: "Add a blog.", state: "proposed" },
      NOW,
    );
    const bare = await runHqTool(
      sql,
      staff,
      { tool: "decide_work_request", input: { id: requestId, decision: "declined" }, idempotencyKey: "x-1", approved: true },
      NOW,
    );
    expect(bare).toEqual({ ok: false, error: "invalid" });
    await runHqTool(
      sql,
      staff,
      { tool: "decide_work_request", input: { id: requestId, decision: "declined", body: "Not this quarter." }, idempotencyKey: "x-2", approved: true },
      NOW,
    );
    expect(await workRequestById(sql, requestId)).toMatchObject({ state: "declined", decline_reason: "Not this quarter." });
    await runHqTool(sql, staff, { tool: "pause_client", input: { organizationId }, idempotencyKey: "p-1", approved: true }, NOW + 5);
    const paused = await sql.get<{ actor: string; via: string }>(
      `SELECT actor_id AS actor, json_extract(data_json, '$.via') AS via FROM activities
       WHERE kind = 'staff.agent_paused'`,
    );
    expect(paused).toEqual({ actor: "staff-1", via: "hq_chat" });
  });

  it("links a Slack channel to a client only after approval", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const request = { tool: "link_slack_channel", input: { organizationId, channelId: "C0123ABCD" }, idempotencyKey: "s-1" };
    expect(await runHqTool(sql, staff, request, NOW)).toMatchObject({ needsApproval: true });
    expect(await organizationForSlackChannel(sql, "C0123ABCD")).toBeNull();
    expect(await runHqTool(sql, staff, { ...request, approved: true }, NOW)).toMatchObject({ ok: true });
    expect(await organizationForSlackChannel(sql, "C0123ABCD")).toBe(organizationId);
    const bad = await runHqTool(sql, staff, { ...request, input: { organizationId, channelId: "general" }, idempotencyKey: "s-2", approved: true }, NOW);
    expect(bad).toEqual({ ok: false, error: "invalid" });
  });
});

async function client(sql: Sql): Promise<string> {
  const created = await runHqTool(sql, staff, { tool: "create_client", input: { name: "Northwind" }, idempotencyKey: "org" }, NOW);
  const organizationId = String((valueOf(created) as { id?: string } | undefined)?.id ?? "");
  await sql.run("UPDATE workspaces SET organization_id = ? WHERE id = 'ws-1'", [organizationId]);
  return organizationId;
}

function valueOf(result: HqToolResult): unknown {
  return "ok" in result && result.ok ? result.value : undefined;
}
