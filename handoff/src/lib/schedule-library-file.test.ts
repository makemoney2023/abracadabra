import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { scheduleLibraryFile, schedulePlatforms } from "./schedule-library-file";
import type { ObjectStore } from "./store/objects";

const NOW = 1_800_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: ["ws-1"], memberships: [] };
const client: Caller = { userId: "client-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_member" }] };
const PNG = new Uint8Array([137, 80, 78, 71]);

function memoryStore(seed: Record<string, Uint8Array> = {}): ObjectStore & { files: Record<string, Uint8Array> } {
  const files = { ...seed };
  return {
    files,
    stat: async (key) => (files[key] ? { sizeBytes: files[key].byteLength } : null),
    read: async (key) => files[key] ?? null,
    remove: async (key) => {
      delete files[key];
    },
    put: async (key, bytes) => {
      files[key] = bytes;
    },
    beginUpload: async () => "upload",
    readUpload: async () => null,
    writePart: async () => undefined,
    finishUpload: async () => undefined,
  };
}

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at) VALUES ('staff-1', 'staff@example.com', 0, ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run("UPDATE workspaces SET organization_id = 'org-1' WHERE id = 'ws-1'");
  await sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at)
     VALUES ('op-1', 'ws-1', 'staff-1', 'staff-1', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at)
     VALUES ('mem-1', 'ws-1', 'client-1', 'client@example.com', 'client_member', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO batches (id, workspace_id, created_by, created_at, last_activity_at) VALUES ('batch-1', 'ws-1', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO files (
       id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes, object_key, tag, status, scan_attempts, created_at
     ) VALUES ('file-png', 'batch-1', 'ws-1', 'Social/hero.png', 'png', 'image/png', 4, 'ws-1/batch-1/file-png', 'photo', 'clean', 0, ?),
              ('file-pdf', 'batch-1', 'ws-1', 'Social/brief.pdf', 'pdf', 'application/pdf', 4, 'ws-1/batch-1/file-pdf', 'copy', 'clean', 0, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at)
     VALUES ('ig', 'org-1', 'instagram', 'acme', 'Acme', 1, ?)`,
    [NOW],
  );
  return sql;
}

describe("scheduleLibraryFile", () => {
  it("publishes one pending piece with the picture, the network, and the caption", async () => {
    const sql = await database();
    const store = memoryStore({ "ws-1/batch-1/file-png": PNG });
    const saved = await scheduleLibraryFile(
      sql,
      store,
      staff,
      { workspaceId: "ws-1", fileId: "file-png", channel: "instagram", caption: "Morning light" },
      NOW,
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.redirect).toBe(`/clients/org-1?tab=social&piece=${saved.itemId}`);
    const item = await sql.get<{ status: string; channel: string; copy_text: string; media_json: string; source_file_id: string; published_version: number | null }>(
      `SELECT i.status, i.channel, i.copy_text, i.media_json, i.source_file_id, d.published_version
       FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
       WHERE i.id = ?`,
      [saved.itemId],
    );
    expect(item).toMatchObject({ status: "pending", channel: "instagram", copy_text: "Morning light", source_file_id: "file-png", published_version: 1 });
    const media = JSON.parse(item?.media_json ?? "[]") as { role: string; content_type: string; r2_key: string }[];
    expect(media).toEqual([expect.objectContaining({ role: "main", content_type: "image/png" })]);
    const key = media[0]?.r2_key;
    expect(key).toBeTruthy();
    expect(store.files[key ?? ""]).toEqual(PNG);
  });

  it("writes nothing when the caption is empty", async () => {
    const sql = await database();
    const saved = await scheduleLibraryFile(sql, memoryStore(), staff, { workspaceId: "ws-1", fileId: "file-png", channel: "instagram", caption: "  " }, NOW);
    expect(saved).toMatchObject({ ok: false, error: "invalid" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_items"))?.n).toBe(0);
  });

  it("returns the same item while that piece is still pending", async () => {
    const sql = await database();
    const store = memoryStore({ "ws-1/batch-1/file-png": PNG });
    const first = await scheduleLibraryFile(sql, store, staff, { workspaceId: "ws-1", fileId: "file-png", channel: "instagram", caption: "Morning light" }, NOW);
    const second = await scheduleLibraryFile(sql, store, staff, { workspaceId: "ws-1", fileId: "file-png", channel: "instagram", caption: "Another caption" }, NOW + 1);
    expect(first.ok && second.ok && first.itemId === second.itemId).toBe(true);
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_items"))?.n).toBe(1);
  });

  it("refuses a pdf and a client member", async () => {
    const sql = await database();
    const store = memoryStore();
    expect(await scheduleLibraryFile(sql, store, staff, { workspaceId: "ws-1", fileId: "file-pdf", channel: "instagram", caption: "Notes" }, NOW)).toMatchObject({ ok: false });
    expect(await scheduleLibraryFile(sql, store, client, { workspaceId: "ws-1", fileId: "file-png", channel: "instagram", caption: "Morning light" }, NOW)).toMatchObject({ ok: false, error: "forbidden" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_items"))?.n).toBe(0);
  });

  it("creates a new pack when the only social pack is already published", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, actor_id, created_at, updated_at
       ) VALUES ('d-old', 'org-1', 'ws-1', 'October', 'social_pack', 'in_review', 1, 1, 'staff', 'staff-1', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverable_items (id, deliverable_id, version, format, title, copy_text, media_json, status, sort)
       VALUES ('i-old', 'd-old', 1, 'static', 'Old', 'Caption', '[]', 'approved', 0)`,
    );
    const saved = await scheduleLibraryFile(
      sql,
      memoryStore({ "ws-1/batch-1/file-png": PNG }),
      staff,
      { workspaceId: "ws-1", fileId: "file-png", channel: "instagram", caption: "Morning light" },
      NOW,
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const item = await sql.get<{ deliverable_id: string }>("SELECT deliverable_id FROM deliverable_items WHERE id = ?", [saved.itemId]);
    expect(item?.deliverable_id).not.toBe("d-old");
    const old = await sql.get<{ published_version: number; version: number }>("SELECT published_version, version FROM deliverables WHERE id = 'd-old'");
    expect(old).toEqual({ published_version: 1, version: 1 });
    const kept = await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_items WHERE deliverable_id = 'd-old'");
    expect(kept?.n).toBe(1);
  });

  it("refuses a file that is not clean and a staff person who cannot see the space", async () => {
    const sql = await database();
    await sql.run("UPDATE files SET status = 'rejected' WHERE id = 'file-png'");
    const store = memoryStore({ "ws-1/batch-1/file-png": PNG });
    expect(await scheduleLibraryFile(sql, store, staff, { workspaceId: "ws-1", fileId: "file-png", channel: "instagram", caption: "Morning light" }, NOW)).toMatchObject({ ok: false });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_items"))?.n).toBe(0);
    const outsider: Caller = { userId: "staff-2", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
    await sql.run("UPDATE files SET status = 'clean' WHERE id = 'file-png'");
    const hidden = await scheduleLibraryFile(sql, store, outsider, { workspaceId: "ws-1", fileId: "file-png", channel: "instagram", caption: "Morning light" }, NOW);
    expect(hidden).toMatchObject({ ok: false, error: "forbidden" });
    expect(Object.keys(store.files)).toEqual(["ws-1/batch-1/file-png"]);
  });

  it("publishes an existing draft piece instead of adding another", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status, version, actor_kind, actor_id, created_at, updated_at
       ) VALUES ('d-draft', 'org-1', 'ws-1', 'hero.png', 'social_pack', 'draft', 1, 'staff', 'staff-1', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, format, channel, title, copy_text, media_json, status, sort, source_file_id
       ) VALUES ('i-draft', 'd-draft', 1, 'static', 'instagram', 'hero.png', 'Morning light', '[]', 'pending', 0, 'file-png')`,
    );
    const saved = await scheduleLibraryFile(
      sql,
      memoryStore({ "ws-1/batch-1/file-png": PNG }),
      staff,
      { workspaceId: "ws-1", fileId: "file-png", channel: "instagram", caption: "Morning light" },
      NOW,
    );
    expect(saved).toMatchObject({ ok: true, itemId: "i-draft" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_items"))?.n).toBe(1);
    expect((await sql.get<{ published_version: number; status: string }>("SELECT published_version, status FROM deliverables WHERE id = 'd-draft'"))).toEqual({
      published_version: 1,
      status: "in_review",
    });
  });

  it("offers one option per network and skips blogs", () => {
    expect(schedulePlatforms([
      { platform: "instagram", is_active: 1 },
      { platform: "instagram", is_active: 1 },
      { platform: "wordpress", is_active: 1 },
      { platform: "linkedin", is_active: 0 },
    ])).toEqual([{ value: "instagram", label: "Instagram" }]);
  });
});
