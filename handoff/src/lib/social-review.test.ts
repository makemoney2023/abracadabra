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
});
