import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import {
  addNote,
  completeTask,
  createContact,
  createOrganization,
  createTask,
  linkWorkspace,
  listContacts,
  listOpenTasks,
  listOrganizations,
  listTimeline,
  logCall,
  mergeOrganizations,
  normalizeDomain,
  organizationById,
  recordFileUploaded,
  recordRequestDone,
  unlinkedWorkspaces,
} from "./crm";
import { migrate } from "./migrate";
import { sqliteSql, type Sql } from "./sql";

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
  memberships: [{ workspaceId: "ws-1", role: "client_member" }],
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

describe("normalizeDomain", () => {
  it("keeps a bare host and drops www", () => {
    expect(normalizeDomain("https://www.Example.com/path")).toBe("example.com");
    expect(normalizeDomain("  renewimplants.com ")).toBe("renewimplants.com");
  });

  it("rejects a blank or nonsense website", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("not a website")).toBeNull();
  });
});

describe("crm organizations", () => {
  it("refuses a person who is not staff", async () => {
    const sql = await database();
    expect(await listOrganizations(sql, outsider)).toEqual([]);
    const created = await createOrganization(sql, outsider, { name: "Northwind" }, NOW);
    expect(created).toEqual({ ok: false, error: "forbidden" });
  });

  it("creates a client and lists it for staff", async () => {
    const sql = await database();
    const created = await createOrganization(
      sql,
      staff,
      { name: "Renew Implants", website: "https://www.renewimplants.com" },
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.kind).toBe("client");
    expect(created.value.domain).toBe("renewimplants.com");
    const rows = await listOrganizations(sql, staff);
    expect(rows.map((row) => row.name)).toEqual(["Renew Implants"]);
    const again = await organizationById(sql, staff, created.value.id);
    expect(again?.name).toBe("Renew Implants");
    expect(await organizationById(sql, outsider, created.value.id)).toBeUndefined();
    const activity = await sql.get<{ kind: string; actor_id: string }>(
      "SELECT kind, actor_id FROM activities WHERE organization_id = ?",
      [created.value.id],
    );
    expect(activity).toEqual({ kind: "note", actor_id: "staff-1" });
  });

  it("refuses a second client with the same website", async () => {
    const sql = await database();
    const first = await createOrganization(sql, staff, { name: "One", website: "example.com" }, NOW);
    expect(first.ok).toBe(true);
    const second = await createOrganization(sql, staff, { name: "Two", website: "https://example.com" }, NOW);
    expect(second).toEqual({ ok: false, error: "taken" });
  });

  it("refuses a blank name", async () => {
    const sql = await database();
    const created = await createOrganization(sql, staff, { name: "   " }, NOW);
    expect(created).toEqual({ ok: false, error: "invalid" });
  });
});

describe("crm space links", () => {
  it("links a space to one client and leaves it off the free list", async () => {
    const sql = await database();
    const created = await createOrganization(sql, staff, { name: "Strongfoam" }, NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const free = await unlinkedWorkspaces(sql, staff);
    expect(free.map((row) => row.id)).toEqual(["ws-1"]);
    const linked = await linkWorkspace(sql, staff, { organizationId: created.value.id, workspaceId: "ws-1" }, NOW);
    expect(linked).toEqual({ ok: true });
    const row = await sql.get<{ organization_id: string }>(
      "SELECT organization_id FROM workspaces WHERE id = 'ws-1'",
    );
    expect(row?.organization_id).toBe(created.value.id);
    expect(await unlinkedWorkspaces(sql, staff)).toEqual([]);
    const other = await createOrganization(sql, staff, { name: "Other" }, NOW);
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    const stolen = await linkWorkspace(
      sql,
      staff,
      { organizationId: other.value.id, workspaceId: "ws-1" },
      NOW,
    );
    expect(stolen).toEqual({ ok: false, error: "space_taken" });
  });

  it("refuses a link from someone who is not staff", async () => {
    const sql = await database();
    const created = await createOrganization(sql, staff, { name: "Strongfoam" }, NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const linked = await linkWorkspace(
      sql,
      outsider,
      { organizationId: created.value.id, workspaceId: "ws-1" },
      NOW,
    );
    expect(linked).toEqual({ ok: false, error: "forbidden" });
  });
});

async function clientId(sql: Sql, name = "Northwind"): Promise<string> {
  const created = await createOrganization(sql, staff, { name }, NOW);
  if (!created.ok) throw new Error(created.error);
  return created.value.id;
}

describe("crm contacts", () => {
  it("adds a person and keeps one main contact", async () => {
    const sql = await database();
    const id = await clientId(sql);
    const first = await createContact(
      sql,
      staff,
      { organizationId: id, name: "Ada North", email: "Ada@Northwind.example", primary: true },
      NOW,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.email).toBe("ada@northwind.example");
    expect(first.value.is_primary).toBe(1);
    const second = await createContact(
      sql,
      staff,
      { organizationId: id, name: "Bea North", email: "bea@northwind.example", primary: true },
      NOW + 1,
    );
    expect(second.ok).toBe(true);
    const people = await listContacts(sql, staff, id);
    expect(people.map((row) => row.name)).toEqual(["Ada North", "Bea North"]);
    expect(people.find((row) => row.name === "Ada North")?.is_primary).toBe(0);
    expect(people.find((row) => row.name === "Bea North")?.is_primary).toBe(1);
    expect(await listContacts(sql, outsider, id)).toEqual([]);
  });

  it("refuses a blank name, a bad email, and a repeated email", async () => {
    const sql = await database();
    const id = await clientId(sql);
    expect(await createContact(sql, staff, { organizationId: id, name: "  " }, NOW)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(
      await createContact(sql, staff, { organizationId: id, name: "Ada", email: "not-an-email" }, NOW),
    ).toEqual({ ok: false, error: "invalid" });
    const saved = await createContact(sql, staff, { organizationId: id, name: "Ada", email: "ada@example.com" }, NOW);
    expect(saved.ok).toBe(true);
    const again = await createContact(
      sql,
      staff,
      { organizationId: id, name: "Ada Two", email: "ADA@example.com" },
      NOW,
    );
    expect(again).toEqual({ ok: false, error: "email_taken" });
    expect(await createContact(sql, outsider, { organizationId: id, name: "Nope" }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("crm timeline", () => {
  it("stores a note, a call, and a task, newest first", async () => {
    const sql = await database();
    const id = await clientId(sql);
    const note = await addNote(sql, staff, { organizationId: id, body: "  Sent the deck.  " }, NOW + 1);
    expect(note.ok).toBe(true);
    const call = await logCall(sql, staff, { organizationId: id, body: "Talked about the logo." }, NOW + 2);
    expect(call.ok).toBe(true);
    const task = await createTask(sql, staff, { organizationId: id, title: "Send the invoice" }, NOW + 3);
    expect(task.ok).toBe(true);
    if (!task.ok) return;
    const open = await listOpenTasks(sql, staff, id);
    expect(open.map((row) => row.title)).toEqual(["Send the invoice"]);
    const done = await completeTask(sql, staff, { taskId: task.value.id }, NOW + 4);
    expect(done).toEqual({ ok: true });
    expect(await listOpenTasks(sql, staff, id)).toEqual([]);
    const again = await completeTask(sql, staff, { taskId: task.value.id }, NOW + 5);
    expect(again).toEqual({ ok: true });
    const timeline = await listTimeline(sql, staff, id, 20);
    expect(timeline.map((row) => row.kind)).toEqual(["task_done", "task", "call", "note", "note"]);
    expect(timeline[3]?.body).toBe("Sent the deck.");
    expect(await listTimeline(sql, outsider, id, 20)).toEqual([]);
    expect(await addNote(sql, staff, { organizationId: id, body: "   " }, NOW)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await logCall(sql, outsider, { organizationId: id, body: "Hi" }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("writes a file and a finished request only when the space is linked", async () => {
    const sql = await database();
    const id = await clientId(sql);
    await recordFileUploaded(sql, {
      workspaceId: "ws-1",
      fileId: "file-1",
      relativePath: "brand/logo.png",
      actorId: "user-1",
      now: NOW,
    });
    await recordRequestDone(sql, {
      workspaceId: "ws-1",
      requestId: "req-1",
      title: "Logo",
      now: NOW,
    });
    const before = await listTimeline(sql, staff, id, 20);
    expect(before.filter((row) => row.kind === "file_uploaded" || row.kind === "request_done")).toEqual([]);
    const linked = await linkWorkspace(sql, staff, { organizationId: id, workspaceId: "ws-1" }, NOW);
    expect(linked.ok).toBe(true);
    await recordFileUploaded(sql, {
      workspaceId: "ws-1",
      fileId: "file-1",
      relativePath: "brand/logo.png",
      actorId: "user-1",
      now: NOW + 1,
    });
    await recordFileUploaded(sql, {
      workspaceId: "ws-1",
      fileId: "file-1",
      relativePath: "brand/logo.png",
      actorId: "user-1",
      now: NOW + 2,
    });
    await recordRequestDone(sql, {
      workspaceId: "ws-1",
      requestId: "req-1",
      title: "Logo",
      now: NOW + 3,
    });
    await recordRequestDone(sql, {
      workspaceId: "ws-1",
      requestId: "req-1",
      title: "Logo",
      now: NOW + 4,
    });
    const timeline = await listTimeline(sql, staff, id, 20);
    const kinds = timeline.filter((row) => row.kind === "file_uploaded" || row.kind === "request_done");
    expect(kinds.map((row) => row.kind)).toEqual(["request_done", "file_uploaded"]);
    expect(kinds.find((row) => row.kind === "file_uploaded")?.body).toBe("brand/logo.png");
    expect(kinds.find((row) => row.kind === "request_done")?.body).toBe("Logo");
  });

  it("merges one client into another and closes the extra record", async () => {
    const sql = await database();
    const keep = await clientId(sql, "Northwind");
    const drop = await clientId(sql, "Northwind Studio");
    await createContact(sql, staff, { organizationId: drop, name: "Ada", email: "ada@northwind.example" }, NOW);
    await linkWorkspace(sql, staff, { organizationId: drop, workspaceId: "ws-1" }, NOW);
    const merged = await mergeOrganizations(sql, staff, { keepId: keep, dropId: drop }, NOW + 9);
    expect(merged).toEqual({ ok: true });
    expect(await organizationById(sql, staff, drop)).toBeUndefined();
    expect((await listContacts(sql, staff, keep)).map((row) => row.email)).toEqual(["ada@northwind.example"]);
    const space = await sql.get<{ organization_id: string }>(
      "SELECT organization_id FROM workspaces WHERE id = 'ws-1'",
    );
    expect(space?.organization_id).toBe(keep);
    const names = (await listOrganizations(sql, staff)).map((row) => row.name);
    expect(names).toEqual(["Northwind"]);
    expect(await mergeOrganizations(sql, staff, { keepId: keep, dropId: keep }, NOW)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await mergeOrganizations(sql, outsider, { keepId: keep, dropId: drop }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});
