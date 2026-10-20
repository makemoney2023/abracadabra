import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { noteWakeOk } from "@/lib/agent-wake";
import {
  createOrganization,
  createProject,
  createTask,
  markFeedRead,
  organizationInternal,
  recordFeedVisit,
  setOrganizationInternal,
  todayFor,
} from "./crm";
import { migrate, statementsFromMigration } from "./migrate";
import { MIGRATION_SQL } from "./migration-sql";
import { sqliteSql, type Sql } from "./sql";

const NOW = Date.UTC(2026, 9, 20, 21, 0, 0);
const HOUR = 60 * 60 * 1000;

const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
const outsider: Caller = { userId: "client-1", staff: null, operatorOf: [], memberships: [] };

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
  return sql;
}

async function org(sql: Sql, name: string, website?: string, parentOrganizationId?: string): Promise<string> {
  const made = await createOrganization(sql, staff, { name, website, kind: "client", parentOrganizationId }, NOW - 30 * 24 * HOUR);
  if (!made.ok) throw new Error(made.error);
  return made.value.id;
}

async function activity(
  sql: Sql,
  organizationId: string,
  kind: string,
  createdAt: number,
  extra: { body?: string; data?: unknown; actorKind?: string; projectId?: string } = {},
): Promise<void> {
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, kind, actor_kind, body, data_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      organizationId,
      extra.projectId ?? null,
      kind,
      extra.actorKind ?? "system",
      extra.body ?? null,
      extra.data === undefined ? null : JSON.stringify(extra.data),
      createdAt,
    ],
  );
}

describe("migration 0030", () => {
  it("ships the worker copy equal to the file on disk", () => {
    const disk = readFileSync(path.join(process.cwd(), "migrations", "0030_today_feed.sql"), "utf8");
    expect(MIGRATION_SQL["0030_today_feed.sql"]).toBe(disk);
  });

  it("backfills is_internal for test, internal and vendor names only", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = sqliteSql(db);
    await migrate(sql);
    // Rebuild the pre-0030 shape: drop the column, insert production-like names, then rerun the backfill.
    await sql.run("UPDATE organizations SET is_internal = 0");
    const names: [string, string | null][] = [
      ["Renew Implants", "renewimplants.ca"],
      ["MuAPI Support", "muapi.ai"],
      ["Cursor Team", "mail.cursor.com"],
      ["E2E Test (delete me)", "example-test.abra-ca-dabra.app"],
      ["E2E Test 2 (delete me)", "e2e2.example-test.abra-ca-dabra.app"],
      ["TEST E2E (a) low schema - DO NOT CONTACT", "info.cern.ch"],
      ["TEST E2E (b) high schema - DO NOT CONTACT", "schema.org"],
      ["TEST E2E (c) scan fail - DO NOT CONTACT", "no-such-host-e2e.abra-ca-dabra.app"],
      ["TEST E2E (b2) high schema - DO NOT CONTACT", "allrecipes.com"],
      ["TEST E2E (b3) high schema - DO NOT CONTACT", "imdb.com"],
      ["TEST E2E PiRX - internal, do not send", "pirx.ca"],
      ["Abracadabra internal test", null],
      ["HQ pipeline test (Abracadabra internal test)", null],
      ["Strong Foam Insulation Inc.", "strongfoam.com"],
      ["LioCorr Holdings Inc.", "liocorr.com"],
      ["Milr-Corr Construction", "milrcorr.com"],
      ["Square Assembly Inc.", "squareassembly.com"],
      ["Everleigh Homes Inc.", "everleighhomes.com"],
    ];
    for (const [name, domain] of names) {
      await sql.run(
        `INSERT INTO organizations (id, name, domain, kind, is_internal, created_at, updated_at) VALUES (?, ?, ?, 'lead', 0, ?, ?)`,
        [crypto.randomUUID(), name, domain, NOW, NOW],
      );
    }
    const update = statementsFromMigration(MIGRATION_SQL["0030_today_feed.sql"]!).find((statement) => statement.startsWith("UPDATE"));
    await sql.run(update!);
    const flagged = await sql.all<{ name: string }>("SELECT name FROM organizations WHERE is_internal = 1 ORDER BY name");
    expect(flagged.map((row) => row.name)).toEqual([
      "Abracadabra internal test",
      "Cursor Team",
      "E2E Test (delete me)",
      "E2E Test 2 (delete me)",
      "HQ pipeline test (Abracadabra internal test)",
      "MuAPI Support",
      "TEST E2E (a) low schema - DO NOT CONTACT",
      "TEST E2E (b) high schema - DO NOT CONTACT",
      "TEST E2E (b2) high schema - DO NOT CONTACT",
      "TEST E2E (b3) high schema - DO NOT CONTACT",
      "TEST E2E (c) scan fail - DO NOT CONTACT",
      "TEST E2E PiRX - internal, do not send",
    ]);
  });
});

describe("todayFor feed data", () => {
  it("leaves archived and internal clients out of every list", async () => {
    const sql = await database();
    const real = await org(sql, "Harbor");
    const test = await org(sql, "TEST E2E (a) low schema - DO NOT CONTACT");
    const gone = await org(sql, "Old Client");
    await sql.run("UPDATE organizations SET archived_at = ? WHERE id = ?", [NOW, gone]);
    expect(await organizationInternal(sql, staff, test)).toBe(true);
    for (const id of [real, test, gone]) {
      await activity(sql, id, "schema.scan", NOW - HOUR, { data: { scanId: id, status: "complete" } });
      await activity(sql, id, "agent.wake_failed", NOW - HOUR, { body: "Wake returned 500." });
      await sql.run(
        `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
         VALUES (?, ?, 'Site', 'new', 'manual', ?, ?)`,
        [crypto.randomUUID(), id, NOW - HOUR, NOW - HOUR],
      );
    }
    const today = await todayFor(sql, staff, NOW);
    expect(new Set(today.events.map((event) => event.organizationName))).toEqual(new Set(["Harbor"]));
    expect(today.wakeAlerts.map((alert) => alert.organizationName)).toEqual(["Harbor"]);
    expect(today.newLeads.map((lead) => [lead.organizationName, lead.createdAt])).toEqual([["Harbor", NOW - HOUR]]);
    expect(today.pipeline.find((row) => row.stage === "new")?.count).toBe(1);
    expect(today.clients.map((client) => client.name)).toEqual(["Harbor"]);
  });

  it("drops vendor mailers from leads and the pipeline", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO organizations (id, name, domain, kind, is_internal, created_at, updated_at)
       VALUES ('vendor', 'Some Newsletter', 'news.vendor.io', 'lead', 0, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
       VALUES ('d-v', 'vendor', 'Some Newsletter from email', 'new', 'email', ?, ?)`,
      [NOW, NOW],
    );
    const today = await todayFor(sql, staff, NOW);
    expect(today.newLeads).toEqual([]);
    expect(today.pipeline.every((row) => row.count === 0)).toBe(true);
  });

  it("names the task on board moves and lists cards waiting on Client Services", async () => {
    const sql = await database();
    const harbor = await org(sql, "Harbor");
    const project = await createProject(sql, staff, { organizationId: harbor, name: "Site" }, NOW);
    if (!project.ok) throw new Error("setup");
    const task = await createTask(sql, staff, { projectId: project.value.id, title: "Quote export" }, NOW - 6 * HOUR);
    if (!task.ok) throw new Error("setup");
    await sql.run("UPDATE tasks SET review_requested_at = ? WHERE id = ?", [NOW - 5 * HOUR, task.value.id]);
    await activity(sql, harbor, "agent.task_stage", NOW - 5 * HOUR, {
      actorKind: "agent",
      body: "Moved to Waiting on Client Services.",
      data: { taskId: task.value.id, column: "review" },
    });
    await activity(sql, harbor, "client_agent.board", NOW - 5 * HOUR, {
      actorKind: "agent",
      body: "Bot: ready",
      data: { task_id: task.value.id, action: "review" },
    });
    await activity(sql, harbor, "note", NOW - HOUR, { actorKind: "staff", body: "Bad json row" });
    await sql.run("UPDATE activities SET data_json = 'not json' WHERE body = 'Bad json row'");
    const today = await todayFor(sql, staff, NOW);
    const moves = today.events.filter((event) => event.kind === "agent.task_stage" || event.kind === "client_agent.board");
    expect(moves.map((event) => event.taskTitle)).toEqual(["Quote export", "Quote export"]);
    expect(today.events.find((event) => event.body === "Bad json row")?.data).toEqual({});
    expect(today.reviewWaiting).toEqual([
      expect.objectContaining({ taskId: task.value.id, title: "Quote export", since: NOW - 5 * HOUR, projectId: project.value.id }),
    ]);
  });

  it("clears a wake alert once a wake succeeds after the last failure", async () => {
    const sql = await database();
    const harbor = await org(sql, "Harbor");
    await activity(sql, harbor, "agent.wake_failed", NOW - 3 * HOUR, { body: "Network connection lost." });
    await activity(sql, harbor, "agent.wake_failed", NOW - 2 * HOUR, { body: "Wake returned 500." });
    let today = await todayFor(sql, staff, NOW);
    expect(today.wakeAlerts).toEqual([
      expect.objectContaining({ organizationName: "Harbor", failures: 2, lastAt: NOW - 2 * HOUR, lastError: "Wake returned 500." }),
    ]);
    await noteWakeOk(sql, harbor, NOW - HOUR);
    today = await todayFor(sql, staff, NOW);
    expect(today.wakeAlerts).toEqual([]);
    await activity(sql, harbor, "agent.wake_failed", NOW - 30 * 60 * 1000, { body: "Wake returned 502." });
    today = await todayFor(sql, staff, NOW);
    expect(today.wakeAlerts).toEqual([expect.objectContaining({ failures: 1, lastError: "Wake returned 502." })]);
  });

  it("only shows overdue file requests, not the standing Files request", async () => {
    const sql = await database();
    const harbor = await org(sql, "Harbor");
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
         quota_bytes, retention_days, request_digest, status, opened_at, organization_id
       ) VALUES ('ws-h', 'harbor', 'Harbor', 'Harbor', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?, ?)`,
      [NOW, harbor],
    );
    await sql.run(
      `INSERT INTO requests (id, workspace_id, position, title, status, due_on) VALUES
         ('r1', 'ws-h', 1, 'Files', 'open', NULL),
         ('r2', 'ws-h', 2, 'Logo', 'open', ?),
         ('r3', 'ws-h', 3, 'Photos', 'open', ?)`,
      [NOW - HOUR, NOW + 24 * HOUR],
    );
    const today = await todayFor(sql, staff, NOW);
    expect(today.waitingSpaces.map((row) => row.requestTitle)).toEqual(["Logo"]);
  });
});

describe("internal toggle", () => {
  it("lets staff flip it and logs a note; outsiders cannot", async () => {
    const sql = await database();
    const harbor = await org(sql, "Harbor");
    expect(await setOrganizationInternal(sql, outsider, { organizationId: harbor, internal: true }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await setOrganizationInternal(sql, staff, { organizationId: "nope", internal: true }, NOW)).toEqual({
      ok: false,
      error: "missing",
    });
    expect(await setOrganizationInternal(sql, staff, { organizationId: harbor, internal: true }, NOW)).toEqual({
      ok: true,
      value: { internal: true },
    });
    expect(await organizationInternal(sql, staff, harbor)).toBe(true);
    const note = await sql.get<{ body: string }>("SELECT body FROM activities WHERE organization_id = ? AND body LIKE 'Marked%'", [harbor]);
    expect(note?.body).toBe("Marked internal, test, or vendor. Hidden from Today.");
    expect((await todayFor(sql, staff, NOW)).clients).toEqual([]);
  });
});

describe("feed visits", () => {
  it("starts new at the previous visit and keeps it steady inside one visit", async () => {
    const sql = await database();
    expect(await recordFeedVisit(sql, staff, NOW)).toBeNull();
    // Ten minutes later is the same visit: still nothing marked new.
    expect(await recordFeedVisit(sql, staff, NOW + 10 * 60 * 1000)).toBeNull();
    // Two hours later is a new visit: new since the last load.
    expect(await recordFeedVisit(sql, staff, NOW + 2 * HOUR)).toBe(NOW + 10 * 60 * 1000);
    expect(await recordFeedVisit(sql, staff, NOW + 2 * HOUR + 60_000)).toBe(NOW + 10 * 60 * 1000);
    await markFeedRead(sql, staff, NOW + 3 * HOUR);
    expect(await recordFeedVisit(sql, staff, NOW + 3 * HOUR + 60_000)).toBe(NOW + 3 * HOUR);
    expect(await recordFeedVisit(sql, outsider, NOW)).toBeNull();
  });
});
