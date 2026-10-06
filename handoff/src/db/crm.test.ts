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
  listDeals,
  listOrganizations,
  listTimeline,
  logCall,
  mergeOrganizations,
  moveDealStage,
  normalizeDomain,
  organizationById,
  slugFromName,
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

async function leadDeal(
  sql: Sql,
  name: string,
  source = "readiness_check",
): Promise<{ organizationId: string; dealId: string }> {
  const created = await createOrganization(sql, staff, { name, kind: "lead" }, NOW);
  if (!created.ok) throw new Error(created.error);
  const dealId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
     VALUES (?, ?, ?, 'new', ?, ?, ?)`,
    [dealId, created.value.id, `${name} site`, source, NOW, NOW],
  );
  return { organizationId: created.value.id, dealId };
}

describe("slugFromName", () => {
  it("makes a web address from a company name", () => {
    expect(slugFromName("Harbor & Co.")).toBe("harbor-co");
  });

  it("falls back when the name has no letters", () => {
    expect(slugFromName("!!!")).toBe("client");
  });
});

describe("crm pipeline", () => {
  it("lists deals for staff and hides them from everyone else", async () => {
    const sql = await database();
    const harbor = await leadDeal(sql, "Harbor");
    await sql.run(
      `INSERT INTO assessments (
         id, organization_id, deal_id, domain, answers_json, scores_json, total_score, completed_at, received_at
       ) VALUES ('as-1', ?, ?, 'harbor.example', '{}', '{}', 72, ?, ?)`,
      [harbor.organizationId, harbor.dealId, NOW, NOW],
    );
    const deals = await listDeals(sql, staff);
    expect(deals).toEqual([
      expect.objectContaining({
        id: harbor.dealId,
        organization_id: harbor.organizationId,
        organization_name: "Harbor",
        title: "Harbor site",
        stage: "new",
        source: "readiness_check",
        score: 72,
      }),
    ]);
    expect(await listDeals(sql, outsider)).toEqual([]);
    expect(await listDeals(sql, staff, { stage: "proposal" })).toEqual([]);
    expect((await listDeals(sql, staff, { source: "readiness_check" })).map((row) => row.id)).toEqual([
      harbor.dealId,
    ]);
  });

  it("moves a deal and writes a stage change", async () => {
    const sql = await database();
    const harbor = await leadDeal(sql, "Harbor");
    const moved = await moveDealStage(sql, staff, { dealId: harbor.dealId, stage: "contacted" }, NOW + 5);
    expect(moved.ok).toBe(true);
    const deal = await sql.get<{ stage: string; closed_at: number | null }>(
      "SELECT stage, closed_at FROM deals WHERE id = ?",
      [harbor.dealId],
    );
    expect(deal).toEqual({ stage: "contacted", closed_at: null });
    const activity = await sql.get<{ kind: string; body: string }>(
      "SELECT kind, body FROM activities WHERE deal_id = ? AND kind = 'stage_change'",
      [harbor.dealId],
    );
    expect(activity).toEqual({ kind: "stage_change", body: "Moved from new to contacted." });
    const again = await moveDealStage(sql, staff, { dealId: harbor.dealId, stage: "contacted" }, NOW + 6);
    expect(again.ok).toBe(true);
    const changes = await sql.all("SELECT id FROM activities WHERE kind = 'stage_change'");
    expect(changes).toHaveLength(1);
  });

  it("refuses a bad stage, a missing deal, and a lost deal with no reason", async () => {
    const sql = await database();
    const harbor = await leadDeal(sql, "Harbor");
    expect(await moveDealStage(sql, outsider, { dealId: harbor.dealId, stage: "contacted" }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await moveDealStage(sql, staff, { dealId: "missing", stage: "contacted" }, NOW)).toEqual({
      ok: false,
      error: "missing",
    });
    expect(await moveDealStage(sql, staff, { dealId: harbor.dealId, stage: "nope" as "new" }, NOW)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await moveDealStage(sql, staff, { dealId: harbor.dealId, stage: "lost" }, NOW)).toEqual({
      ok: false,
      error: "invalid",
    });
    const lost = await moveDealStage(
      sql,
      staff,
      { dealId: harbor.dealId, stage: "lost", lostReason: "Not a fit" },
      NOW + 2,
    );
    expect(lost.ok).toBe(true);
    const row = await sql.get<{ stage: string; lost_reason: string; closed_at: number }>(
      "SELECT stage, lost_reason, closed_at FROM deals WHERE id = ?",
      [harbor.dealId],
    );
    expect(row).toEqual({ stage: "lost", lost_reason: "Not a fit", closed_at: NOW + 2 });
  });

  it("winning a lead opens a client, a project, and a space", async () => {
    const sql = await database();
    const harbor = await leadDeal(sql, "Harbor & Co.");
    const won = await moveDealStage(sql, staff, { dealId: harbor.dealId, stage: "won" }, NOW + 3);
    expect(won.ok).toBe(true);
    if (!won.ok) return;
    const org = await organizationById(sql, staff, harbor.organizationId);
    expect(org?.kind).toBe("client");
    const project = await sql.get<{ id: string; name: string; status: string; deal_id: string }>(
      "SELECT id, name, status, deal_id FROM projects WHERE organization_id = ?",
      [harbor.organizationId],
    );
    expect(project).toEqual({
      id: won.value.projectId,
      name: "Harbor & Co. site",
      status: "planned",
      deal_id: harbor.dealId,
    });
    const space = await sql.get<{
      id: string;
      slug: string;
      name: string;
      display_name: string;
      sender_name: string;
      organization_id: string;
      project_id: string;
    }>(
      `SELECT id, slug, name, display_name, sender_name, organization_id, project_id
       FROM workspaces WHERE organization_id = ?`,
      [harbor.organizationId],
    );
    expect(space).toEqual({
      id: won.value.workspaceId,
      slug: "harbor-co",
      name: "Harbor & Co.",
      display_name: "Harbor & Co.",
      sender_name: "Harbor & Co.",
      organization_id: harbor.organizationId,
      project_id: won.value.projectId,
    });
    const request = await sql.get<{ title: string }>("SELECT title FROM requests WHERE workspace_id = ?", [
      space?.id,
    ]);
    expect(request?.title).toBe("Files");
    const operator = await sql.get<{ user_id: string }>(
      "SELECT user_id FROM workspace_operators WHERE workspace_id = ? AND removed_at IS NULL",
      [space?.id],
    );
    expect(operator?.user_id).toBe("staff-1");
    const again = await moveDealStage(sql, staff, { dealId: harbor.dealId, stage: "won" }, NOW + 4);
    expect(again.ok).toBe(true);
    expect(await sql.all("SELECT id FROM projects")).toHaveLength(1);
    expect(await sql.all("SELECT id FROM workspaces WHERE organization_id = ?", [harbor.organizationId])).toHaveLength(
      1,
    );
  });

  it("does not open a second space when the client already has one", async () => {
    const sql = await database();
    const harbor = await leadDeal(sql, "Harbor");
    await linkWorkspace(sql, staff, { organizationId: harbor.organizationId, workspaceId: "ws-1" }, NOW);
    const won = await moveDealStage(sql, staff, { dealId: harbor.dealId, stage: "won" }, NOW + 1);
    expect(won.ok).toBe(true);
    if (!won.ok) return;
    expect(won.value.workspaceId).toBe("ws-1");
    const space = await sql.get<{ project_id: string; organization_id: string }>(
      "SELECT project_id, organization_id FROM workspaces WHERE id = 'ws-1'",
    );
    expect(space).toEqual({ project_id: won.value.projectId, organization_id: harbor.organizationId });
    expect(await sql.all("SELECT id FROM workspaces")).toHaveLength(1);
  });

  it("turns a past client into a client and leaves a partner as a partner", async () => {
    const sql = await database();
    const past = await createOrganization(sql, staff, { name: "Pine", kind: "past_client" }, NOW);
    const partner = await createOrganization(sql, staff, { name: "Oak", kind: "partner" }, NOW);
    if (!past.ok || !partner.ok) throw new Error("setup");
    const pastDeal = crypto.randomUUID();
    const partnerDeal = crypto.randomUUID();
    await sql.run(
      `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
       VALUES (?, ?, 'Pine site', 'proposal', 'manual', ?, ?),
              (?, ?, 'Oak site', 'proposal', 'manual', ?, ?)`,
      [pastDeal, past.value.id, NOW, NOW, partnerDeal, partner.value.id, NOW, NOW],
    );
    expect((await moveDealStage(sql, staff, { dealId: pastDeal, stage: "won" }, NOW + 1)).ok).toBe(true);
    expect((await moveDealStage(sql, staff, { dealId: partnerDeal, stage: "won" }, NOW + 1)).ok).toBe(true);
    expect((await organizationById(sql, staff, past.value.id))?.kind).toBe("client");
    expect((await organizationById(sql, staff, partner.value.id))?.kind).toBe("partner");
  });

  it("picks another web address when the first one is taken", async () => {
    const sql = await database();
    await sql.run("UPDATE workspaces SET slug = 'harbor' WHERE id = 'ws-1'");
    const harbor = await leadDeal(sql, "Harbor");
    const won = await moveDealStage(sql, staff, { dealId: harbor.dealId, stage: "won" }, NOW + 1);
    expect(won.ok).toBe(true);
    if (!won.ok) return;
    const space = await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [
      won.value.workspaceId,
    ]);
    expect(space?.slug).toBe("harbor-2");
  });
});
