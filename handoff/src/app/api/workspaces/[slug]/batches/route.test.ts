import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { POST } from "./route";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const REQUEST = "33333333-3333-4333-8333-333333333333";
const CLOSED = "44444444-4444-4444-8444-444444444444";
const FOREIGN = "55555555-5555-4555-8555-555555555555";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signIn(sql: Sql, userId: string, email: string, token: string): Promise<void> {
  const now = Date.now();
  await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [userId, email, now]);
  await sql.run(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [crypto.randomUUID(), userId, await sha256Hex(token), now, now + LIMITS.sessionTtlMs],
  );
}

async function seed(sql: Sql, quota = LIMITS.defaultQuotaBytes, status = "active"): Promise<void> {
  const now = Date.now();
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
    ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, ?, ?, NULL, NULL)`,
    [WORKSPACE, quota, LIMITS.defaultRetentionDays, status, now],
  );
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
    ) VALUES (?, 'other', 'Other', 'Other Co', NULL, 'Other', 'standard', ?, ?, 0, 'active', ?, NULL, NULL)`,
    [OTHER, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, now],
  );
  await signIn(sql, "user-owner", "owner@example.com", "owner-token");
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
    [WORKSPACE, now],
  );
  await signIn(sql, "user-operator", "operator@example.com", "operator-token");
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('user-operator', 'operator@example.com', 0, ?, NULL)`,
    [now],
  );
  await sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
     VALUES ('op-1', ?, 'user-operator', 'user-operator', ?, NULL)`,
    [WORKSPACE, now],
  );
  await signIn(sql, "user-outsider", "outsider@example.com", "outsider-token");
  await sql.run(
    `INSERT INTO requests (
      id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
    ) VALUES (?, ?, 0, 'Logo', 'Square PNG', 'brand', NULL, 'open', NULL, NULL)`,
    [REQUEST, WORKSPACE],
  );
  await sql.run(
    `INSERT INTO requests (
      id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
    ) VALUES (?, ?, 1, 'Old', NULL, NULL, NULL, 'closed', NULL, ?)`,
    [CLOSED, WORKSPACE, now],
  );
  await sql.run(
    `INSERT INTO requests (
      id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
    ) VALUES (?, ?, 0, 'Foreign', NULL, NULL, NULL, 'open', NULL, NULL)`,
    [FOREIGN, OTHER],
  );
}

function post(token: string, body: unknown): Promise<Response> {
  return POST(
    new Request("https://handoff.example/api/workspaces/northwind/batches", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `handoff_session=${token}`,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: "northwind" }) },
  );
}

const logo = {
  relativePath: "brand/logo.png",
  sizeBytes: 1200,
  contentType: "image/png",
};

describe("POST /api/workspaces/[slug]/batches", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-batch-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  it("writes pending rows and object keys for a client's manifest", async () => {
    const sql = await db();
    await seed(sql);
    const response = await post("owner-token", {
      requestId: REQUEST,
      label: "Logo drop",
      note: "First pass",
      files: [logo, { relativePath: "copy/about.txt", sizeBytes: 40, contentType: "text/plain" }],
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      batchId: string;
      files: { id: string; relativePath: string; objectKey: string; status: string }[];
    };
    expect(body.files).toHaveLength(2);
    const workspace = WORKSPACE;
    for (const file of body.files) {
      expect(file.status).toBe("pending");
      expect(file.objectKey).toBe(`${workspace}/${body.batchId}/${file.id}`);
    }
    const rows = await sql.all<{ status: string; tag: string; relative_path: string }>(
      "SELECT status, tag, relative_path FROM files ORDER BY relative_path",
    );
    expect(rows).toEqual([
      { status: "pending", tag: "brand", relative_path: "brand/logo.png" },
      { status: "pending", tag: "brand", relative_path: "copy/about.txt" },
    ]);
    const batch = await sql.get<{ request_id: string; label: string }>(
      "SELECT request_id, label FROM batches WHERE id = ?",
      [body.batchId],
    );
    expect(batch).toEqual({ request_id: REQUEST, label: "Logo drop" });
    expect(JSON.stringify(body)).not.toContain("iVBOR");
  });

  it("refuses a staff caller and writes nothing", async () => {
    const sql = await db();
    await seed(sql);
    const response = await post("operator-token", { files: [logo] });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: "You cannot do that." });
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM batches");
    expect(count?.n).toBe(0);
  });

  it("returns 404 for a caller outside the workspace and writes nothing", async () => {
    const sql = await db();
    await seed(sql);
    const response = await post("outsider-token", { files: [logo] });
    expect(response.status).toBe(404);
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM batches");
    expect(count?.n).toBe(0);
  });

  it("refuses a blocked file, an over-quota manifest, and an archived workspace", async () => {
    const blocked = await db();
    await seed(blocked);
    const blockedResponse = await post("owner-token", {
      files: [{ relativePath: "notes/report.pdf.exe", sizeBytes: 12, contentType: "application/pdf" }],
    });
    expect(blockedResponse.status).toBe(422);
    const blockedBody = (await blockedResponse.json()) as { message: string };
    expect(blockedBody.message).toBe("Extension .exe is refused.");
    expect((await blocked.get<{ n: number }>("SELECT count(*) AS n FROM batches"))?.n).toBe(0);

    directory = "";
    const quota = await db();
    await seed(quota, 100);
    const quotaResponse = await post("owner-token", { files: [logo] });
    expect(quotaResponse.status).toBe(422);
    await expect(quotaResponse.json()).resolves.toMatchObject({
      message: "That batch would pass the workspace quota.",
    });

    directory = "";
    const archived = await db();
    await seed(archived, LIMITS.defaultQuotaBytes, "archived");
    const archivedResponse = await post("owner-token", { files: [logo] });
    expect(archivedResponse.status).toBe(409);
    await expect(archivedResponse.json()).resolves.toEqual({
      message: "That workspace is no longer active.",
    });
    expect((await archived.get<{ n: number }>("SELECT count(*) AS n FROM batches"))?.n).toBe(0);
  });

  it("refuses a request from another workspace or a closed request", async () => {
    const sql = await db();
    await seed(sql);
    const foreign = await post("owner-token", { requestId: FOREIGN, files: [logo] });
    expect(foreign.status).toBe(422);
    await expect(foreign.json()).resolves.toEqual({ message: "That request is not open." });
    const closed = await post("owner-token", { requestId: CLOSED, files: [logo] });
    expect(closed.status).toBe(422);
    await expect(closed.json()).resolves.toEqual({ message: "That request is not open." });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM batches"))?.n).toBe(0);
  });

  it("returns 429 for the 11th batch in an hour", async () => {
    const sql = await db();
    await seed(sql);
    const now = Date.now();
    for (let index = 0; index < LIMITS.batchesPerWorkspacePerHour; index += 1) {
      await sql.run(
        `INSERT INTO batches (
          id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
        ) VALUES (?, ?, NULL, 'user-owner', NULL, NULL, ?, ?, NULL, NULL)`,
        [`batch-${index}`, WORKSPACE, now - 1_000, now - 1_000],
      );
    }
    const response = await post("owner-token", { files: [logo] });
    expect(response.status).toBe(429);
    const files = await sql.get<{ n: number }>("SELECT count(*) AS n FROM files");
    expect(files?.n).toBe(0);
  });
});
