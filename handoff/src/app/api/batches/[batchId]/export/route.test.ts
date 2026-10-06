import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { GET as exportBatch } from "./route";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seed(sql: Sql): Promise<void> {
  const createdAt = Date.now() - 60_000;
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
    ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, 'active', ?, NULL, NULL)`,
    [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, createdAt],
  );
  await sql.run(
    "INSERT INTO users (id, email, created_at) VALUES ('user-op', 'operator@example.com', ?)",
    [createdAt],
  );
  const signedAt = Date.now();
  await sql.run(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES ('sess-op', 'user-op', ?, ?, ?, NULL)`,
    [await sha256Hex("operator-token"), signedAt, signedAt + LIMITS.sessionTtlMs],
  );
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('user-op', 'operator@example.com', 0, ?, NULL)`,
    [createdAt],
  );
  await sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
     VALUES ('op-1', ?, 'user-op', 'user-op', ?, NULL)`,
    [WORKSPACE, createdAt],
  );
  await sql.run(
    `INSERT INTO batches (
      id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
    ) VALUES (?, ?, NULL, 'user-op', 'Spring drop', NULL, ?, ?, NULL, NULL)`,
    [BATCH, WORKSPACE, createdAt, createdAt],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, sha256, scan_attempts, created_at
    ) VALUES (?, ?, ?, 'brand/logo.png', 'png', 'image/png', 4, ?, 'brand', 'clean', ?, 0, ?)`,
    [FILE, BATCH, WORKSPACE, `${WORKSPACE}/${BATCH}/${FILE}`, "ab".repeat(32), createdAt],
  );
}

describe("GET batch export", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_SIGNING_SECRET;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  it("returns the export document for an operator", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-export-route-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_SIGNING_SECRET = "test-signing-secret";
    const sql = await openHandoffDb();
    await migrate(sql);
    await seed(sql);
    const response = await exportBatch(
      new Request(`https://handoff.example/api/batches/${BATCH}/export`, {
        headers: { cookie: "handoff_session=operator-token" },
      }),
      { params: Promise.resolve({ batchId: BATCH }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { slug: string; files: { relativePath: string; url?: string }[] };
    expect(body.slug).toBe("northwind");
    expect(body.files[0]?.relativePath).toBe("brand/logo.png");
    expect(body.files[0]?.url).toContain(`/api/files/${FILE}/content`);
  });
});
