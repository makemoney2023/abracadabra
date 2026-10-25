import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { listSocialReviewPieces } from "./social-review";

const NOW = 1_800_000_000_000;
const client: Caller = { userId: "c-1", staff: null, operatorOf: [], memberships: [] };
const stranger: Caller = { userId: "c-2", staff: null, operatorOf: [], memberships: [] };

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme Studio', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run("UPDATE workspaces SET organization_id = 'org-1' WHERE id = 'ws-1'");
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at)
     VALUES ('m-1', 'ws-1', 'c-1', 'client@example.com', 'client_owner', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, actor_id, created_at, updated_at
     ) VALUES ('d-1', 'org-1', NULL, 'ws-1', 'October social', 'social_pack', 'in_review', 1, 1, 'staff', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, actor_id, created_at, updated_at
     ) VALUES ('d-draft', 'org-1', NULL, 'ws-1', 'Unsent', 'social_pack', 'draft', 1, NULL, 'staff', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  const item = (id: string, deliverable: string, format: string, status: string, channel: string | null) =>
    sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES (?, ?, 1, NULL, ?, ?, ?, 'A caption', ?, NULL, ?, 0)`,
      [id, deliverable, format, channel, id, JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]), status],
    );
  await item("pending", "d-1", "static", "pending", "instagram");
  await item("changes", "d-1", "static", "changes_requested", null);
  await item("ready", "d-1", "video", "approved", "youtube");
  await item("live", "d-1", "static", "approved", "facebook");
  await item("page", "d-1", "page", "pending", null);
  await item("hidden", "d-draft", "static", "pending", "instagram");
  return sql;
}

describe("social review pieces", () => {
  it("lists published social pieces the client can decide, and hides drafts and other formats", async () => {
    const sql = await database();
    const lists = await listSocialReviewPieces(sql, client, { id: "ws-1", slug: "acme", display_name: "Acme Studio" }, new Set(["live"]));
    expect(lists.waiting.map((piece) => piece.id)).toEqual(["pending", "changes"]);
    expect(lists.ready.map((piece) => piece.id)).toEqual(["ready"]);
    expect(lists.waiting[0]).toMatchObject({
      slug: "acme",
      accountName: "Acme Studio",
      deliverableTitle: "October social",
      platforms: ["instagram"],
      media: [{ role: "main", video: false }],
    });
    expect(JSON.stringify(lists).toLowerCase()).not.toContain("zernio");
  });

  it("returns nothing to someone who cannot see the space", async () => {
    const sql = await database();
    const lists = await listSocialReviewPieces(sql, stranger, { id: "ws-1", slug: "acme", display_name: "Acme Studio" }, new Set());
    expect(lists.waiting).toEqual([]);
    expect(lists.ready).toEqual([]);
  });

  it("hides a removed piece from the lists and keeps a held post off Ready", async () => {
    const sql = await database();
    await sql.run("UPDATE deliverable_items SET removed_at = ? WHERE id = 'pending'", [NOW]);
    const lists = await listSocialReviewPieces(
      sql,
      client,
      { id: "ws-1", slug: "acme", display_name: "Acme Studio" },
      new Set(["live"]),
      new Set(["ready"]),
    );
    expect(lists.waiting.map((piece) => piece.id)).toEqual(["changes"]);
    expect(lists.ready).toEqual([]);
    expect(lists.catalog.map((piece) => piece.id)).toContain("pending");
  });

  const space = { id: "ws-1", slug: "acme", display_name: "Acme Studio" };

  async function addDeliverable(sql: Sql, id: string, kind: string, projectId: string | null) {
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
         actor_kind, actor_id, created_at, updated_at
       ) VALUES (?, 'org-1', ?, 'ws-1', ?, ?, 'in_review', 1, 1, 'agent', 'agent-1', ?, ?)`,
      [id, projectId, id, kind, NOW, NOW],
    );
  }

  async function addItem(sql: Sql, id: string, deliverable: string, status: string, channel: string | null) {
    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES (?, ?, 1, NULL, 'static', ?, ?, NULL, '[]', NULL, ?, 0)`,
      [id, deliverable, channel, id, status],
    );
  }

  async function addProject(sql: Sql, id: string, include: 0 | 1) {
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at, include_in_library)
       VALUES (?, 'org-1', ?, 'active', ?, ?, ?)`,
      [id, id, NOW, NOW, include],
    );
  }

  it("leaves out pieces from a project with Add to the Library unticked, and keeps them in the catalog", async () => {
    const sql = await database();
    await addProject(sql, "p-print", 0);
    await addProject(sql, "p-social", 1);
    await addDeliverable(sql, "d-print", "social_pack", "p-print");
    await addDeliverable(sql, "d-social", "social_pack", "p-social");
    await addItem(sql, "print-look", "d-print", "pending", "instagram");
    await addItem(sql, "print-ready", "d-print", "approved", "instagram");
    await addItem(sql, "social-look", "d-social", "pending", "instagram");
    const lists = await listSocialReviewPieces(sql, client, space, new Set(["live"]));
    expect(lists.waiting.map((piece) => piece.id)).toEqual(["pending", "social-look", "changes"]);
    expect(lists.ready.map((piece) => piece.id)).toEqual(["ready"]);
    expect(lists.catalog.map((piece) => piece.id)).toEqual(expect.arrayContaining(["print-look", "print-ready"]));
  });

  it("falls back to the Space's project when a deliverable has none", async () => {
    const sql = await database();
    await addProject(sql, "p-print", 0);
    await sql.run("UPDATE workspaces SET project_id = 'p-print' WHERE id = 'ws-1'");
    const lists = await listSocialReviewPieces(sql, client, space, new Set(["live"]));
    expect(lists.waiting).toEqual([]);
    expect(lists.ready).toEqual([]);
    await sql.run("UPDATE projects SET include_in_library = 1 WHERE id = 'p-print'");
    const back = await listSocialReviewPieces(sql, client, space, new Set(["live"]));
    expect(back.waiting.map((piece) => piece.id)).toEqual(["pending", "changes"]);
  });

  it("counts a piece as social only with a network, a social pack, or a social Library tag", async () => {
    const sql = await database();
    await addDeliverable(sql, "d-site", "document", null);
    await addItem(sql, "screenshot", "d-site", "pending", null);
    await addItem(sql, "linkedin", "d-site", "pending", "linkedin");
    await addItem(sql, "tagged", "d-site", "approved", null);
    await addItem(sql, "pack-image", "d-1", "pending", null);
    const tag = (id: string, item: string, deliverable: string, type: string) =>
      sql.run(
        `INSERT INTO deliverable_artifact_metadata (id, organization_id, workspace_id, deliverable_id, item_id, version, artifact_type, created_at, updated_at)
         VALUES (?, 'org-1', 'ws-1', ?, ?, 1, ?, ?, ?)`,
        [id, deliverable, item, type, NOW, NOW],
      );
    await tag("m-1", "tagged", "d-site", "social");
    await tag("m-2", "pack-image", "d-1", "image");
    const lists = await listSocialReviewPieces(sql, client, space, new Set(["live"]));
    expect(lists.waiting.map((piece) => piece.id)).toEqual(["pending", "linkedin", "changes"]);
    expect(lists.ready.map((piece) => piece.id).sort()).toEqual(["ready", "tagged"]);
  });

  it("checks more pieces than one D1 query can bind", async () => {
    const sql = await database();
    for (let index = 0; index < 120; index += 1) await addItem(sql, `bulk-${index}`, "d-1", "pending", "instagram");
    const lists = await listSocialReviewPieces(sql, client, space, new Set(["live"]));
    expect(lists.waiting).toHaveLength(122);
  });
});
