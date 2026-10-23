import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { BULK_LIMIT, bulkLibraryAction, bulkSummary, type BulkScheduler } from "./library-bulk";
import { listLibraryArtifacts } from "./library-queries";

const NOW = 1_800_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: true }, operatorOf: [], memberships: [] };
const client: Caller = { userId: "c-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_owner" }] };

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 1, ?, NULL)", [NOW]);
  await sql.run(`INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'client', ?, ?), ('org-2', 'Other', 'client', ?, ?)`, [NOW, NOW, NOW, NOW]);
  for (const [id, slug, org] of [["ws-1", "acme", "org-1"], ["ws-2", "other", "org-2"]] as const) {
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days,
         request_digest, status, opened_at, organization_id
       ) VALUES (?, ?, ?, ?, 'Studio', 'standard', 1000, 30, 0, 'active', ?, ?)`,
      [id, slug, slug, slug, NOW, org],
    );
  }
  const deliverable = (id: string, workspace: string, org: string, kind: string, version: number, published: number | null) =>
    sql.run(
      `INSERT INTO deliverables (id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'in_review', ?, ?, 'staff', ?, ?)`,
      [id, org, workspace, id, kind, version, published, NOW, NOW],
    );
  await deliverable("d-1", "ws-1", "org-1", "social_pack", 1, 1);
  await deliverable("d-brief", "ws-1", "org-1", "brief", 1, 1);
  await deliverable("d-held", "ws-1", "org-1", "social_pack", 2, 1);
  await deliverable("d-other", "ws-2", "org-2", "social_pack", 1, 1);
  const item = (id: string, deliverableId: string, version: number, status: string) =>
    sql.run(
      `INSERT INTO deliverable_items (id, deliverable_id, version, format, channel, title, copy_text, media_json, status, sort)
       VALUES (?, ?, ?, 'static', 'instagram', ?, 'Caption', '[]', ?, 0)`,
      [id, deliverableId, version, id, status],
    );
  await item("pending-a", "d-1", 1, "pending");
  await item("pending-b", "d-1", 1, "pending");
  await item("done", "d-1", 1, "approved");
  await item("asked", "d-1", 1, "changes_requested");
  await item("live", "d-1", 1, "approved");
  await item("brief-item", "d-brief", 1, "pending");
  await item("draft-v2", "d-held", 2, "pending");
  await item("elsewhere", "d-other", 1, "pending");
  await sql.run(
    `INSERT INTO social_posts (id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, status, created_at, updated_at)
     VALUES ('post-live', 'org-1', 'd-1', 'live', 1, '[]', 'scheduled', 'feed', 'scheduled', ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

const piece = (itemId: string, version = 1) => ({ itemId, version });
const state = (result: Awaited<ReturnType<typeof bulkLibraryAction>>, itemId: string) => result.outcomes.find((outcome) => outcome.itemId === itemId);
const statusOf = async (sql: Sql, id: string) => (await sql.get<{ status: string }>("SELECT status FROM deliverable_items WHERE id = ?", [id]))?.status;

describe("bulk Library approve", () => {
  it("approves what can be approved, skips the rest with a reason, and schedules once per deliverable", async () => {
    const sql = await database();
    const schedule = vi.fn<BulkScheduler>(async () => ({ scheduled: 2, failed: [] }));
    const result = await bulkLibraryAction(
      sql,
      staff,
      { workspaceId: "ws-1", action: "approve", pieces: [piece("pending-a"), piece("pending-b"), piece("done"), piece("asked"), piece("brief-item"), piece("draft-v2", 2), piece("elsewhere"), piece("nope")] },
      NOW,
      schedule,
    );
    expect(result.ok).toBe(true);
    expect([result.applied, result.skipped, result.failed]).toEqual([2, 6, 0]);
    expect(state(result, "pending-a")?.state).toBe("applied");
    expect(state(result, "done")?.note).toBe("Already approved.");
    expect(state(result, "asked")?.note).toContain("Changes were requested");
    expect(state(result, "brief-item")?.note).toContain("not finished work");
    expect(state(result, "draft-v2")?.note).toContain("Not published");
    expect(state(result, "elsewhere")?.note).toBe("That piece is not in this workspace.");
    expect(state(result, "nope")?.state).toBe("skipped");
    expect(await statusOf(sql, "pending-a")).toBe("approved");
    expect(await statusOf(sql, "pending-b")).toBe("approved");
    expect(await statusOf(sql, "asked")).toBe("changes_requested");
    expect(await statusOf(sql, "brief-item")).toBe("pending");
    expect(await statusOf(sql, "draft-v2")).toBe("pending");
    expect(await statusOf(sql, "elsewhere")).toBe("pending");
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith({ deliverableId: "d-1", itemIds: ["pending-a", "pending-b"] });
    expect(result.scheduled).toBe(2);
    expect(bulkSummary(result)).toBe("Approved 2, skipped 6, 2 placed on the calendar.");
    const feedback = await sql.all<{ item_id: string; decision: string; author_kind: string }>("SELECT item_id, decision, author_kind FROM deliverable_feedback ORDER BY item_id");
    expect(feedback).toEqual([
      { item_id: "pending-a", decision: "approve", author_kind: "staff" },
      { item_id: "pending-b", decision: "approve", author_kind: "staff" },
    ]);
  });

  it("does not schedule anything when nothing was approved, and reports pieces Cadence could not place", async () => {
    const sql = await database();
    const schedule = vi.fn<BulkScheduler>(async () => ({ scheduled: 0, failed: ['"pending-a": no open slot in the next 120 days.'] }));
    const none = await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "approve", pieces: [piece("done")] }, NOW, schedule);
    expect(schedule).not.toHaveBeenCalled();
    expect(none.applied).toBe(0);
    const some = await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "approve", pieces: [piece("pending-a")] }, NOW, schedule);
    expect(some.applied).toBe(1);
    expect(some.scheduleNotes).toEqual(['"pending-a": no open slot in the next 120 days.']);
    expect(await statusOf(sql, "pending-a")).toBe("approved");
  });

  it("keeps the approvals when scheduling throws, and carries on past a piece that fails", async () => {
    const sql = await database();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const schedule: BulkScheduler = async () => { throw new Error("zernio down"); };
    const result = await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "approve", pieces: [piece("pending-a"), piece("pending-b")] }, NOW, schedule);
    expect(result.applied).toBe(2);
    expect(result.scheduleNotes[0]).toContain("approved and wait on Social");
    // A piece whose approval write blows up is reported as failed and does not stop the next one.
    await sql.run("UPDATE deliverable_items SET status = 'pending' WHERE id IN ('pending-a', 'pending-b')");
    await sql.exec("CREATE TRIGGER stop_b BEFORE UPDATE ON deliverable_items WHEN NEW.id = 'pending-b' BEGIN SELECT RAISE(ABORT, 'no'); END;");
    const mixed = await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "approve", pieces: [piece("pending-b"), piece("pending-a")] }, NOW + 1, null);
    expect(state(mixed, "pending-b")?.state).toBe("failed");
    expect(state(mixed, "pending-a")?.state).toBe("applied");
    expect([mixed.applied, mixed.failed]).toEqual([1, 1]);
    errors.mockRestore();
  });

  it("refuses non-staff callers, strangers to the workspace, empty picks, and oversized picks", async () => {
    const sql = await database();
    expect((await bulkLibraryAction(sql, client, { workspaceId: "ws-1", action: "approve", pieces: [piece("pending-a")] }, NOW, null)).error).toContain("Only staff");
    expect(await statusOf(sql, "pending-a")).toBe("pending");
    const nobody: Caller = { userId: null, staff: null, operatorOf: [], memberships: [] };
    expect((await bulkLibraryAction(sql, nobody, { workspaceId: "ws-1", action: "remove", pieces: [piece("pending-a")] }, NOW, null)).ok).toBe(false);
    expect((await bulkLibraryAction(sql, staff, { workspaceId: "ws-missing", action: "approve", pieces: [piece("pending-a")] }, NOW, null)).ok).toBe(false);
    expect((await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "approve", pieces: [] }, NOW, null)).error).toBe("Pick at least one piece.");
    const many = Array.from({ length: BULK_LIMIT + 1 }, (_, index) => piece(`p-${index}`));
    expect((await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "approve", pieces: many }, NOW, null)).error).toContain(`${BULK_LIMIT}`);
    expect((await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "bogus" as never, pieces: [piece("pending-a")] }, NOW, null)).ok).toBe(false);
  });

  it("counts a piece once when it is picked twice", async () => {
    const sql = await database();
    const result = await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "approve", pieces: [piece("pending-a"), piece("pending-a")] }, NOW, null);
    expect(result.outcomes).toHaveLength(1);
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_feedback"))?.n).toBe(1);
  });
});

describe("bulk Library remove and put back", () => {
  it("removes pieces, skips the removed and the live-posted, and the Library list follows", async () => {
    const sql = await database();
    const result = await bulkLibraryAction(
      sql,
      staff,
      { workspaceId: "ws-1", action: "remove", pieces: [piece("pending-a"), piece("done"), piece("live"), piece("draft-v2", 2), piece("elsewhere")] },
      NOW,
      null,
    );
    expect(state(result, "pending-a")?.state).toBe("applied");
    expect(state(result, "done")?.state).toBe("applied");
    expect(state(result, "live")?.state).toBe("skipped");
    expect(state(result, "live")?.note).toContain("Cancel the post on Social");
    expect(state(result, "draft-v2")?.state).toBe("failed");
    expect(state(result, "elsewhere")?.state).toBe("skipped");
    expect([result.applied, result.skipped, result.failed]).toEqual([2, 2, 1]);
    expect(bulkSummary(result)).toBe("Removed 2, skipped 2, 1 failed.");
    expect(await sql.get("SELECT 1 FROM deliverable_items WHERE id = 'live' AND removed_at IS NOT NULL")).toBeUndefined();
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM activities WHERE kind = 'library_item_removed'"))?.n).toBe(2);
    expect(await sql.get("SELECT 1 FROM social_posts WHERE id = 'post-live' AND status = 'scheduled'")).toBeDefined();

    const library = await listLibraryArtifacts(sql, staff, { workspaceId: "ws-1", slug: "acme" });
    const ids = library.ok ? library.page.artifacts.map((artifact) => artifact.sourceId) : [];
    expect(ids).not.toContain("pending-a");
    expect(ids).toContain("live");

    const again = await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "remove", pieces: [piece("pending-a")] }, NOW + 1, null);
    expect(state(again, "pending-a")).toMatchObject({ state: "skipped", note: "Already removed." });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM activities WHERE kind = 'library_item_removed'"))?.n).toBe(2);
  });

  it("will not approve a removed piece, and puts pieces back", async () => {
    const sql = await database();
    await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "remove", pieces: [piece("pending-a")] }, NOW, null);
    const approve = await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "approve", pieces: [piece("pending-a")] }, NOW + 1, null);
    expect(state(approve, "pending-a")?.note).toContain("Put it back first");
    expect(await statusOf(sql, "pending-a")).toBe("pending");
    const back = await bulkLibraryAction(sql, staff, { workspaceId: "ws-1", action: "restore", pieces: [piece("pending-a"), piece("pending-b")] }, NOW + 2, null);
    expect(state(back, "pending-a")?.state).toBe("applied");
    expect(state(back, "pending-b")).toMatchObject({ state: "skipped", note: "Already in the Library." });
    expect(bulkSummary(back)).toBe("Put back 1, skipped 1.");
    expect(await sql.get("SELECT 1 FROM deliverable_items WHERE id = 'pending-a' AND removed_at IS NULL")).toBeDefined();
  });
});
