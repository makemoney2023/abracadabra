import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { listFolderFiles, retiredFileCount } from "@/lib/downloads";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const BATCH = "22222222-2222-4222-8222-222222222222";
const TOSSED = "44444444-4444-4444-8444-444444444444";
const NOW = 1_700_000_000_000;

const member: Caller = {
  userId: "user-member",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_member" }],
};

const staff: Caller = { userId: "user-staff", staff: { superAdmin: true }, operatorOf: [], memberships: [] };

const outsider: Caller = {
  userId: "user-out",
  staff: null,
  operatorOf: [],
  memberships: [],
};

async function memoryDb(): Promise<Sql> {
  process.env.HANDOFF_SQLITE_PATH = ":memory:";
  const sql = await openHandoffDb();
  await migrate(sql);
  return sql;
}

async function seed(sql: Sql): Promise<void> {
  for (const [id, slug] of [
    [WORKSPACE, "northwind"],
    [OTHER, "other"],
  ] as const) {
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
      ) VALUES (?, ?, 'Name', 'Name', NULL, 'Name', 'standard', 1, 30, 0, 'active', ?, NULL, NULL)`,
      [id, slug, NOW],
    );
  }
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-member', 'member@example.com', ?)", [NOW]);
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-out', 'out@example.com', ?)", [NOW]);
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-1', ?, 'user-member', 'member@example.com', 'client_member', ?, NULL)`,
    [WORKSPACE, NOW],
  );
  for (const [id, discarded] of [
    [BATCH, null],
    [TOSSED, NOW],
  ] as const) {
    await sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, 'user-member', NULL, NULL, ?, ?, ?, NULL)`,
      [id, WORKSPACE, NOW, NOW, discarded],
    );
  }
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at
    ) VALUES ('file-1', ?, ?, 'logo.png', 'png', 2048, 'key-1', 'brand', 'clean', 0, ?)`,
    [BATCH, WORKSPACE, NOW],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at
    ) VALUES ('file-2', ?, ?, 'old.txt', 'txt', 10, 'key-2', 'other', 'clean', 0, ?)`,
    [TOSSED, WORKSPACE, NOW],
  );
}

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
});

describe("folder files", () => {
  it("lists live files for someone in the folder", async () => {
    const sql = await memoryDb();
    await seed(sql);
    const files = await listFolderFiles(sql, member, WORKSPACE);
    expect(files).toEqual([
      {
        id: "file-1",
        batchId: BATCH,
        name: "logo.png",
        sizeBytes: 2048,
        status: "clean",
        createdBy: "user-member",
        createdAt: NOW,
        hold: null,
      },
    ]);
  });

  it("hides files from someone outside the folder", async () => {
    const sql = await memoryDb();
    await seed(sql);
    expect(await listFolderFiles(sql, outsider, WORKSPACE)).toEqual([]);
  });

  it("hides retired files (a superseded or withdrawn filing) by default, and shows them when asked", async () => {
    const sql = await memoryDb();
    await seed(sql);
    await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('user-staff', 'staff@example.com', 1, ?, NULL)", [NOW]);
    await sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at, held_at, hidden_at
      ) VALUES ('batch-retired', ?, NULL, 'agent-1', NULL, NULL, ?, ?, NULL, NULL, ?, ?)`,
      [WORKSPACE, NOW, NOW, NOW, NOW],
    );
    await sql.run(
      `INSERT INTO files (
        id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at
      ) VALUES ('file-retired', 'batch-retired', ?, 'draft-v1.pdf', 'pdf', 10, 'key-3', 'other', 'clean', 0, ?)`,
      [WORKSPACE, NOW],
    );
    const hidden = await listFolderFiles(sql, staff, WORKSPACE);
    expect(hidden.map((file) => file.name)).toEqual(["logo.png"]);
    const all = await listFolderFiles(sql, staff, WORKSPACE, { includeRetired: true });
    expect(all.map((file) => [file.name, file.hold])).toEqual([["draft-v1.pdf", "hidden"], ["logo.png", null]]);
    expect(retiredFileCount(all)).toBe(1);
    expect(retiredFileCount(hidden)).toBe(0);
    expect((await listFolderFiles(sql, member, WORKSPACE, { includeRetired: true })).map((file) => file.name)).toEqual(["logo.png"]);
  });
});
