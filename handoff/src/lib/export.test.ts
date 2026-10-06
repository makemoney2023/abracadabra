import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { getCaller } from "@/lib/session";
import { LIMITS } from "@/lib/policy/limits";
import { exportBatch } from "@/lib/export";
import { pullExport } from "../../cli/pull";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const CLEAN = "33333333-3333-4333-8333-333333333333";
const HELD = "44444444-4444-4444-8444-444444444444";
const REJECTED = "55555555-5555-4555-8555-555555555555";
const FAILED = "66666666-6666-4666-8666-666666666666";
const HASH = "ab".repeat(32);

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
  const people = [
    ["user-owner", "owner@example.com", "owner-token"],
    ["user-op", "operator@example.com", "operator-token"],
    ["user-out", "outsider@example.com", "out-token"],
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
  const files = [
    [CLEAN, "brand/logo.png", "clean", HASH],
    [HELD, "review/hold.pdf", "held", "cd".repeat(32)],
    [REJECTED, "notes/bad.txt", "rejected", null],
    [FAILED, "exports/miss.csv", "failed", null],
  ] as const;
  for (const [id, relativePath, status, hash] of files) {
    await sql.run(
      `INSERT INTO files (
        id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
        object_key, tag, status, sha256, scan_attempts, created_at
      ) VALUES (?, ?, ?, ?, 'png', NULL, 4, ?, 'brand', ?, ?, 0, ?)`,
      [id, BATCH, WORKSPACE, relativePath, `${WORKSPACE}/${BATCH}/${id}`, status, hash, createdAt],
    );
  }
}

describe("batch export", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_SIGNING_SECRET;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(path.join(tmpdir(), "handoff-export-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_SIGNING_SECRET = "test-signing-secret";
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  it("lists clean files with 60-minute URLs and other files without URLs", async () => {
    const sql = await db();
    await seed(sql);
    const operator = await getCaller(sql, "operator-token", Date.now());
    const now = Date.now();
    const result = await exportBatch({
      sql,
      caller: operator,
      batchId: BATCH,
      origin: "https://handoff.example",
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.slug).toBe("northwind");
    expect(result.document.batchId).toBe(BATCH);
    expect(result.document.label).toBe("Spring drop");
    const clean = result.document.files.find((file) => file.relativePath === "brand/logo.png");
    expect(clean?.sizeBytes).toBe(4);
    expect(clean?.sha256).toBe(HASH);
    expect(clean?.status).toBe("clean");
    const url = new URL(clean?.url ?? "https://invalid.example/");
    expect(url.origin).toBe("https://handoff.example");
    expect(url.pathname).toBe(`/api/files/${CLEAN}/content`);
    const exp = Number(url.searchParams.get("exp"));
    const floor = Math.floor(now / 1000);
    expect(exp).toBeGreaterThanOrEqual(floor + LIMITS.exportTtlSeconds);
    expect(exp).toBeLessThanOrEqual(floor + LIMITS.exportTtlSeconds + 2);
    for (const relativePath of ["review/hold.pdf", "notes/bad.txt", "exports/miss.csv"]) {
      const file = result.document.files.find((row) => row.relativePath === relativePath);
      expect(file).toBeDefined();
      expect(file).not.toHaveProperty("url");
    }
    const audits = await sql.all<{ metadata: string }>(
      "SELECT metadata FROM audit_events WHERE action = 'batch.exported'",
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).not.toContain("sig=");
    expect(audits[0]?.metadata).not.toContain("https://");
  });

  it("refuses a client and the 21st export in an hour", async () => {
    const sql = await db();
    await seed(sql);
    const now = Date.now();
    const owner = await getCaller(sql, "owner-token", now);
    const refused = await exportBatch({
      sql,
      caller: owner,
      batchId: BATCH,
      origin: "https://handoff.example",
      now,
    });
    expect(refused).toEqual({ ok: false, status: 403, message: "You cannot do that." });

    const outsider = await exportBatch({
      sql,
      caller: await getCaller(sql, "out-token", now),
      batchId: BATCH,
      origin: "https://handoff.example",
      now,
    });
    expect(outsider).toEqual({ ok: false, status: 404, message: "Not found." });

    for (let index = 0; index < LIMITS.exportsPerOperatorPerHour; index += 1) {
      await sql.run(
        `INSERT INTO audit_events (
          id, workspace_id, actor_user_id, action, subject_type, subject_id, at, metadata
        ) VALUES (?, ?, 'user-op', 'batch.exported', 'batch', ?, ?, '{}')`,
        [`audit-${index}`, WORKSPACE, BATCH, now - 1_000],
      );
    }
    const operator = await getCaller(sql, "operator-token", now);
    const limited = await exportBatch({
      sql,
      caller: operator,
      batchId: BATCH,
      origin: "https://handoff.example",
      now,
    });
    expect(limited).toEqual({ ok: false, status: 429, message: "Export limit reached for this hour." });
  });
});

describe("handoff pull", () => {
  let directory = "";

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  function target(): string {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-pull-"));
    return directory;
  }

  it("recreates the tree, verifies each hash, and skips matching files", async () => {
    const root = target();
    const logo = new TextEncoder().encode("logo");
    const note = new TextEncoder().encode("note");
    const logoHash = await sha256Hex("logo");
    const noteHash = await sha256Hex("note");
    const document = {
      files: [
        { relativePath: "brand/logo.png", sha256: logoHash, url: "https://files.example/logo" },
        { relativePath: "notes/copy.txt", sha256: noteHash, url: "https://files.example/note" },
      ],
    };
    const fetched: string[] = [];
    const first = await pullExport({
      document,
      targetDir: root,
      fetchFile: async (url) => {
        fetched.push(url);
        return url.endsWith("logo") ? logo : note;
      },
    });
    expect(first).toBe(0);
    expect(readFileSync(path.join(root, "brand/logo.png"))).toEqual(Buffer.from(logo));
    expect(readFileSync(path.join(root, "notes/copy.txt"))).toEqual(Buffer.from(note));
    const second = await pullExport({
      document,
      targetDir: root,
      fetchFile: async () => {
        throw new Error("should skip");
      },
    });
    expect(second).toBe(0);
    expect(fetched).toEqual(["https://files.example/logo", "https://files.example/note"]);
  });

  it("refuses a path that resolves outside the target directory", async () => {
    const root = target();
    const code = await pullExport({
      document: {
        files: [{ relativePath: "../outside.txt", sha256: HASH, url: "https://files.example/x" }],
      },
      targetDir: root,
      fetchFile: async () => new TextEncoder().encode("nope"),
    });
    expect(code).toBe(1);
    expect(() => readFileSync(path.join(root, "..", "outside.txt"))).toThrow();
  });

  it("deletes a partial file whose hash does not match and exits non-zero", async () => {
    const root = target();
    const code = await pullExport({
      document: {
        files: [{ relativePath: "brand/logo.png", sha256: HASH, url: "https://files.example/logo" }],
      },
      targetDir: root,
      fetchFile: async () => new TextEncoder().encode("wrong"),
    });
    expect(code).toBe(1);
    expect(() => readFileSync(path.join(root, "brand/logo.png"))).toThrow();
  });
});
