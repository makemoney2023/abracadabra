import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import {
  addNote,
  completeTask,
  createContact,
  createMilestone,
  createOrganization,
  createProject,
  createTask,
  linkWorkspace,
  listContacts,
  listMilestones,
  listOpenTasks,
  listProjects,
  latestAssessment,
  listDeals,
  listOrganizations,
  presentAssessment,
  listStatusUpdates,
  listTimeline,
  listWork,
  logCall,
  mergeOrganizations,
  moveDealStage,
  postStatusUpdate,
  projectById,
  publishStatusUpdate,
  todayFor,
  updateProject,
  updateTask,
  normalizeDomain,
  organizationById,
  slugFromName,
  recordFileUploaded,
  recordRequestDone,
  assignRepoProject,
  cleanRepoName,
  linkRepo,
  listProjectRepos,
  listRepos,
  repoActivitySummary,
  unlinkRepo,
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

  it("stores readiness scores and answers on the client", async () => {
    const sql = await database();
    const harbor = await leadDeal(sql, "Harbor");
    await sql.run(
      `INSERT INTO assessments (
         id, organization_id, deal_id, domain, answers_json, scores_json, total_score,
         report_url, completed_at, received_at
       ) VALUES ('as-1', ?, ?, 'harbor.example', ?, ?, 72, ?, ?, ?)`,
      [
        harbor.organizationId,
        harbor.dealId,
        JSON.stringify({ pressure: ["referrals"], data: "scattered" }),
        JSON.stringify({
          overall: { total: 72, band: "forming" },
          readiness: { total: 40, data: 30, process: 50, people: 20, decision: 60 },
          growth: { total: 55 },
          visibility: { total: 80 },
        }),
        "https://check.example/r/as-1",
        NOW,
        NOW,
      ],
    );
    const stored = await latestAssessment(sql, staff, harbor.organizationId);
    expect(stored).toMatchObject({
      id: "as-1",
      totalScore: 72,
      reportUrl: "https://check.example/r/as-1",
      answers: { pressure: ["referrals"], data: "scattered" },
      scores: { overall: { total: 72, band: "forming" }, readiness: { total: 40 } },
    });
    expect(presentAssessment(stored!)).toEqual({
      total: "Overall forming (72/100).",
      lines: ["Readiness 40.", "Data 30.", "Process 50.", "People 20.", "Decision 60.", "Growth 55.", "Visibility 80."],
      answers: [
        { key: "pressure", value: "referrals" },
        { key: "data", value: "scattered" },
      ],
      reportUrl: "https://check.example/r/as-1",
    });
    expect(await latestAssessment(sql, outsider, harbor.organizationId)).toBeNull();
    expect(await latestAssessment(sql, staff, "missing")).toBeNull();
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

const WEEK = 7 * 24 * 60 * 60 * 1000;

describe("projects and work", () => {
  it("hides projects from people who are not staff", async () => {
    const sql = await database();
    const made = await createOrganization(sql, staff, { name: "Harbor" }, NOW);
    if (!made.ok) throw new Error("setup");
    expect(await listProjects(sql, outsider)).toEqual([]);
    expect(await createProject(sql, outsider, { organizationId: made.value.id, name: "Site" }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await todayFor(sql, outsider, NOW)).toEqual({
      newLeads: [],
      calls: [],
      tasks: [],
      stalledDeals: [],
      waitingSpaces: [],
      invoices: [],
      agentNotes: [],
      workRequests: [],
    });
  });

  it("adds a project, a milestone, and a task on that milestone", async () => {
    const sql = await database();
    const made = await createOrganization(sql, staff, { name: "Harbor" }, NOW);
    if (!made.ok) throw new Error("setup");
    expect(await createProject(sql, staff, { organizationId: made.value.id, name: "  " }, NOW)).toEqual({
      ok: false,
      error: "invalid",
    });
    const project = await createProject(
      sql,
      staff,
      { organizationId: made.value.id, name: "Site", dueAt: NOW + 10 },
      NOW,
    );
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    expect(project.value.status).toBe("planned");
    expect(project.value.organization_id).toBe(made.value.id);
    expect(project.value.owner_user_id).toBe("staff-1");
    expect(await listProjects(sql, staff, made.value.id)).toEqual([project.value]);
    const loaded = await projectById(sql, staff, project.value.id);
    expect(loaded?.name).toBe("Site");
    const moved = await updateProject(sql, staff, { projectId: project.value.id, status: "active" }, NOW + 1);
    expect(moved.ok).toBe(true);
    expect((await projectById(sql, staff, project.value.id))?.status).toBe("active");
    const milestone = await createMilestone(sql, staff, { projectId: project.value.id, name: "Design" }, NOW);
    expect(milestone.ok).toBe(true);
    if (!milestone.ok) return;
    expect(await listMilestones(sql, staff, project.value.id)).toEqual([milestone.value]);
    const task = await createTask(
      sql,
      staff,
      {
        projectId: project.value.id,
        milestoneId: milestone.value.id,
        title: "Sketch the home page",
        assigneeUserId: "staff-1",
      },
      NOW,
    );
    expect(task.ok).toBe(true);
    if (!task.ok) return;
    expect(
      await sql.get(
        "SELECT project_id, milestone_id, assignee_user_id, organization_id FROM tasks WHERE id = ?",
        [task.value.id],
      ),
    ).toEqual({
      project_id: project.value.id,
      milestone_id: milestone.value.id,
      assignee_user_id: "staff-1",
      organization_id: made.value.id,
    });
    expect((await updateTask(sql, staff, { taskId: task.value.id, status: "blocked" }, NOW + 1)).ok).toBe(true);
    expect((await updateTask(sql, staff, { taskId: task.value.id, status: "done" }, NOW + 2)).ok).toBe(true);
    expect(await sql.get("SELECT status, done_at FROM tasks WHERE id = ?", [task.value.id])).toEqual({
      status: "done",
      done_at: NOW + 2,
    });
    expect((await updateTask(sql, staff, { taskId: task.value.id, status: "todo" }, NOW + 3)).ok).toBe(true);
    expect(await sql.get("SELECT status, done_at FROM tasks WHERE id = ?", [task.value.id])).toEqual({
      status: "todo",
      done_at: null,
    });
    expect(await updateTask(sql, outsider, { taskId: task.value.id, status: "done" }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("rejects a milestone that belongs to another project", async () => {
    const sql = await database();
    const made = await createOrganization(sql, staff, { name: "Harbor" }, NOW);
    if (!made.ok) throw new Error("setup");
    const first = await createProject(sql, staff, { organizationId: made.value.id, name: "Site" }, NOW);
    const second = await createProject(sql, staff, { organizationId: made.value.id, name: "Ads" }, NOW);
    if (!first.ok || !second.ok) throw new Error("setup");
    const milestone = await createMilestone(sql, staff, { projectId: first.value.id, name: "Design" }, NOW);
    if (!milestone.ok) throw new Error("setup");
    expect(
      await createTask(
        sql,
        staff,
        { projectId: second.value.id, milestoneId: milestone.value.id, title: "Wrong place" },
        NOW,
      ),
    ).toEqual({ ok: false, error: "invalid" });
    expect(await createMilestone(sql, staff, { projectId: "missing", name: "Design" }, NOW)).toEqual({
      ok: false,
      error: "missing",
    });
  });

  it("lists open work with late, this week, and blocked filters, yours first", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
       VALUES ('staff-2', 'other@example.com', 0, ?, NULL)`,
      [NOW],
    );
    const made = await createOrganization(sql, staff, { name: "Harbor" }, NOW);
    if (!made.ok) throw new Error("setup");
    const project = await createProject(sql, staff, { organizationId: made.value.id, name: "Site" }, NOW);
    if (!project.ok) throw new Error("setup");
    const mine = await createTask(
      sql,
      staff,
      { projectId: project.value.id, title: "Mine late", dueAt: NOW - 1, assigneeUserId: "staff-1" },
      NOW,
    );
    const theirs = await createTask(
      sql,
      staff,
      { projectId: project.value.id, title: "Theirs late", dueAt: NOW - 2, assigneeUserId: "staff-2" },
      NOW,
    );
    const soon = await createTask(
      sql,
      staff,
      { projectId: project.value.id, title: "This week", dueAt: NOW + WEEK - 1, assigneeUserId: "staff-2" },
      NOW,
    );
    const blocked = await createTask(
      sql,
      staff,
      { projectId: project.value.id, title: "Blocked", dueAt: NOW + WEEK * 2 },
      NOW,
    );
    if (!mine.ok || !theirs.ok || !soon.ok || !blocked.ok) throw new Error("setup");
    expect((await updateTask(sql, staff, { taskId: blocked.value.id, status: "blocked" }, NOW)).ok).toBe(true);
    const all = await listWork(sql, staff, {}, NOW);
    expect(all.map((task) => task.title)).toEqual(["Mine late", "Theirs late", "This week", "Blocked"]);
    expect(all[0]?.organization_name).toBe("Harbor");
    expect(all[0]?.assignee_email).toBe("staff@example.com");
    expect((await listWork(sql, staff, { late: true }, NOW)).map((task) => task.title)).toEqual([
      "Mine late",
      "Theirs late",
    ]);
    expect((await listWork(sql, staff, { thisWeek: true }, NOW)).map((task) => task.title)).toEqual(["This week"]);
    expect((await listWork(sql, staff, { blocked: true }, NOW)).map((task) => task.title)).toEqual(["Blocked"]);
    expect(await listWork(sql, outsider, {}, NOW)).toEqual([]);
  });

  it("keeps a client update as a draft until staff publish it", async () => {
    const sql = await database();
    const made = await createOrganization(sql, staff, { name: "Harbor" }, NOW);
    if (!made.ok) throw new Error("setup");
    const project = await createProject(sql, staff, { organizationId: made.value.id, name: "Site" }, NOW);
    if (!project.ok) throw new Error("setup");
    expect(
      await postStatusUpdate(
        sql,
        staff,
        { projectId: project.value.id, body: "  ", health: "on_track", audience: "client" },
        NOW,
      ),
    ).toEqual({ ok: false, error: "invalid" });
    const draft = await postStatusUpdate(
      sql,
      staff,
      { projectId: project.value.id, body: "Home page is in review.", health: "on_track", audience: "client" },
      NOW,
    );
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.value.state).toBe("draft");
    expect(draft.value.published_at).toBeNull();
    const published = await publishStatusUpdate(sql, staff, { id: draft.value.id }, NOW + 1);
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.state).toBe("published");
    expect(published.value.published_at).toBe(NOW + 1);
    expect(await sql.get("SELECT emailed_at FROM status_updates WHERE id = ?", [draft.value.id])).toEqual({
      emailed_at: null,
    });
    const again = await publishStatusUpdate(sql, staff, { id: draft.value.id }, NOW + 5);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.published_at).toBe(NOW + 1);
    const agentId = crypto.randomUUID();
    await sql.run(
      `INSERT INTO status_updates (
         id, project_id, organization_id, health, audience, body, state, emailed_at,
         actor_kind, actor_id, created_at, published_at
       ) VALUES (?, ?, ?, 'on_track', 'client', 'Agent draft.', 'draft', NULL, 'agent', NULL, ?, NULL)`,
      [agentId, project.value.id, made.value.id, NOW],
    );
    expect((await listStatusUpdates(sql, staff, project.value.id)).find((row) => row.id === agentId)?.state).toBe(
      "draft",
    );
    const released = await publishStatusUpdate(sql, staff, { id: agentId }, NOW + 2);
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.value.state).toBe("published");
    expect(released.value.actor_kind).toBe("agent");
    expect(
      await postStatusUpdate(
        sql,
        outsider,
        { projectId: project.value.id, body: "No.", health: "on_track", audience: "internal" },
        NOW,
      ),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(await listStatusUpdates(sql, outsider, project.value.id)).toEqual([]);
  });

  it("fills the today screen from open work", async () => {
    const sql = await database();
    const harbor = await createOrganization(sql, staff, { name: "Harbor" }, NOW);
    const pine = await createOrganization(sql, staff, { name: "Pine" }, NOW);
    if (!harbor.ok || !pine.ok) throw new Error("setup");
    const newDeal = crypto.randomUUID();
    const stalled = crypto.randomUUID();
    const later = crypto.randomUUID();
    const won = crypto.randomUUID();
    await sql.run(
      `INSERT INTO deals (
         id, organization_id, title, stage, source, next_step, next_step_at, created_at, updated_at
       ) VALUES
         (?, ?, 'New site', 'new', 'manual', NULL, NULL, ?, ?),
         (?, ?, 'Stalled site', 'proposal', 'manual', NULL, NULL, ?, ?),
         (?, ?, 'Later site', 'contacted', 'manual', 'Send the deck', ?, ?, ?),
         (?, ?, 'Won site', 'won', 'manual', NULL, NULL, ?, ?)`,
      [
        newDeal,
        harbor.value.id,
        NOW,
        NOW,
        stalled,
        harbor.value.id,
        NOW,
        NOW,
        later,
        pine.value.id,
        NOW + WEEK,
        NOW,
        NOW,
        won,
        pine.value.id,
        NOW,
        NOW,
      ],
    );
    await sql.run(
      `INSERT INTO appointments (id, provider, external_id, organization_id, starts_at, status)
       VALUES (?, 'manual', 'booked-1', ?, ?, 'booked'),
              (?, 'manual', 'old-1', ?, ?, 'cancelled')`,
      [crypto.randomUUID(), harbor.value.id, NOW + 2 * 24 * 60 * 60 * 1000, crypto.randomUUID(), harbor.value.id, NOW + 1000],
    );
    const project = await createProject(sql, staff, { organizationId: harbor.value.id, name: "Site" }, NOW);
    if (!project.ok) throw new Error("setup");
    await createTask(
      sql,
      staff,
      { projectId: project.value.id, title: "Late sketch", dueAt: NOW - 1, assigneeUserId: "staff-1" },
      NOW,
    );
    await linkWorkspace(sql, staff, { organizationId: harbor.value.id, workspaceId: "ws-1" }, NOW);
    await sql.run(
      `INSERT INTO requests (id, workspace_id, position, title, status)
       VALUES ('req-1', 'ws-1', 2, 'Logo', 'open')`,
      [],
    );
    await sql.run(
      `INSERT INTO invoices (
         id, number, organization_id, status, currency, subtotal_cents, tax_rate_bp, tax_cents,
         total_cents, paid_cents, due_at, created_at, updated_at
       ) VALUES (?, 'INV-2026-0001', ?, 'sent', 'usd', 100, 0, 0, 100, 0, ?, ?, ?)`,
      [crypto.randomUUID(), harbor.value.id, NOW - 1, NOW, NOW],
    );
    await sql.run(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, body, created_at)
       VALUES (?, ?, 'note', 'agent', 'Drafted a follow-up.', ?)`,
      [crypto.randomUUID(), harbor.value.id, NOW - 1000],
    );
    await createTask(sql, staff, { organizationId: harbor.value.id, title: "Just filed" }, NOW);
    const today = await todayFor(sql, staff, NOW);
    expect(today.newLeads.map((row) => row.title)).toEqual(["New site"]);
    expect(today.calls).toHaveLength(1);
    expect(today.calls[0]?.organizationName).toBe("Harbor");
    expect(today.tasks.map((task) => task.title)).toEqual(["Late sketch", "Just filed"]);
    expect(today.stalledDeals.map((deal) => deal.title).sort()).toEqual(["New site", "Stalled site"]);
    expect(today.waitingSpaces.map((space) => space.requestTitle)).toContain("Logo");
    expect(today.invoices.map((invoice) => invoice.number)).toEqual(["INV-2026-0001"]);
    expect(today.agentNotes.map((note) => note.body)).toEqual(["Drafted a follow-up."]);
  });
});

describe("cleanRepoName", () => {
  it("keeps an owner and repo name", () => {
    expect(cleanRepoName("  Abracadabra/renew-implants ")).toBe("Abracadabra/renew-implants");
  });

  it("rejects a blank name, a space, or a name that is too long", () => {
    expect(cleanRepoName("")).toBeNull();
    expect(cleanRepoName("renewimplants")).toBeNull();
    expect(cleanRepoName("a/b c")).toBeNull();
    expect(cleanRepoName(`${"a".repeat(100)}/${"b".repeat(100)}`)).toBeNull();
  });
});

describe("crm repos", () => {
  async function twoClients(sql: Sql): Promise<{ left: string; right: string; project: string }> {
    const left = await createOrganization(sql, staff, { name: "Harbor" }, NOW);
    const right = await createOrganization(sql, staff, { name: "Pine" }, NOW);
    if (!left.ok || !right.ok) throw new Error("setup");
    const project = await createProject(sql, staff, { organizationId: left.value.id, name: "Site" }, NOW);
    if (!project.ok) throw new Error("setup");
    await sql.run(
      `INSERT INTO github_installations (id, account_login, account_type, created_at)
       VALUES (7, 'abracadabra', 'Organization', ?)`,
      [NOW],
    );
    return { left: left.value.id, right: right.value.id, project: project.value.id };
  }

  const link = {
    githubRepoId: 42,
    installationId: 7,
    fullName: "abracadabra/renew-implants",
    defaultBranch: "main",
    isPrivate: true,
  };

  it("refuses a person who is not staff", async () => {
    const sql = await database();
    const { left } = await twoClients(sql);
    expect(await listRepos(sql, outsider, left)).toEqual([]);
    expect(await linkRepo(sql, outsider, { ...link, organizationId: left }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("links a repo, lists it, and refuses a bad name", async () => {
    const sql = await database();
    const { left } = await twoClients(sql);
    expect(await linkRepo(sql, staff, { ...link, organizationId: left, fullName: "nope" }, NOW)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await linkRepo(sql, staff, { ...link, organizationId: left, githubRepoId: 0 }, NOW)).toEqual({
      ok: false,
      error: "invalid",
    });
    const linked = await linkRepo(sql, staff, { ...link, organizationId: left }, NOW);
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    const rows = await listRepos(sql, staff, left);
    expect(rows.map((row) => row.full_name)).toEqual(["abracadabra/renew-implants"]);
    expect(rows[0]?.github_repo_id).toBe(42);
    expect(rows[0]?.is_private).toBe(1);
    const again = await linkRepo(
      sql,
      staff,
      { ...link, organizationId: left, fullName: "abracadabra/renew-implants", defaultBranch: "develop" },
      NOW + 1,
    );
    expect(again).toEqual({ ok: true, value: { id: linked.value.id } });
    expect((await listRepos(sql, staff, left))[0]?.default_branch).toBe("develop");
  });

  it("refuses an active repo that already belongs to another client", async () => {
    const sql = await database();
    const { left, right } = await twoClients(sql);
    expect((await linkRepo(sql, staff, { ...link, organizationId: left }, NOW)).ok).toBe(true);
    expect(await linkRepo(sql, staff, { ...link, organizationId: right }, NOW + 1)).toEqual({
      ok: false,
      error: "taken",
    });
  });

  it("moves an archived repo to a new client and clears the old project", async () => {
    const sql = await database();
    const { left, right, project } = await twoClients(sql);
    const linked = await linkRepo(sql, staff, { ...link, organizationId: left }, NOW);
    if (!linked.ok) throw new Error("setup");
    expect(
      (await assignRepoProject(sql, staff, { organizationId: left, repoId: linked.value.id, projectId: project }, NOW)).ok,
    ).toBe(true);
    expect((await unlinkRepo(sql, staff, { organizationId: left, repoId: linked.value.id }, NOW + 1)).ok).toBe(true);
    const moved = await linkRepo(sql, staff, { ...link, organizationId: right }, NOW + 2);
    expect(moved).toEqual({ ok: true, value: { id: linked.value.id } });
    expect(await listRepos(sql, staff, left)).toEqual([]);
    const rows = await listRepos(sql, staff, right);
    expect(rows.map((row) => row.id)).toEqual([linked.value.id]);
    expect(rows[0]?.project_id).toBeNull();
  });

  it("unlinks a missing repo and refuses a project on another client", async () => {
    const sql = await database();
    const { left, right, project } = await twoClients(sql);
    const linked = await linkRepo(sql, staff, { ...link, organizationId: left }, NOW);
    if (!linked.ok) throw new Error("setup");
    expect(await unlinkRepo(sql, staff, { organizationId: left, repoId: "missing" }, NOW)).toEqual({
      ok: false,
      error: "missing",
    });
    expect(
      await assignRepoProject(sql, staff, { organizationId: left, repoId: linked.value.id, projectId: "missing" }, NOW),
    ).toEqual({ ok: false, error: "invalid" });
    const other = await createProject(sql, staff, { organizationId: right, name: "Other" }, NOW);
    if (!other.ok) throw new Error("setup");
    expect(
      await assignRepoProject(
        sql,
        staff,
        { organizationId: left, repoId: linked.value.id, projectId: other.value.id },
        NOW,
      ),
    ).toEqual({ ok: false, error: "invalid" });
    expect(
      (await assignRepoProject(sql, staff, { organizationId: left, repoId: linked.value.id, projectId: project }, NOW)).ok,
    ).toBe(true);
    expect((await listProjectRepos(sql, staff, project)).map((row) => row.id)).toEqual([linked.value.id]);
    expect((await listProjectRepos(sql, outsider, project))).toEqual([]);
    expect(
      (await assignRepoProject(sql, staff, { organizationId: left, repoId: linked.value.id, projectId: null }, NOW)).ok,
    ).toBe(true);
    expect(await listProjectRepos(sql, staff, project)).toEqual([]);
  });

  it("counts open pull requests, the last push, and the latest release", async () => {
    const sql = await database();
    const { left } = await twoClients(sql);
    const linked = await linkRepo(sql, staff, { ...link, organizationId: left }, NOW);
    if (!linked.ok) throw new Error("setup");
    const other = await linkRepo(
      sql,
      staff,
      { ...link, organizationId: left, githubRepoId: 43, fullName: "abracadabra/other" },
      NOW,
    );
    if (!other.ok) throw new Error("setup");
    const rows = [
      ["pr_opened", { number: 4, title: "Home", url: "https://github.com/abracadabra/renew-implants/pull/4", repo: link.fullName }, NOW + 1],
      ["pr_opened", { number: 5, title: "About", url: "https://github.com/abracadabra/renew-implants/pull/5", repo: link.fullName }, NOW + 2],
      ["pr_merged", { number: 4, title: "Home", repo: link.fullName }, NOW + 3],
      ["push", { author: "ada", url: "https://github.com/abracadabra/renew-implants/compare/a", repo: link.fullName }, NOW + 4],
      ["release", { title: "v1", url: "https://github.com/abracadabra/renew-implants/releases/v1", repo: link.fullName }, NOW + 5],
      ["pr_opened", { number: 9, title: "Noise", url: "https://github.com/abracadabra/other/pull/9", repo: "abracadabra/other" }, NOW + 6],
    ] as const;
    for (const [kind, data, at] of rows) {
      await sql.run(
        `INSERT INTO activities (id, organization_id, kind, actor_kind, body, data_json, created_at)
         VALUES (?, ?, ?, 'system', ?, ?, ?)`,
        [crypto.randomUUID(), left, kind, kind, JSON.stringify(data), at],
      );
    }
    expect(await repoActivitySummary(sql, outsider, linked.value.id)).toBeNull();
    expect(await repoActivitySummary(sql, staff, linked.value.id)).toEqual({
      openPullRequests: [
        { number: 5, title: "About", url: "https://github.com/abracadabra/renew-implants/pull/5" },
      ],
      lastPush: { at: NOW + 4, url: "https://github.com/abracadabra/renew-implants/compare/a", author: "ada" },
      latestRelease: { at: NOW + 5, title: "v1", url: "https://github.com/abracadabra/renew-implants/releases/v1" },
    });
    expect((await repoActivitySummary(sql, staff, other.value.id))?.openPullRequests).toEqual([
      { number: 9, title: "Noise", url: "https://github.com/abracadabra/other/pull/9" },
    ]);
  });
});
