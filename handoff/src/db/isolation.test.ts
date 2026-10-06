import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "./migrate";
import {
  batchesFor,
  filesFor,
  healthReport,
  membershipsFor,
  objectWriteAllowed,
  operatorsFor,
  requestsFor,
  signedOutCaller,
  workspaceById,
  workspacesFor,
} from "./records";
import { sqliteSql, type Sql } from "./sql";

const NOW = 1_000_000_000_000;
const HOUR = 60 * 60 * 1000;

function caller(userId: string | null, staff: Caller["staff"] = null): Caller {
  return { userId, staff, operatorOf: ["ws-b"], memberships: [] };
}

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  const sql = sqliteSql(db);
  await migrate(sql);
  return sql;
}

async function seed(sql: Sql) {
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES (?, ?, 1, ?, NULL), (?, ?, 0, ?, NULL)`,
    ["super-1", "super@example.com", NOW, "staff-1", "staff@example.com", NOW],
  );
  for (const slug of ["alpha", "beta"]) {
    const id = slug === "alpha" ? "ws-a" : "ws-b";
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
         quota_bytes, retention_days, request_digest, status, opened_at
       ) VALUES (?, ?, ?, ?, NULL, 'Handoff', 'standard', 100, 90, 0, 'active', ?)`,
      [id, slug, slug, slug, NOW],
    );
  }
  await sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
     VALUES ('op-a', 'ws-a', 'user-op-a', 'super-1', ?, NULL),
            ('op-b', 'ws-b', 'user-op-b', 'super-1', ?, NULL),
            ('op-gone', 'ws-b', 'user-op-a', 'super-1', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-a', 'ws-a', 'user-a', 'a@example.com', 'client_owner', ?, NULL),
            ('mem-b', 'ws-b', 'user-b', 'b@example.com', 'client_owner', ?, NULL),
            ('mem-old', 'ws-b', 'user-a', 'a@example.com', 'client_member', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO requests (
       id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
     ) VALUES ('req-a', 'ws-a', 1, 'Logo', NULL, 'brand', NULL, 'open', NULL, NULL),
              ('req-b', 'ws-b', 1, 'Secret', NULL, 'brand', NULL, 'open', NULL, NULL)`,
  );
  const activeCreated = NOW - HOUR;
  const activeTouch = NOW - 60_000;
  const expiredCreated = NOW - 25 * HOUR;
  const idleTouch = NOW - 6 * HOUR;
  await sql.run(
    `INSERT INTO batches (
       id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at,
       discarded_at, deleted_at
     ) VALUES
       ('batch-a', 'ws-a', 'req-a', 'user-a', 'drop', NULL, ?, ?, NULL, NULL),
       ('batch-b', 'ws-b', 'req-b', 'user-b', 'drop', NULL, ?, ?, NULL, NULL),
       ('batch-old', 'ws-a', NULL, 'user-a', 'old', NULL, ?, ?, NULL, NULL),
       ('batch-idle', 'ws-a', NULL, 'user-a', 'idle', NULL, ?, ?, NULL, NULL)`,
    [
      activeCreated,
      activeTouch,
      activeCreated,
      activeTouch,
      expiredCreated,
      activeTouch,
      activeCreated,
      idleTouch,
    ],
  );
  const files = [
    ["file-a-pending", "batch-a", "ws-a", "logo.svg", "pending", "ws-a/batch-a/file-a-pending"],
    ["file-a-clean", "batch-a", "ws-a", "done.svg", "clean", "ws-a/batch-a/file-a-clean"],
    ["file-b-pending", "batch-b", "ws-b", "secret.svg", "pending", "ws-b/batch-b/file-b-pending"],
    ["file-old", "batch-old", "ws-a", "old.svg", "pending", "ws-a/batch-old/file-old"],
    ["file-idle", "batch-idle", "ws-a", "idle.svg", "pending", "ws-a/batch-idle/file-idle"],
  ] as const;
  for (const [id, batchId, workspaceId, relativePath, status, objectKey] of files) {
    await sql.run(
      `INSERT INTO files (
         id, batch_id, workspace_id, relative_path, extension, declared_content_type,
         size_bytes, object_key, tag, status, sha256, scan_reason, scan_attempts,
         next_scan_at, created_at, uploaded_at, scanned_at, object_deleted_at
       ) VALUES (?, ?, ?, ?, 'svg', 'image/svg+xml', 12, ?, 'brand', ?, NULL, NULL, 0, NULL, ?, NULL, NULL, NULL)`,
      [id, batchId, workspaceId, relativePath, objectKey, status, NOW],
    );
  }
}

describe("handoff D1 isolation", () => {
  it("keeps workspace B out of client A's and operator A's reads", async () => {
    const sql = await database();
    await seed(sql);
    const raw = await sql.all<{ id: string }>("SELECT id FROM workspaces ORDER BY id");
    expect(raw.map((row) => row.id)).toEqual(["ws-a", "ws-b"]);

    const clientA = caller("user-a");
    const operatorA = caller("user-op-a");
    expect((await workspacesFor(sql, clientA)).map((row) => row.slug)).toEqual(["alpha"]);
    expect(await workspaceById(sql, clientA, "ws-b")).toBeUndefined();
    expect(await workspaceById(sql, clientA, "ws-a")).toMatchObject({ slug: "alpha" });
    for (const read of [filesFor, requestsFor, batchesFor, membershipsFor, operatorsFor]) {
      const rows = await read(sql, clientA);
      expect(rows.every((row) => row.workspace_id === "ws-a")).toBe(true);
      expect(rows.some((row) => row.workspace_id === "ws-b")).toBe(false);
    }
    expect((await workspacesFor(sql, operatorA)).map((row) => row.id)).toEqual(["ws-a"]);
    expect(await filesFor(sql, operatorA, "ws-b")).toEqual([]);
    expect(await workspacesFor(sql, signedOutCaller)).toEqual([]);
    expect((await workspacesFor(sql, caller("super-1"))).map((row) => row.id).sort()).toEqual([
      "ws-a",
      "ws-b",
    ]);
    expect(await healthReport(sql, signedOutCaller)).toEqual({
      database: "d1",
      ok: true,
      visible: 0,
    });
  });

  it("allows a client write only on their own active pending object", async () => {
    const sql = await database();
    await seed(sql);
    const clientA = caller("user-a");
    expect(await objectWriteAllowed(sql, clientA, "ws-a/batch-a/file-a-pending", NOW)).toBe(true);
    expect(await objectWriteAllowed(sql, clientA, "ws-b/batch-b/file-b-pending", NOW)).toBe(false);
    expect(await objectWriteAllowed(sql, clientA, "ws-a/batch-a/made-up", NOW)).toBe(false);
    expect(await objectWriteAllowed(sql, clientA, "ws-a/batch-a/file-a-clean", NOW)).toBe(false);
    expect(await objectWriteAllowed(sql, clientA, "ws-a/batch-old/file-old", NOW)).toBe(false);
    expect(await objectWriteAllowed(sql, clientA, "ws-a/batch-idle/file-idle", NOW)).toBe(false);
    expect(await objectWriteAllowed(sql, caller("user-op-a"), "ws-a/batch-a/file-a-pending", NOW)).toBe(
      false,
    );
    expect(
      await objectWriteAllowed(
        sql,
        caller("user-a", { superAdmin: false }),
        "ws-a/batch-a/file-a-pending",
        NOW,
      ),
    ).toBe(false);
    expect(await objectWriteAllowed(sql, caller("super-1"), "ws-a/batch-a/file-a-pending", NOW)).toBe(
      false,
    );
    expect(await objectWriteAllowed(sql, signedOutCaller, "ws-a/batch-a/file-a-pending", NOW)).toBe(
      false,
    );
  });

  it("rejects a second live membership and a bad slug", async () => {
    const sql = await database();
    await seed(sql);
    await expect(
      sql.run(
        `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
         VALUES ('mem-dup', 'ws-a', 'user-a', 'a@example.com', 'client_member', ?, NULL)`,
        [NOW],
      ),
    ).rejects.toThrow();
    await sql.run("UPDATE memberships SET revoked_at = ? WHERE id = 'mem-a'", [NOW]);
    await sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES ('mem-new', 'ws-a', 'user-a', 'a@example.com', 'client_owner', ?, NULL)`,
      [NOW],
    );
    await expect(
      sql.run(
        `INSERT INTO workspaces (
           id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
           quota_bytes, retention_days, request_digest, status, opened_at
         ) VALUES ('ws-bad', 'Bad Slug', 'n', 'n', NULL, 'Handoff', 'standard', 1, 90, 0, 'active', ?)`,
        [NOW],
      ),
    ).rejects.toThrow();
    await expect(
      sql.run(
        `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
         VALUES ('mem-missing', 'missing', 'user-z', 'z@example.com', 'client_member', ?, NULL)`,
        [NOW],
      ),
    ).rejects.toThrow();
  });
});
