import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { recordFeedback } from "@/db/deliverables";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { BULK_AGENT_APPROVED, BULK_NO_SOCIAL, bulkLibraryAction, bulkSummary, type BulkScheduler } from "./library-bulk";
import { syncSocialAccounts } from "./social";
import { agentApprovedItemIds } from "./social-approvals";
import { autoScheduleApproved, saveAutopost } from "./social-autopost";
import type { ObjectStore } from "./store/objects";
import type { ZernioAccount, ZernioClient, ZernioPostInput } from "./zernio";

// Christopher, Oct 24 2026: "Bulk approve schedules the posts." and "Agent deliverables - guard against it."
// Bulk and whole-deliverable approval schedule only the pieces they just approved, and never re-approve, take over or
// schedule a piece an agent approved through POST /api/agent-social/items/<id>/approve (#212).

const NOW = 1_800_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: true }, operatorOf: [], memberships: [] };
const client: Caller = { userId: "c-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_owner" }] };
const PIC = JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]);
const ACCOUNTS: ZernioAccount[] = [{ _id: "ig", platform: "instagram", profileId: "prof-1", username: "acme", displayName: null, isActive: true }];
const store = { read: async (key: string) => new TextEncoder().encode(key) } as unknown as ObjectStore;

function fakeZernio() {
  const posts: ZernioPostInput[] = [];
  const zernio: ZernioClient = {
    findProfile: async () => null,
    createProfile: async (input) => ({ _id: "prof-1", name: input.name, externalId: input.externalId }),
    listAccounts: async () => ACCOUNTS,
    connectUrl: async () => "https://example.com/oauth",
    disconnectAccount: async () => undefined,
    presign: async (filename) => ({ uploadUrl: `https://up/${filename}`, publicUrl: `https://media/${filename}` }),
    upload: async () => undefined,
    createPost: async (input) => {
      posts.push(input);
      return { _id: `zp-${posts.length}`, status: "scheduled" };
    },
    getPost: async () => ({ _id: "zp-1", status: "scheduled", platforms: [] }),
    reschedulePost: async (postId) => ({ _id: postId, status: "scheduled" }),
    deletePost: async () => undefined,
    listWebhooks: async () => [],
    saveWebhook: async (input) => ({ _id: "wh", name: input.name, url: input.url, events: input.events }),
  };
  return { zernio, posts };
}

/**
 * d-1 (published v1): agent-ok (an agent approved it), early (a person approved it earlier, not scheduled),
 * live (approved, already has a scheduled post), pending-a and pending-b (waiting on the client).
 */
async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 1, ?, NULL)", [NOW]);
  await sql.run(`INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'client', ?, ?)`, [NOW, NOW]);
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days,
       request_digest, status, opened_at, organization_id
     ) VALUES ('ws-1', 'acme', 'acme', 'acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-1', 'ws-1', 'c-1', 'client@example.com', 'client_owner', ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at)
     VALUES ('d-1', 'org-1', 'ws-1', 'October social', 'social_pack', 'in_review', 1, 1, 'staff', ?, ?)`,
    [NOW, NOW],
  );
  const item = (id: string, sort: number, status: string) =>
    sql.run(
      `INSERT INTO deliverable_items (id, deliverable_id, version, format, channel, title, copy_text, media_json, status, sort)
       VALUES (?, 'd-1', 1, 'static', 'instagram', ?, 'Approved caption', ?, ?, ?)`,
      [id, id, PIC, status, sort],
    );
  await item("agent-ok", 0, "approved");
  await item("early", 1, "approved");
  await item("live", 2, "approved");
  await item("pending-a", 3, "pending");
  await item("pending-b", 4, "pending");
  await agentApproval(sql, "agent-ok", "social.item.approved", NOW - 1000);
  await sql.run(
    `INSERT INTO deliverable_feedback (id, deliverable_id, item_id, version, author_kind, author_id, decision, body, created_at)
     VALUES ('fb-early', 'd-1', 'early', 1, 'client', 'c-1', 'approve', NULL, ?)`,
    [NOW - 2000],
  );
  await sql.run(
    `INSERT INTO social_posts (id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, status, scheduled_for, created_at, updated_at)
     VALUES ('post-live', 'org-1', 'd-1', 'live', 1, '["ig"]', 'scheduled', 'feed', 'scheduled', ?, ?, ?)`,
    [NOW + 86_400_000 * 3, NOW, NOW],
  );
  return sql;
}

async function agentApproval(sql: Sql, itemId: string, kind: "social.item.approved" | "social.item.unapproved", at: number) {
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, 'org-1', ?, 'agent', 'agent-lead', 'Agent approved', ?, ?)`,
    [crypto.randomUUID(), kind, JSON.stringify({ item_id: itemId, deliverable_id: "d-1", version: 1, status: kind === "social.item.approved" ? "approved" : "pending" }), at],
  );
}

async function cadenceOn(sql: Sql, zernio: ZernioClient) {
  await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
  const saved = await saveAutopost(sql, staff, "org-1", { enabled: true, accountIds: ["ig"], weekdays: [0, 1, 2, 3, 4, 5, 6], times: ["09:00"], timezone: "UTC" }, NOW);
  expect(saved).toEqual({ ok: true });
}

const statusOf = async (sql: Sql, id: string) => (await sql.get<{ status: string }>("SELECT status FROM deliverable_items WHERE id = ?", [id]))?.status;
const postsFor = async (sql: Sql, id: string) => (await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM social_posts WHERE item_id = ?", [id]))?.n ?? 0;
const itemFeedback = async (sql: Sql, id: string) =>
  (await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM deliverable_feedback WHERE item_id = ?", [id]))?.n ?? 0;
const agentActivity = async (sql: Sql) =>
  sql.all<{ id: string; data_json: string }>("SELECT id, data_json FROM activities WHERE kind = 'social.item.approved' ORDER BY created_at");

describe("agentApprovedItemIds", () => {
  it("finds pieces an agent approved and nobody approved since", async () => {
    const sql = await database();
    expect([...(await agentApprovedItemIds(sql, "d-1", 1))]).toEqual(["agent-ok"]);
  });

  it("drops a piece once a person approves that one piece, or the agent un-approves it", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO deliverable_feedback (id, deliverable_id, item_id, version, author_kind, author_id, decision, body, created_at)
       VALUES ('fb-person', 'd-1', 'agent-ok', 1, 'staff', 'staff-1', 'approve', NULL, ?)`,
      [NOW],
    );
    expect((await agentApprovedItemIds(sql, "d-1", 1)).size).toBe(0);

    const other = await database();
    await agentApproval(other, "agent-ok", "social.item.unapproved", NOW);
    expect((await agentApprovedItemIds(other, "d-1", 1)).size).toBe(0);
  });

  it("still counts the piece as agent-approved after a whole-deliverable approval", async () => {
    const sql = await database();
    const all = await recordFeedback(sql, client, { deliverableId: "d-1", itemId: null, version: 1, decision: "approve", body: "" }, NOW);
    expect(all.ok).toBe(true);
    expect([...(await agentApprovedItemIds(sql, "d-1", 1))]).toEqual(["agent-ok"]);
  });
});

describe("whole-deliverable approval guard", () => {
  it("approves only pending pieces and reports only those, leaving agent-approved pieces untouched", async () => {
    const sql = await database();
    const before = await agentActivity(sql);
    const all = await recordFeedback(sql, client, { deliverableId: "d-1", itemId: null, version: 1, decision: "approve", body: "" }, NOW);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.value.approvedItemIds.sort()).toEqual(["pending-a", "pending-b"]);
    expect(await statusOf(sql, "agent-ok")).toBe("approved");
    // No item-level feedback was written for the agent's piece, and its approval activity is unchanged.
    expect(await itemFeedback(sql, "agent-ok")).toBe(0);
    expect(await agentActivity(sql)).toEqual(before);
  });

  it("reports nothing as newly approved when the piece was already approved", async () => {
    const sql = await database();
    const again = await recordFeedback(sql, staff, { deliverableId: "d-1", itemId: "agent-ok", version: 1, decision: "approve", body: "" }, NOW);
    expect(again.ok && again.value.approvedItemIds).toEqual([]);
    const fresh = await recordFeedback(sql, staff, { deliverableId: "d-1", itemId: "pending-a", version: 1, decision: "approve", body: "" }, NOW);
    expect(fresh.ok && fresh.value.approvedItemIds).toEqual(["pending-a"]);
  });

  it("schedules only the newly approved pieces: no agent piece, no earlier piece, no second post for a live one", async () => {
    const sql = await database();
    const { zernio, posts } = fakeZernio();
    await cadenceOn(sql, zernio);
    const all = await recordFeedback(sql, client, { deliverableId: "d-1", itemId: null, version: 1, decision: "approve", body: "" }, NOW);
    if (!all.ok) throw new Error("approve");
    const placed = await autoScheduleApproved(sql, zernio, store, { deliverableId: "d-1", itemIds: all.value.approvedItemIds }, NOW);
    expect(placed).toEqual({ scheduled: 2, failed: [], skipped: [] });
    expect(posts).toHaveLength(2);
    expect(await postsFor(sql, "pending-a")).toBe(1);
    expect(await postsFor(sql, "pending-b")).toBe(1);
    expect(await postsFor(sql, "agent-ok")).toBe(0);
    expect(await postsFor(sql, "early")).toBe(0);
    expect(await postsFor(sql, "live")).toBe(1);
    // The slots skip the one the live post already holds, and each post carries the approved caption.
    expect(posts.every((post) => post.content === "Approved caption")).toBe(true);
  });

  it("never schedules an agent-approved piece, even when asked for every approved piece", async () => {
    const sql = await database();
    const { zernio } = fakeZernio();
    await cadenceOn(sql, zernio);
    const placed = await autoScheduleApproved(sql, zernio, store, { deliverableId: "d-1", itemIds: null }, NOW);
    expect(placed.scheduled).toBe(1);
    expect(await postsFor(sql, "early")).toBe(1);
    expect(await postsFor(sql, "agent-ok")).toBe(0);
    expect(await postsFor(sql, "live")).toBe(1);
    expect(placed.skipped).toEqual([expect.stringContaining("an agent approved it")]);
  });

  it("does nothing for an empty list", async () => {
    const sql = await database();
    const { zernio, posts } = fakeZernio();
    await cadenceOn(sql, zernio);
    expect(await autoScheduleApproved(sql, zernio, store, { deliverableId: "d-1", itemIds: [] }, NOW)).toEqual({ scheduled: 0, failed: [], skipped: [] });
    expect(posts).toHaveLength(0);
  });
});

describe("scheduling skips, without failing the approval", () => {
  it("skips with a reason when Cadence is off (no posting time)", async () => {
    const sql = await database();
    const { zernio, posts } = fakeZernio();
    await sql.run("UPDATE deliverable_items SET status = 'approved' WHERE id = 'pending-a'");
    const placed = await autoScheduleApproved(sql, zernio, store, { deliverableId: "d-1", itemIds: ["pending-a"] }, NOW);
    expect(placed.scheduled).toBe(0);
    expect(placed.failed).toEqual([]);
    expect(placed.skipped).toEqual(['"pending-a": not scheduled. Cadence is off for this client, so it has no posting time.']);
    expect(posts).toHaveLength(0);
  });

  it("skips with a reason when no picked account is still connected", async () => {
    const sql = await database();
    const { zernio, posts } = fakeZernio();
    await cadenceOn(sql, zernio);
    await sql.run("UPDATE social_accounts SET is_active = 0 WHERE id = 'ig'");
    await sql.run("UPDATE deliverable_items SET status = 'approved' WHERE id = 'pending-a'");
    const placed = await autoScheduleApproved(sql, zernio, store, { deliverableId: "d-1", itemIds: ["pending-a"] }, NOW);
    expect(placed).toEqual({ scheduled: 0, failed: [], skipped: ['"pending-a": not scheduled. No connected account is picked for Cadence.'] });
    expect(posts).toHaveLength(0);
  });
});

describe("bulk Library approve with the guard", () => {
  it("skips an agent-approved piece untouched and schedules only what it approved", async () => {
    const sql = await database();
    const before = await agentActivity(sql);
    const schedule = vi.fn<BulkScheduler>(async ({ itemIds }) => ({ scheduled: itemIds.length, failed: [], skipped: [] }));
    const result = await bulkLibraryAction(
      sql,
      staff,
      { workspaceId: "ws-1", action: "approve", pieces: [{ itemId: "agent-ok", version: 1 }, { itemId: "early", version: 1 }, { itemId: "pending-a", version: 1 }] },
      NOW,
      schedule,
    );
    expect(result.ok).toBe(true);
    expect(result.outcomes.find((outcome) => outcome.itemId === "agent-ok")).toMatchObject({ state: "skipped", note: BULK_AGENT_APPROVED });
    expect(result.outcomes.find((outcome) => outcome.itemId === "early")).toMatchObject({ state: "skipped", note: "Already approved." });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith({ deliverableId: "d-1", itemIds: ["pending-a"] });
    expect(result.scheduled).toBe(1);
    expect(await itemFeedback(sql, "agent-ok")).toBe(0);
    expect(await agentActivity(sql)).toEqual(before);
  });

  it("schedules each newly approved piece through Cadence and reports the ones it skipped", async () => {
    const sql = await database();
    const { zernio } = fakeZernio();
    await cadenceOn(sql, zernio);
    await sql.run("UPDATE social_accounts SET is_active = 0 WHERE id = 'ig'");
    const schedule: BulkScheduler = ({ deliverableId, itemIds }) => autoScheduleApproved(sql, zernio, store, { deliverableId, itemIds }, NOW);
    const result = await bulkLibraryAction(
      sql,
      staff,
      { workspaceId: "ws-1", action: "approve", pieces: [{ itemId: "pending-a", version: 1 }, { itemId: "pending-b", version: 1 }] },
      NOW,
      schedule,
    );
    expect(result.applied).toBe(2);
    expect(await statusOf(sql, "pending-a")).toBe("approved");
    expect(result.scheduleNotes).toHaveLength(2);
    expect(result.scheduleNotes[0]).toContain("No connected account");
    expect(bulkSummary(result)).toBe("Approved 2, 2 not scheduled.");

    await sql.run("UPDATE social_accounts SET is_active = 1 WHERE id = 'ig'");
    await sql.run("UPDATE deliverable_items SET status = 'pending' WHERE id IN ('pending-a', 'pending-b')");
    const again = await bulkLibraryAction(
      sql,
      staff,
      { workspaceId: "ws-1", action: "approve", pieces: [{ itemId: "pending-a", version: 1 }, { itemId: "pending-b", version: 1 }] },
      NOW,
      schedule,
    );
    expect(again.scheduled).toBe(2);
    expect(again.scheduleNotes).toEqual([]);
    expect(bulkSummary(again)).toBe("Approved 2, 2 placed on the calendar.");
  });

  it("says so when social posting is not set up", async () => {
    const sql = await database();
    const result = await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "approve", pieces: [{ itemId: "pending-a", version: 1 }] }, NOW, null);
    expect(result.applied).toBe(1);
    expect(result.scheduleNotes).toEqual([BULK_NO_SOCIAL]);
  });
});
