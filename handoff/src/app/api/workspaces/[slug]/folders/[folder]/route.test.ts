import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { DELETE } from "./route";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const PHOTO = "33333333-3333-4333-8333-333333333333";
const NOTE = "44444444-4444-4444-8444-444444444444";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("delete uploaded folder", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_OBJECT_PATH;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-folder-delete-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
    const sql = await openHandoffDb();
    await migrate(sql);
    const now = Date.now();
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
      ) VALUES (?, 'strongfoam', 'Strongfoam', 'Strongfoam', NULL, 'Abracadabra', 'standard', ?, ?, 0, 'active', ?, NULL, NULL)`,
      [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, now],
    );
    await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-owner', 'owner@example.com', ?)", [now]);
    await sql.run(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES ('sess-owner', 'user-owner', ?, ?, ?, NULL)`,
      [await sha256Hex("owner-token"), now, now + LIMITS.sessionTtlMs],
    );
    await sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
      [WORKSPACE, now],
    );
    await sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, 'user-owner', NULL, NULL, ?, ?, NULL, NULL)`,
      [BATCH, WORKSPACE, now, now],
    );
    for (const [id, relative] of [
      [PHOTO, "photos/a.txt"],
      [NOTE, "notes.txt"],
    ] as const) {
      await sql.run(
        `INSERT INTO files (
          id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at
        ) VALUES (?, ?, ?, ?, 'txt', 4, ?, 'other', 'uploaded', 0, ?)`,
        [id, BATCH, WORKSPACE, relative, `${WORKSPACE}/${BATCH}/${id}`, now],
      );
    }
    return sql;
  }

  function call(folder: string): Promise<Response> {
    return DELETE(
      new Request(`https://handoff.example/api/workspaces/strongfoam/folders/${folder}`, {
        method: "DELETE",
        headers: { cookie: "handoff_session=owner-token" },
      }),
      { params: Promise.resolve({ slug: "strongfoam", folder }) },
    );
  }

  it("removes the files the uploader put in that folder", async () => {
    const sql = await db();
    const response = await call("photos");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, removed: 1 });
    const left = await sql.get<{ relative_path: string }>(
      "SELECT relative_path FROM files WHERE object_deleted_at IS NULL",
    );
    expect(left?.relative_path).toBe("notes.txt");
  });

  it("refuses a folder name that has a slash", async () => {
    await db();
    const response = await call("photos/trip");
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ message: "That folder name doesn't work." });
  });
});
