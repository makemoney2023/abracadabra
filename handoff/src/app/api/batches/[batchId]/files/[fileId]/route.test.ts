import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { POST as grant } from "./grant/route";
import { POST as complete } from "./complete/route";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seed(sql: Sql, status: string, createdAt: number, activityAt: number): Promise<void> {
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
    ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, 'active', ?, NULL, NULL)`,
    [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, createdAt],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-owner', 'owner@example.com', ?)", [
    createdAt,
  ]);
  const signedAt = Date.now();
  await sql.run(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES ('sess-1', 'user-owner', ?, ?, ?, NULL)`,
    [await sha256Hex("owner-token"), signedAt, signedAt + LIMITS.sessionTtlMs],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
    [WORKSPACE, createdAt],
  );
  await sql.run(
    `INSERT INTO batches (
      id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
    ) VALUES (?, ?, NULL, 'user-owner', NULL, NULL, ?, ?, NULL, NULL)`,
    [BATCH, WORKSPACE, createdAt, activityAt],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, scan_attempts, created_at
    ) VALUES (?, ?, ?, 'brand/logo.png', 'png', 'image/png', 4, ?, 'brand', ?, 0, ?)`,
    [FILE, BATCH, WORKSPACE, `${WORKSPACE}/${BATCH}/${FILE}`, status, createdAt],
  );
}

function call(handler: typeof grant, action: "grant" | "complete"): Promise<Response> {
  return handler(
    new Request(`https://handoff.example/api/batches/${BATCH}/files/${FILE}/${action}`, {
      method: "POST",
      headers: { cookie: "handoff_session=owner-token" },
    }),
    { params: Promise.resolve({ batchId: BATCH, fileId: FILE }) },
  );
}

describe("upload grant and completion", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_OBJECT_PATH;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(path.join(tmpdir(), "handoff-upload-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  it("grants a pending or failed file in an active batch and refreshes activity", async () => {
    const now = Date.now();
    const sql = await db();
    await seed(sql, "pending", now - 60_000, now - 60_000);
    const response = await call(grant, "grant");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { file: { status: string } };
    expect(body.file.status).toBe("uploading");
    const batch = await sql.get<{ last_activity_at: number }>(
      "SELECT last_activity_at FROM batches WHERE id = ?",
      [BATCH],
    );
    expect(batch?.last_activity_at).toBeGreaterThan(now - 60_000);

    await sql.run("UPDATE files SET status = 'failed' WHERE id = ?", [FILE]);
    await sql.run("UPDATE batches SET last_activity_at = ? WHERE id = ?", [now - 30_000, BATCH]);
    const again = await call(grant, "grant");
    expect(again.status).toBe(200);
    const refreshed = await sql.get<{ last_activity_at: number }>(
      "SELECT last_activity_at FROM batches WHERE id = ?",
      [BATCH],
    );
    expect(refreshed?.last_activity_at).toBeGreaterThan(now - 30_000);
  });

  it("lets an admin grant an upload without a membership", async () => {
    const now = Date.now();
    const sql = await db();
    await seed(sql, "pending", now, now);
    await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-admin', 'admin@example.com', ?)", [now]);
    await sql.run(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES ('sess-admin', 'user-admin', ?, ?, ?, NULL)`,
      [await sha256Hex("admin-token"), now, now + LIMITS.sessionTtlMs],
    );
    await sql.run(
      `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
       VALUES ('user-admin', 'admin@example.com', 1, ?, NULL)`,
      [now],
    );
    const response = await grant(
      new Request(`https://handoff.example/api/batches/${BATCH}/files/${FILE}/grant`, {
        method: "POST",
        headers: { cookie: "handoff_session=admin-token" },
      }),
      { params: Promise.resolve({ batchId: BATCH, fileId: FILE }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { file: { status: string } };
    expect(body.file.status).toBe("uploading");
  });

  it("refuses a grant for a clean, held, rejected, or uploaded file", async () => {
    for (const status of ["clean", "held", "rejected", "uploaded"]) {
      const now = Date.now();
      const sql = await db();
      await seed(sql, status, now, now - 1_000);
      const response = await call(grant, "grant");
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ message: "That file can't be uploaded right now." });
      const batch = await sql.get<{ last_activity_at: number }>(
        "SELECT last_activity_at FROM batches WHERE id = ?",
        [BATCH],
      );
      expect(batch?.last_activity_at).toBe(now - 1_000);
    }
  });

  it("refuses a grant on an inactive batch", async () => {
    const now = Date.now();
    const sql = await db();
    await seed(sql, "pending", now - LIMITS.maxBatchLifeMs - 1_000, now);
    const response = await call(grant, "grant");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ message: "That upload is closed." });
  });

  it("marks a matching stored size uploaded and enqueues one scan", async () => {
    const now = Date.now();
    const sql = await db();
    await seed(sql, "uploading", now, now);
    const { openObjectStore } = await import("@/lib/store/objects");
    await openObjectStore().put(`${WORKSPACE}/${BATCH}/${FILE}`, new Uint8Array([1, 2, 3, 4]));
    const response = await call(complete, "complete");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { file: { status: string; id: string } };
    expect(body.file).toMatchObject({ id: FILE, status: "uploaded" });
    const queued = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM audit_events WHERE action = 'file.uploaded' AND subject_id = ?",
      [FILE],
    );
    expect(queued?.n).toBe(1);

    const repeat = await call(complete, "complete");
    expect(repeat.status).toBe(200);
    const again = (await repeat.json()) as { file: { status: string; id: string } };
    expect(again.file).toEqual(body.file);
    const still = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM audit_events WHERE action = 'file.uploaded' AND subject_id = ?",
      [FILE],
    );
    expect(still?.n).toBe(1);
    const timeline = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM activities WHERE kind = 'file_uploaded'",
    );
    expect(timeline?.n).toBe(0);
  });

  it("writes one file event when the space is linked to a client", async () => {
    const now = Date.now();
    const sql = await db();
    await seed(sql, "uploading", now, now);
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at)
       VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
      [now, now],
    );
    await sql.run("UPDATE workspaces SET organization_id = 'org-1' WHERE id = ?", [WORKSPACE]);
    const { openObjectStore } = await import("@/lib/store/objects");
    await openObjectStore().put(`${WORKSPACE}/${BATCH}/${FILE}`, new Uint8Array([1, 2, 3, 4]));
    const response = await call(complete, "complete");
    expect(response.status).toBe(200);
    const rows = await sql.all<{ kind: string; body: string }>(
      "SELECT kind, body FROM activities WHERE kind = 'file_uploaded'",
    );
    expect(rows).toEqual([{ kind: "file_uploaded", body: "brand/logo.png" }]);
    const repeat = await call(complete, "complete");
    expect(repeat.status).toBe(200);
    const again = await sql.get<{ n: number }>("SELECT count(*) AS n FROM activities WHERE kind = 'file_uploaded'");
    expect(again?.n).toBe(1);
  });

  it("marks a size mismatch failed and deletes the object", async () => {
    const now = Date.now();
    const sql = await db();
    await seed(sql, "uploading", now, now);
    const { openObjectStore } = await import("@/lib/store/objects");
    const store = openObjectStore();
    const key = `${WORKSPACE}/${BATCH}/${FILE}`;
    await store.put(key, new Uint8Array([1, 2]));
    const response = await call(complete, "complete");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { file: { status: string; scanReason: string | null } };
    expect(body.file.status).toBe("failed");
    expect(body.file.scanReason).toBe("The saved file size doesn't match the list.");
    expect(await store.stat(key)).toBeNull();
    const queued = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM audit_events WHERE action = 'file.uploaded'",
    );
    expect(queued?.n).toBe(0);
  });
});
