import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { deleteExpiredObjects } from "./delete-rejected";
import { sweepClosedWindows } from "./sweep-windows";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const IDLE_BATCH = "22222222-2222-4222-8222-222222222222";
const LIVE_BATCH = "33333333-3333-4333-8333-333333333333";
const PENDING = "44444444-4444-4444-8444-444444444444";
const UPLOADING = "55555555-5555-4555-8555-555555555555";
const CLEAN = "66666666-6666-4666-8666-666666666666";
const LIVE_PENDING = "77777777-7777-4777-8777-777777777777";
const OLD_REJECTED = "88888888-8888-4888-8888-888888888888";
const OLD_FAILED = "99999999-9999-4999-8999-999999999999";
const YOUNG_REJECTED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("handoff sweeps", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<{ sql: Sql; store: ObjectStore; removed: string[] }> {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(path.join(tmpdir(), "handoff-sweep-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const sql = await openHandoffDb();
    await migrate(sql);
    const inner = localObjectStore(path.join(directory, "objects"));
    const removed: string[] = [];
    const store: ObjectStore = {
      ...inner,
      async remove(key) {
        removed.push(key);
        await inner.remove(key);
      },
    };
    return { sql, store, removed };
  }

  it("fails pending and uploading files when the batch window is closed", async () => {
    const { sql } = await db();
    const now = Date.now();
    const idleAt = now - LIMITS.activityWindowMs;
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purge_after, purged_at
      ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, 'active', ?, NULL, NULL, NULL)`,
      [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, now],
    );
    await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-owner', 'owner@example.com', ?)", [now]);
    await sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, 'user-owner', 'Spring drop', NULL, ?, ?, NULL, NULL)`,
      [IDLE_BATCH, WORKSPACE, idleAt, idleAt],
    );
    await sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, 'user-owner', 'Live drop', NULL, ?, ?, NULL, NULL)`,
      [LIVE_BATCH, WORKSPACE, now, now],
    );
    await insertFile(sql, PENDING, IDLE_BATCH, "notes/a.txt", "pending", idleAt);
    await insertFile(sql, UPLOADING, IDLE_BATCH, "notes/b.txt", "uploading", idleAt);
    await insertFile(sql, CLEAN, IDLE_BATCH, "notes/c.txt", "clean", idleAt);
    await insertFile(sql, LIVE_PENDING, LIVE_BATCH, "notes/d.txt", "pending", now);

    await sweepClosedWindows(sql, now);

    const statuses = await sql.all<{ id: string; status: string }>(
      "SELECT id, status FROM files ORDER BY id",
    );
    expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({
      [PENDING]: "failed",
      [UPLOADING]: "failed",
      [CLEAN]: "clean",
      [LIVE_PENDING]: "pending",
    });
    const mail = await sql.all<{ event: string; recipient_email: string }>(
      "SELECT event, recipient_email FROM notifications",
    );
    expect(mail).toEqual([{ event: "batch.window_failed", recipient_email: "owner@example.com" }]);
  });

  it("deletes rejected and failed objects older than 14 days", async () => {
    const { sql, store, removed } = await db();
    const now = Date.now();
    const old = now - LIMITS.rejectedObjectTtlMs - 1;
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purge_after, purged_at
      ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, 'active', ?, NULL, NULL, NULL)`,
      [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, now],
    );
    await sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, 'user-owner', NULL, NULL, ?, ?, NULL, NULL)`,
      [IDLE_BATCH, WORKSPACE, now, now],
    );
    await insertFile(sql, OLD_REJECTED, IDLE_BATCH, "notes/old-rejected.txt", "rejected", old, "Win.Test.EICAR_HDB-1", old);
    await insertFile(sql, OLD_FAILED, IDLE_BATCH, "notes/old-failed.txt", "failed", old, "Stored size does not match the manifest.");
    await insertFile(sql, YOUNG_REJECTED, IDLE_BATCH, "notes/young.txt", "rejected", now, "Win.Test.EICAR_HDB-1", now);
    await insertFile(sql, CLEAN, IDLE_BATCH, "notes/clean.txt", "clean", old);
    const bytes = new TextEncoder().encode("bytes");
    for (const id of [OLD_REJECTED, OLD_FAILED, YOUNG_REJECTED, CLEAN]) {
      await store.put(`${WORKSPACE}/${IDLE_BATCH}/${id}`, bytes);
    }

    await deleteExpiredObjects(sql, store, now);

    expect(removed.sort()).toEqual(
      [`${WORKSPACE}/${IDLE_BATCH}/${OLD_FAILED}`, `${WORKSPACE}/${IDLE_BATCH}/${OLD_REJECTED}`].sort(),
    );
    expect(await store.read(`${WORKSPACE}/${IDLE_BATCH}/${OLD_REJECTED}`)).toBeNull();
    expect(await store.read(`${WORKSPACE}/${IDLE_BATCH}/${YOUNG_REJECTED}`)).toEqual(bytes);
    const kept = await sql.get<{ status: string; scan_reason: string; object_deleted_at: number }>(
      "SELECT status, scan_reason, object_deleted_at FROM files WHERE id = ?",
      [OLD_REJECTED],
    );
    expect(kept?.status).toBe("rejected");
    expect(kept?.scan_reason).toBe("Win.Test.EICAR_HDB-1");
    expect(kept?.object_deleted_at).toBe(now);
    const young = await sql.get<{ object_deleted_at: number | null }>(
      "SELECT object_deleted_at FROM files WHERE id = ?",
      [YOUNG_REJECTED],
    );
    expect(young?.object_deleted_at).toBeNull();
  });
});

async function insertFile(
  sql: Sql,
  id: string,
  batchId: string,
  relativePath: string,
  status: string,
  createdAt: number,
  scanReason: string | null = null,
  scannedAt: number | null = null,
): Promise<void> {
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, scan_reason, scan_attempts, created_at, uploaded_at, scanned_at
    ) VALUES (?, ?, ?, ?, 'txt', 'text/plain', 4, ?, 'copy', ?, ?, 0, ?, ?, ?)`,
    [
      id,
      batchId,
      WORKSPACE,
      relativePath,
      `${WORKSPACE}/${batchId}/${id}`,
      status,
      scanReason,
      createdAt,
      createdAt,
      scannedAt,
    ],
  );
}
