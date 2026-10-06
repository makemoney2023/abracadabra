import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { openObjectStore, type FilesBucket } from "@/lib/store/objects";
import { POST as complete } from "../complete/route";
import { POST as multipart } from "./route";
import { PUT as putPart } from "@/app/api/objects/parts/route";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const BYTES = new Uint8Array([1, 2, 3, 4]);

function setNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seed(sql: Sql): Promise<void> {
  const now = Date.now();
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
    ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, 'active', ?, NULL, NULL)`,
    [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, now],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-owner', 'owner@example.com', ?)", [now]);
  await sql.run(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES ('sess-1', 'user-owner', ?, ?, ?, NULL)`,
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
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, scan_attempts, created_at
    ) VALUES (?, ?, ?, 'brand/logo.png', 'png', 'image/png', ?, ?, 'brand', 'pending', 0, ?)`,
    [FILE, BATCH, WORKSPACE, BYTES.byteLength, `${WORKSPACE}/${BATCH}/${FILE}`, now],
  );
}

describe("multipart upload", () => {
  let directory = "";
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    setNodeEnv(previousNodeEnv);
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_OBJECT_PATH;
    delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-multipart-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
    const sql = await openHandoffDb();
    await migrate(sql);
    await seed(sql);
    return sql;
  }

  function create(partCount: number): Promise<Response> {
    return multipart(
      new Request(`https://handoff.example/api/batches/${BATCH}/files/${FILE}/multipart`, {
        method: "POST",
        headers: { cookie: "handoff_session=owner-token", "content-type": "application/json" },
        body: JSON.stringify({ action: "create", partCount }),
      }),
      { params: Promise.resolve({ batchId: BATCH, fileId: FILE }) },
    );
  }

  it("stores the parts and completes when the stored size matches", async () => {
    await db();
    const created = await create(1);
    expect(created.status).toBe(200);
    const body = (await created.json()) as { uploadId: string; parts: { partNumber: number; url: string }[] };
    expect(body.parts).toHaveLength(1);
    const partUrl = new URL(body.parts[0]?.url ?? "");
    expect(partUrl.pathname).toBe("/api/objects/parts");
    const stored = await putPart(
      new Request(partUrl, {
        method: "PUT",
        headers: { cookie: "handoff_session=owner-token" },
        body: BYTES,
      }),
    );
    expect(stored.status).toBe(204);
    const finished = await multipart(
      new Request(`https://handoff.example/api/batches/${BATCH}/files/${FILE}/multipart`, {
        method: "POST",
        headers: { cookie: "handoff_session=owner-token", "content-type": "application/json" },
        body: JSON.stringify({ action: "finish", uploadId: body.uploadId }),
      }),
      { params: Promise.resolve({ batchId: BATCH, fileId: FILE }) },
    );
    expect(finished.status).toBe(200);
    const stat = await openObjectStore().stat(`${WORKSPACE}/${BATCH}/${FILE}`);
    expect(stat?.sizeBytes).toBe(BYTES.byteLength);
    const done = await complete(
      new Request(`https://handoff.example/api/batches/${BATCH}/files/${FILE}/complete`, {
        method: "POST",
        headers: { cookie: "handoff_session=owner-token" },
      }),
      { params: Promise.resolve({ batchId: BATCH, fileId: FILE }) },
    );
    expect(done.status).toBe(200);
    const completed = (await done.json()) as { file: { status: string } };
    expect(completed.file.status).toBe("uploaded");
  });

  it("refuses a part count that does not match the file", async () => {
    await db();
    const response = await create(2);
    expect(response.status).toBe(422);
    const body = (await response.json()) as { message: string };
    expect(body.message).toBe("That file isn't the size we expected.");
  });

  it("accepts a bound file bucket in production", async () => {
    await db();
    delete process.env.HANDOFF_OBJECT_PATH;
    setNodeEnv("production");
    const objects = new Map<string, Uint8Array | string>();
    const bucket: FilesBucket = {
      async head(key) {
        const body = objects.get(key);
        if (body == null) return null;
        const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
        return { size: bytes.byteLength };
      },
      async get(key) {
        const body = objects.get(key);
        if (body == null) return null;
        const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
        return { arrayBuffer: async () => new Uint8Array(bytes).buffer };
      },
      async put(key, body) {
        objects.set(key, typeof body === "string" ? body : new Uint8Array(body));
      },
      async delete(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
      },
      async list() {
        return { objects: [], truncated: false };
      },
      async createMultipartUpload() {
        return {
          uploadId: `r2-${crypto.randomUUID()}`,
          async uploadPart(partNumber) {
            return { partNumber, etag: `etag-${partNumber}` };
          },
          async complete() {},
        };
      },
      resumeMultipartUpload(_key, uploadId) {
        return {
          uploadId,
          async uploadPart(partNumber) {
            return { partNumber, etag: `etag-${partNumber}` };
          },
          async complete() {},
        };
      },
    };
    (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = { env: { FILES: bucket } };
    const response = await create(1);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { uploadId: string };
    expect(body.uploadId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses local bytes in production when no object path is set", async () => {
    await db();
    delete process.env.HANDOFF_OBJECT_PATH;
    setNodeEnv("production");
    const response = await create(1);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { message: string };
    expect(body.message).toBe("File storage isn't set up yet.");
  });
});
