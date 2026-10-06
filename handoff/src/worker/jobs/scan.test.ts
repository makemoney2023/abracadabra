import { mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import type { ClamdResult } from "@/lib/scan";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { parseClamdReply } from "../clamd";
import { startHealthServer, workerBoot } from "../index";
import { claimUploadedFile, scanClaimedFile } from "./scan";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const BYTES = new TextEncoder().encode("hello-scan\n");

async function seed(sql: Sql, scanAttempts = 0): Promise<void> {
  const now = Date.now();
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
    [BATCH, WORKSPACE, now, now],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, scan_attempts, created_at, uploaded_at, next_scan_at
    ) VALUES (?, ?, ?, 'notes/hello.txt', 'txt', 'text/plain', ?, ?, 'copy', 'uploaded', ?, ?, ?, ?)`,
    [
      FILE,
      BATCH,
      WORKSPACE,
      BYTES.byteLength,
      `${WORKSPACE}/${BATCH}/${FILE}`,
      scanAttempts,
      now,
      now,
      now,
    ],
  );
}

describe("scan job", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<{ sql: Sql; store: ObjectStore; reads: { count: number } }> {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(path.join(tmpdir(), "handoff-scan-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const sql = await openHandoffDb();
    await migrate(sql);
    const inner = localObjectStore(path.join(directory, "objects"));
    const reads = { count: 0 };
    const store: ObjectStore = {
      ...inner,
      async read(key) {
        reads.count += 1;
        return inner.read(key);
      },
    };
    await store.put(`${WORKSPACE}/${BATCH}/${FILE}`, BYTES);
    return { sql, store, reads };
  }

  it("marks a claimed file scanning and reads it once", async () => {
    const { sql, store, reads } = await db();
    await seed(sql);
    const claimed = await claimUploadedFile(sql, Date.now());
    expect(claimed?.id).toBe(FILE);
    const row = await sql.get<{ status: string; scan_attempts: number }>(
      "SELECT status, scan_attempts FROM files WHERE id = ?",
      [FILE],
    );
    expect(row).toEqual({ status: "scanning", scan_attempts: 1 });
    const seen: Uint8Array[] = [];
    await scanClaimedFile({
      sql,
      store,
      file: claimed!,
      now: Date.now(),
      allowUnscanned: false,
      scanBytes: async (bytes) => {
        seen.push(bytes);
        return { kind: "ok" };
      },
    });
    expect(reads.count).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(BYTES);
    const hashed = createHash("sha256").update(BYTES).digest("hex");
    const saved = await sql.get<{ sha256: string; status: string }>(
      "SELECT sha256, status FROM files WHERE id = ?",
      [FILE],
    );
    expect(saved).toEqual({ sha256: hashed, status: "clean" });
  });

  it("writes each scan outcome", async () => {
    const cases: { clamd: ClamdResult; status: string; reason: string | null; attempts: number }[] = [
      { clamd: { kind: "ok" }, status: "clean", reason: null, attempts: 0 },
      { clamd: { kind: "found", signature: "Win.Test.EICAR_HDB-1" }, status: "rejected", reason: "Win.Test.EICAR_HDB-1", attempts: 0 },
      { clamd: { kind: "limit", detail: "Heuristics.Limits.Exceeded.MaxFiles" }, status: "held", reason: "Heuristics.Limits.Exceeded.MaxFiles", attempts: 0 },
      { clamd: { kind: "error", detail: "scanner timed out" }, status: "uploaded", reason: "scanner timed out", attempts: 0 },
      { clamd: { kind: "error", detail: "scanner timed out" }, status: "held", reason: "scanner timed out", attempts: 4 },
    ];
    for (const outcome of cases) {
      const { sql, store } = await db();
      await seed(sql, outcome.attempts);
      const now = Date.now();
      const claimed = await claimUploadedFile(sql, now);
      await scanClaimedFile({
        sql,
        store,
        file: claimed!,
        now,
        allowUnscanned: false,
        scanBytes: async () => outcome.clamd,
      });
      const row = await sql.get<{ status: string; scan_reason: string | null; next_scan_at: number | null }>(
        "SELECT status, scan_reason, next_scan_at FROM files WHERE id = ?",
        [FILE],
      );
      expect(row?.status).toBe(outcome.status);
      expect(row?.scan_reason).toBe(outcome.reason);
      if (outcome.status === "uploaded") {
        expect(row?.next_scan_at).toBe(now + 2 ** (outcome.attempts + 1) * 1000);
      }
      const audits = await sql.all<{ action: string; metadata: string }>(
        "SELECT action, metadata FROM audit_events WHERE subject_id = ? ORDER BY action",
        [FILE],
      );
      expect(audits.some((event) => event.action === "file.scanned")).toBe(true);
      if (outcome.status === "held") {
        expect(audits.some((event) => event.action === "file.held")).toBe(true);
      }
      const packed = audits.map((event) => event.metadata).join("\n");
      expect(packed).not.toContain("hello-scan");
      expect(packed).not.toContain("http");
    }
  });

  it("returns a retry to uploaded with next_scan_at", async () => {
    const { sql, store } = await db();
    await seed(sql, 0);
    const now = Date.now();
    const claimed = await claimUploadedFile(sql, now);
    const decision = await scanClaimedFile({
      sql,
      store,
      file: claimed!,
      now,
      allowUnscanned: false,
      scanBytes: async () => ({ kind: "error", detail: "scanner timed out" }),
    });
    expect(decision).toEqual({ status: "retry", delaySeconds: 2 });
    const row = await sql.get<{ status: string; next_scan_at: number }>(
      "SELECT status, next_scan_at FROM files WHERE id = ?",
      [FILE],
    );
    expect(row).toEqual({ status: "uploaded", next_scan_at: now + 2000 });
  });

  it("lets only one worker claim a file", async () => {
    const { sql } = await db();
    await seed(sql);
    const other = await openHandoffDb();
    const now = Date.now();
    const [first, second] = await Promise.all([claimUploadedFile(sql, now), claimUploadedFile(other, now)]);
    const winners = [first, second].filter((claim) => claim !== null);
    expect(winners).toHaveLength(1);
    const row = await sql.get<{ status: string; scan_attempts: number }>(
      "SELECT status, scan_attempts FROM files WHERE id = ?",
      [FILE],
    );
    expect(row).toEqual({ status: "scanning", scan_attempts: 1 });
  });

  it("refuses production startup without clamd or with unscanned files allowed", async () => {
    expect(await workerBoot({ nodeEnv: "production", allowUnscanned: undefined, ping: async () => false })).not.toBe(0);
    expect(await workerBoot({ nodeEnv: "production", allowUnscanned: "1", ping: async () => true })).not.toBe(0);
    expect(await workerBoot({ nodeEnv: "development", allowUnscanned: "1", ping: async () => false })).toBe(0);
  });

  it("classifies clamd limit alerts separately from findings", () => {
    expect(parseClamdReply("stream: OK")).toEqual({ kind: "ok" });
    expect(parseClamdReply("stream: Win.Test.EICAR_HDB-1 FOUND")).toEqual({
      kind: "found",
      signature: "Win.Test.EICAR_HDB-1",
    });
    expect(parseClamdReply("stream: Heuristics.Limits.Exceeded.MaxFiles FOUND")).toEqual({
      kind: "limit",
      detail: "stream: Heuristics.Limits.Exceeded.MaxFiles FOUND",
    });
  });

  it("reports clamd reachability on the health port", async () => {
    const server = await startHealthServer(0, async () => false);
    const address = server.address();
    expect(address && typeof address === "object" ? address.address : "").toBe("0.0.0.0");
    const port = address && typeof address === "object" ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ clamd: false });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
});
