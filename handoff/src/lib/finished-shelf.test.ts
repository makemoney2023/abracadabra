import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { listLibraryArtifacts } from "./library-queries";
import { listSocialReviewPieces } from "./social-review";
import { pieceOpenHref, piecesOnShelf, removalLine, setPieceShelf, shelfNote, shelfPostBlock, shelfRemoveBlock } from "./finished-shelf";
import { postOnCalendar } from "@/components/social/social-board";

const NOW = 1_800_000_000_000;
const client: Caller = { userId: "c-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_owner" }] };
const stranger: Caller = { userId: "c-2", staff: null, operatorOf: [], memberships: [] };

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days,
       request_digest, status, opened_at, organization_id
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme Studio', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at)
     VALUES ('m-1', 'ws-1', 'c-1', 'client@example.com', 'client_owner', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, created_at, updated_at
     ) VALUES ('d-1', 'org-1', 'ws-1', 'October social', 'social_pack', 'in_review', 1, 1, 'staff', ?, ?)`,
    [NOW, NOW],
  );
  const item = (id: string, status: string) =>
    sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, format, channel, title, copy_text, media_json, status, sort
       ) VALUES (?, 'd-1', 1, 'static', 'instagram', ?, 'Caption', '[]', ?, 0)`,
      [id, id, status],
    );
  await item("open", "pending");
  await item("live", "approved");
  await item("failed", "approved");
  await sql.run(
    `INSERT INTO social_posts (
       id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, status, created_at, updated_at
     ) VALUES ('post-live', 'org-1', 'd-1', 'live', 1, '[]', 'scheduled', 'feed', 'scheduled', ?, ?),
            ('post-failed', 'org-1', 'd-1', 'failed', 1, '[]', 'now', 'feed', 'failed', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  return sql;
}

describe("finished work shelf", () => {
  it("opens one piece and tells Social to point at the Library", () => {
    expect(pieceOpenHref("acme", "d-1", "open")).toBe("/w/acme/work/d-1?item=open");
    expect(shelfNote("waiting", 0)).toEqual({ text: "Nothing needs a look." });
    expect(shelfNote("waiting", 1)).toEqual({ text: "1 piece needs a look.", status: "needs_review" });
    expect(shelfNote("waiting", 3).text).toBe("3 pieces need a look.");
    expect(shelfNote("ready", 0).text).toBe("Approved work is on the calendar, or not ready yet.");
    expect(shelfNote("ready", 1)).toEqual({ text: "1 approved piece is not on the calendar.", status: "ready" });
    expect(shelfNote("ready", 2).text).toBe("2 approved pieces are not on the calendar.");
    expect(shelfRemoveBlock([{ status: "failed", id: "post-failed" }], "org-1")).toBeNull();
    expect(shelfRemoveBlock([{ status: "scheduled", id: "post-live" }], "org-1")).toBe(
      "Cancel the post on Social before you remove this. Post post-live is on /clients/org-1?tab=social.",
    );
    expect(removalLine({ viewer: "client", actorKind: "agent", actorId: "ada", at: NOW })).toContain("Studio");
    expect(removalLine({ viewer: "client", actorKind: "agent", actorId: "ada", at: NOW })).not.toContain("ada");
    expect(removalLine({ viewer: "staff", actorKind: "agent", actorId: "ada", at: NOW })).toContain("ada");
    expect(shelfPostBlock(null)).toBeNull();
    expect(shelfPostBlock(NOW)).toBe("That piece was removed from the Library.");
    expect(piecesOnShelf([{ id: "a", title: "Kept" }, { id: "b", title: "Gone" }], new Set(["b"]))).toEqual({
      shown: [{ id: "a", title: "Kept" }],
      skipped: ["Gone"],
    });
  });

  it("removes a piece from the Library and from the Social lists, and puts it back", async () => {
    const sql = await database();
    const removed = await setPieceShelf(sql, client, { deliverableId: "d-1", itemId: "open", version: 1, removed: true }, NOW);
    expect(removed).toEqual({ ok: true });
    const again = await setPieceShelf(sql, client, { deliverableId: "d-1", itemId: "open", version: 1, removed: true }, NOW + 1);
    expect(again).toEqual({ ok: true });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM activities WHERE kind = 'library_item_removed'"))?.n).toBe(1);

    const library = await listLibraryArtifacts(sql, client, { workspaceId: "ws-1", slug: "acme" });
    expect(library.ok && library.page.artifacts.some((artifact) => artifact.sourceId === "open")).toBe(false);
    const shelf = await listLibraryArtifacts(sql, client, { workspaceId: "ws-1", slug: "acme", removed: true });
    expect(shelf.ok && shelf.page.artifacts.map((artifact) => artifact.sourceId)).toEqual(["open"]);
    expect(shelf.ok && shelf.page.artifacts[0]?.actions.some((action) => action.href === "/w/acme/work/d-1?item=open")).toBe(true);

    const social = await listSocialReviewPieces(sql, client, { id: "ws-1", slug: "acme", display_name: "Acme Studio" }, new Set());
    expect(social.waiting.map((piece) => piece.id)).not.toContain("open");
    expect(social.catalog.map((piece) => piece.id)).toContain("open");

    const restored = await setPieceShelf(sql, client, { deliverableId: "d-1", itemId: "open", version: 1, removed: false }, NOW + 2);
    expect(restored).toEqual({ ok: true });
    const back = await listLibraryArtifacts(sql, client, { workspaceId: "ws-1", slug: "acme" });
    expect(back.ok && back.page.artifacts.some((artifact) => artifact.sourceId === "open")).toBe(true);
  });

  it("keeps a live post, and hides the piece from someone outside the space", async () => {
    const sql = await database();
    const blocked = await setPieceShelf(sql, client, { deliverableId: "d-1", itemId: "live", version: 1, removed: true }, NOW);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toContain("post-live");
    expect(blocked.error).toContain("/clients/org-1?tab=social");
    expect((await sql.get<{ removed_at: number | null }>("SELECT removed_at FROM deliverable_items WHERE id = 'live'"))?.removed_at).toBeNull();

    const failed = await setPieceShelf(sql, client, { deliverableId: "d-1", itemId: "failed", version: 1, removed: true }, NOW);
    expect(failed).toEqual({ ok: true });
    const failedPost = await sql.get<{ status: string; error: string | null }>("SELECT status, error FROM social_posts WHERE id = 'post-failed'");
    expect(postOnCalendar({ status: failedPost?.status ?? "", error: failedPost?.error ?? null, scheduledFor: 1 })).toBe(false);
    const restored = await setPieceShelf(sql, client, { deliverableId: "d-1", itemId: "failed", version: 1, removed: false }, NOW + 1);
    expect(restored).toEqual({ ok: true });
    const back = await sql.get<{ error: string | null }>("SELECT error FROM social_posts WHERE id = 'post-failed'");
    expect(postOnCalendar({ status: "failed", error: back?.error ?? null, scheduledFor: 1 })).toBe(true);
    const livePost = await sql.get<{ status: string }>("SELECT status FROM social_posts WHERE id = 'post-live'");
    expect(livePost?.status).toBe("scheduled");

    const hidden = await setPieceShelf(sql, stranger, { deliverableId: "d-1", itemId: "open", version: 1, removed: true }, NOW);
    expect(hidden).toEqual({ ok: false, error: "That piece is not here." });
  });

  it("lets a hire take a held, unpublished piece off the shelf", async () => {
    const sql = await database();
    await sql.run(
      "INSERT INTO client_agents (id, label, token_hash, created_by, created_at, updated_at) VALUES ('ada', 'Ada', 'hash-ada', 'test', ?, ?)",
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at
       ) VALUES ('d-held', 'org-1', 'ws-1', 'Held round', 'social_pack', 'draft', 1, NULL, 'agent', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO batches (id, workspace_id, created_by, created_at, last_activity_at, held_at)
       VALUES ('batch-held', 'ws-1', 'agent:ada', ?, ?, ?)`,
      [NOW, NOW, NOW],
    );
    await sql.run(
      `INSERT INTO agent_work_items (
         id, agent_id, external_id, state, kind, title, organization_id, workspace_id, batch_id,
         deliverable_id, deliverable_version, created_at, updated_at
       ) VALUES ('work-held', 'ada', 'held-1', 'filed', 'social', 'Held round', 'org-1', 'ws-1', 'batch-held', 'd-held', 1, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, format, channel, title, copy_text, media_json, status, sort, work_item_id
       ) VALUES ('held', 'd-held', 1, 'static', 'instagram', 'Held piece', 'Caption', '[]', 'pending', 0, 'work-held')`,
    );
    const hire: Caller = { userId: "ada", staff: null, operatorOf: ["ws-1"], memberships: [] };
    const removed = await setPieceShelf(sql, hire, { deliverableId: "d-held", itemId: "held", version: 1, removed: true }, NOW, {
      kind: "agent",
      id: "ada",
      workspaceId: "ws-1",
    });
    expect(removed).toEqual({ ok: true });
    expect((await sql.get<{ removed_at: number | null }>("SELECT removed_at FROM deliverable_items WHERE id = 'held'"))?.removed_at).toBe(NOW);
    const loose = await setPieceShelf(sql, client, { deliverableId: "d-1", itemId: "open", version: 2, removed: true }, NOW);
    expect(loose).toEqual({ ok: false, error: "That choice is not valid." });
  });
});
