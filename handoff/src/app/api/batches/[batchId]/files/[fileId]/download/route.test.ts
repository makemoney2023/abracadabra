import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { duplicateFileIds, loadBatchScreen } from "@/lib/downloads";
import { getCaller } from "@/lib/session";
import { LIMITS } from "@/lib/policy/limits";
import { POST as discard } from "../../../discard/route";
import { GET as content } from "../../../../../files/[fileId]/content/route";
import { POST as tag } from "../tag/route";
import { GET as download } from "./route";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const EARLIER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HASH = "ab".repeat(32);

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seed(sql: Sql, status: string): Promise<void> {
  const createdAt = Date.now() - 60_000;
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
    ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, 'active', ?, NULL, NULL)`,
    [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, createdAt],
  );
  const people = [
    ["user-owner", "owner@example.com", "owner-token"],
    ["user-member", "member@example.com", "member-token"],
    ["user-out", "outsider@example.com", "out-token"],
    ["user-op", "operator@example.com", "operator-token"],
  ] as const;
  for (const [id, email] of people) {
    await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [id, email, createdAt]);
  }
  const signedAt = Date.now();
  for (const [id, , token] of people) {
    await sql.run(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [`sess-${id}`, id, await sha256Hex(token), signedAt, signedAt + LIMITS.sessionTtlMs],
    );
  }
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
    [WORKSPACE, createdAt],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-member', ?, 'user-member', 'member@example.com', 'client_member', ?, NULL)`,
    [WORKSPACE, createdAt],
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
    ) VALUES (?, ?, NULL, 'user-owner', 'Spring drop', NULL, ?, ?, NULL, NULL)`,
    [BATCH, WORKSPACE, createdAt, createdAt],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, sha256, scan_attempts, created_at, scanned_at
    ) VALUES (?, ?, ?, 'brand/logo.png', 'png', 'image/png', 4, ?, 'brand', ?, ?, 0, ?, ?)`,
    [FILE, BATCH, WORKSPACE, `${WORKSPACE}/${BATCH}/${FILE}`, status, HASH, createdAt, createdAt + 1_000],
  );
}

function callDownload(token: string): Promise<Response> {
  return download(
    new Request(`https://handoff.example/api/batches/${BATCH}/files/${FILE}/download`, {
      headers: { cookie: `handoff_session=${token}` },
    }),
    { params: Promise.resolve({ batchId: BATCH, fileId: FILE }) },
  );
}

describe("batch download and discard", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_OBJECT_PATH;
    delete process.env.HANDOFF_SIGNING_SECRET;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(path.join(tmpdir(), "handoff-download-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
    process.env.HANDOFF_SIGNING_SECRET = "test-signing-secret";
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  it("returns a 5-minute attachment URL for a clean file and writes file.downloaded", async () => {
    const sql = await db();
    await seed(sql, "clean");
    const { openObjectStore } = await import("@/lib/store/objects");
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await openObjectStore().put(`${WORKSPACE}/${BATCH}/${FILE}`, bytes);
    const before = Math.floor(Date.now() / 1000);
    const response = await callDownload("owner-token");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    const url = new URL(body.url);
    expect(url.origin).toBe("https://handoff.example");
    expect(url.pathname).toBe(`/api/files/${FILE}/content`);
    const exp = Number(url.searchParams.get("exp"));
    expect(exp).toBeGreaterThanOrEqual(before + LIMITS.downloadTtlSeconds);
    expect(exp).toBeLessThanOrEqual(before + LIMITS.downloadTtlSeconds + 2);
    const streamed = await content(new Request(body.url), {
      params: Promise.resolve({ fileId: FILE }),
    });
    expect(streamed.status).toBe(200);
    expect(streamed.headers.get("content-disposition")).toBe('attachment; filename="logo.png"');
    expect(new Uint8Array(await streamed.arrayBuffer())).toEqual(bytes);
    const audited = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM audit_events WHERE action = 'file.downloaded' AND subject_id = ?",
      [FILE],
    );
    expect(audited?.n).toBe(1);
    const metadata = await sql.get<{ metadata: string }>(
      "SELECT metadata FROM audit_events WHERE action = 'file.downloaded'",
    );
    expect(metadata?.metadata).not.toContain("sig=");
  });

  it("refuses a held, scanning, or rejected file", async () => {
    for (const status of ["held", "scanning", "rejected"]) {
      const sql = await db();
      await seed(sql, status);
      const response = await callDownload("owner-token");
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ message: "That file isn't ready to download yet." });
      const audited = await sql.get<{ n: number }>(
        "SELECT count(*) AS n FROM audit_events WHERE action = 'file.downloaded'",
      );
      expect(audited?.n).toBe(0);
    }
  });

  it("hides the file from a caller outside the workspace", async () => {
    const sql = await db();
    await seed(sql, "clean");
    const response = await callDownload("out-token");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "We couldn't find that." });
  });

  it("lets a client discard their own batch only while no file is clean", async () => {
    const sql = await db();
    await seed(sql, "pending");
    const refused = await discard(
      new Request(`https://handoff.example/api/batches/${BATCH}/discard`, {
        method: "POST",
        headers: { cookie: "handoff_session=member-token" },
      }),
      { params: Promise.resolve({ batchId: BATCH }) },
    );
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toEqual({ message: "You can't do that." });

    const response = await discard(
      new Request(`https://handoff.example/api/batches/${BATCH}/discard`, {
        method: "POST",
        headers: { cookie: "handoff_session=owner-token" },
      }),
      { params: Promise.resolve({ batchId: BATCH }) },
    );
    expect(response.status).toBe(200);
    const row = await sql.get<{ discarded_at: number | null }>(
      "SELECT discarded_at FROM batches WHERE id = ?",
      [BATCH],
    );
    expect(row?.discarded_at).not.toBeNull();
    const audited = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM audit_events WHERE action = 'batch.discarded' AND subject_id = ?",
      [BATCH],
    );
    expect(audited?.n).toBe(1);

    await sql.run("UPDATE files SET status = 'clean' WHERE id = ?", [FILE]);
    await sql.run("UPDATE batches SET discarded_at = NULL WHERE id = ?", [BATCH]);
    const blocked = await discard(
      new Request(`https://handoff.example/api/batches/${BATCH}/discard`, {
        method: "POST",
        headers: { cookie: "handoff_session=owner-token" },
      }),
      { params: Promise.resolve({ batchId: BATCH }) },
    );
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toEqual({
      message: "A safe file is already in this upload.",
    });

    const hidden = await discard(
      new Request(`https://handoff.example/api/batches/${BATCH}/discard`, {
        method: "POST",
        headers: { cookie: "handoff_session=out-token" },
      }),
      { params: Promise.resolve({ batchId: BATCH }) },
    );
    expect(hidden.status).toBe(404);
  });

  it("lets an operator change a file tag", async () => {
    const sql = await db();
    await seed(sql, "clean");
    const response = await tag(
      new Request(`https://handoff.example/api/batches/${BATCH}/files/${FILE}/tag`, {
        method: "POST",
        headers: { cookie: "handoff_session=operator-token", "content-type": "application/json" },
        body: JSON.stringify({ tag: "photo" }),
      }),
      { params: Promise.resolve({ batchId: BATCH, fileId: FILE }) },
    );
    expect(response.status).toBe(200);
    const row = await sql.get<{ tag: string }>("SELECT tag FROM files WHERE id = ?", [FILE]);
    expect(row?.tag).toBe("photo");
    const audited = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM audit_events WHERE action = 'file.tagged' AND subject_id = ?",
      [FILE],
    );
    expect(audited?.n).toBe(1);
    const client = await tag(
      new Request(`https://handoff.example/api/batches/${BATCH}/files/${FILE}/tag`, {
        method: "POST",
        headers: { cookie: "handoff_session=owner-token", "content-type": "application/json" },
        body: JSON.stringify({ tag: "copy" }),
      }),
      { params: Promise.resolve({ batchId: BATCH, fileId: FILE }) },
    );
    expect(client.status).toBe(403);
  });

  it("marks a file whose hash matches an earlier clean file in the workspace", async () => {
    const sql = await db();
    await seed(sql, "uploaded");
    const earlierBatch = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const earlierFile = EARLIER;
    const earlierAt = Date.now() - 120_000;
    await sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, 'user-owner', 'Earlier drop', NULL, ?, ?, NULL, NULL)`,
      [earlierBatch, WORKSPACE, earlierAt, earlierAt],
    );
    await sql.run(
      `INSERT INTO files (
        id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
        object_key, tag, status, sha256, scan_attempts, created_at, scanned_at
      ) VALUES (?, ?, ?, 'brand/old.png', 'png', 'image/png', 4, ?, 'brand', 'clean', ?, 0, ?, ?)`,
      [earlierFile, earlierBatch, WORKSPACE, `${WORKSPACE}/${earlierBatch}/${earlierFile}`, HASH, earlierAt, earlierAt + 1],
    );
    const caller = await getCaller(sql, "owner-token", Date.now());
    const screen = await loadBatchScreen(sql, caller, BATCH);
    const current = screen?.files.find((file) => file.id === FILE);
    expect(current?.duplicate).toBe(true);
    const earlierScreen = await loadBatchScreen(sql, caller, earlierBatch);
    expect(earlierScreen?.files.find((file) => file.id === earlierFile)?.duplicate).toBe(false);
    const marked = duplicateFileIds([
      {
        id: EARLIER,
        sha256: HASH,
        status: "clean",
        createdAt: 1_000,
        scannedAt: 1_500,
      },
      {
        id: FILE,
        sha256: HASH,
        status: "uploaded",
        createdAt: 2_000,
        scannedAt: 2_500,
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        sha256: HASH,
        status: "rejected",
        createdAt: 100,
        scannedAt: 200,
      },
    ]);
    expect(marked.has(FILE)).toBe(true);
    expect(marked.has(EARLIER)).toBe(false);
    expect(
      duplicateFileIds([
        { id: EARLIER, sha256: HASH, status: "clean", createdAt: 1_000, scannedAt: 2_000 },
        { id: FILE, sha256: HASH, status: "clean", createdAt: 1_000, scannedAt: 2_000 },
      ]).size,
    ).toBe(0);
  });
});
