import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { getCaller } from "@/lib/session";
import { listHeldFiles, reviewHeldFile } from "@/lib/review";
import { POST as reviewRoute } from "@/app/api/admin/held/[fileId]/route";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const REQUEST = "44444444-4444-4444-8444-444444444444";
const BATCH = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const REASON = "The scanner stopped on a size limit. The file is a brand PDF.";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seed(sql: Sql, status: string): Promise<void> {
  const createdAt = Date.now() - 60_000;
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purge_after, purged_at
    ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, 'active', ?, NULL, NULL, NULL)`,
    [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, createdAt],
  );
  const people = [
    ["user-admin", "admin@example.com", "admin-token"],
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
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('user-admin', 'admin@example.com', 1, ?, NULL)`,
    [createdAt],
  );
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('user-op', 'operator@example.com', 0, ?, NULL)`,
    [createdAt],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
    [WORKSPACE, createdAt],
  );
  await sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
     VALUES ('op-1', ?, 'user-op', 'user-admin', ?, NULL)`,
    [WORKSPACE, createdAt],
  );
  await sql.run(
    `INSERT INTO requests (
      id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
    ) VALUES (?, ?, 1, 'Logo', 'Square mark', 'brand', NULL, 'open', NULL, NULL)`,
    [REQUEST, WORKSPACE],
  );
  await sql.run(
    `INSERT INTO batches (
      id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
    ) VALUES (?, ?, ?, 'user-owner', 'Spring drop', NULL, ?, ?, NULL, NULL)`,
    [BATCH, WORKSPACE, REQUEST, createdAt, createdAt],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, sha256, scan_reason, scan_attempts, created_at, uploaded_at, scanned_at
    ) VALUES (?, ?, ?, 'brand/logo.png', 'png', 'image/png', 4, ?, 'brand', ?, 'abc', 'Heuristics.Limits', 1, ?, ?, ?)`,
    [FILE, BATCH, WORKSPACE, `${WORKSPACE}/${BATCH}/${FILE}`, status, createdAt, createdAt, createdAt],
  );
}

describe("held file review", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-held-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  async function caller(sql: Sql, token: string) {
    return getCaller(sql, token, Date.now());
  }

  it("lets a super-admin release a held file and mark the request received", async () => {
    const sql = await db();
    await seed(sql, "held");
    const now = Date.now();
    const result = await reviewHeldFile({
      sql,
      caller: await caller(sql, "admin-token"),
      fileId: FILE,
      action: "release",
      reason: REASON,
      now,
    });
    expect(result).toEqual({ ok: true, status: "clean" });
    const file = await sql.get<{ status: string; scan_reason: string; scanned_at: number }>(
      "SELECT status, scan_reason, scanned_at FROM files WHERE id = ?",
      [FILE],
    );
    expect(file).toEqual({ status: "clean", scan_reason: REASON, scanned_at: now });
    const request = await sql.get<{ status: string; received_at: number }>(
      "SELECT status, received_at FROM requests WHERE id = ?",
      [REQUEST],
    );
    expect(request).toEqual({ status: "received", received_at: now });
    const audits = await sql.all<{ action: string; metadata: string }>(
      "SELECT action, metadata FROM audit_events WHERE subject_id = ?",
      [FILE],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("file.released");
    expect(audits[0]?.metadata).toContain(REASON);
    expect(audits[0]?.metadata).not.toContain("https://");
    const mail = await sql.get<{ event: string; recipient_email: string }>(
      "SELECT event, recipient_email FROM notifications",
    );
    expect(mail).toEqual({ event: "file.released", recipient_email: "owner@example.com" });
    const again = await reviewHeldFile({
      sql,
      caller: await caller(sql, "admin-token"),
      fileId: FILE,
      action: "release",
      reason: REASON,
      now: now + 1,
    });
    expect(again).toEqual({ ok: false, status: 409, message: "That file isn't on hold." });
    const auditCount = await sql.get<{ n: number }>("SELECT count(*) AS n FROM audit_events");
    expect(auditCount?.n).toBe(1);
  });

  it("lets a super-admin reject a held file without receiving the request", async () => {
    const sql = await db();
    await seed(sql, "held");
    const now = Date.now();
    const result = await reviewHeldFile({
      sql,
      caller: await caller(sql, "admin-token"),
      fileId: FILE,
      action: "reject",
      reason: "  Not a brand file.  ",
      now,
    });
    expect(result).toEqual({ ok: true, status: "rejected" });
    const file = await sql.get<{ status: string; scan_reason: string }>(
      "SELECT status, scan_reason FROM files WHERE id = ?",
      [FILE],
    );
    expect(file).toEqual({ status: "rejected", scan_reason: "Not a brand file." });
    const request = await sql.get<{ status: string }>("SELECT status FROM requests WHERE id = ?", [REQUEST]);
    expect(request?.status).toBe("open");
    const audit = await sql.get<{ action: string }>(
      "SELECT action FROM audit_events WHERE subject_id = ?",
      [FILE],
    );
    expect(audit?.action).toBe("file.rejected_from_held");
    const mail = await sql.get<{ event: string; recipient_email: string }>(
      "SELECT event, recipient_email FROM notifications",
    );
    expect(mail).toEqual({ event: "file.rejected_from_held", recipient_email: "owner@example.com" });
  });

  it("refuses an operator, a client, an outsider, and a blank reason", async () => {
    const sql = await db();
    await seed(sql, "held");
    const now = Date.now();
    const operator = await reviewHeldFile({
      sql,
      caller: await caller(sql, "operator-token"),
      fileId: FILE,
      action: "release",
      reason: REASON,
      now,
    });
    const client = await reviewHeldFile({
      sql,
      caller: await caller(sql, "owner-token"),
      fileId: FILE,
      action: "reject",
      reason: REASON,
      now,
    });
    const outsider = await reviewHeldFile({
      sql,
      caller: await caller(sql, "out-token"),
      fileId: FILE,
      action: "release",
      reason: REASON,
      now,
    });
    const blank = await reviewHeldFile({
      sql,
      caller: await caller(sql, "admin-token"),
      fileId: FILE,
      action: "release",
      reason: "   ",
      now,
    });
    expect(operator).toEqual({ ok: false, status: 403, message: "You can't do that." });
    expect(client).toEqual({ ok: false, status: 403, message: "You can't do that." });
    expect(outsider).toEqual({ ok: false, status: 404, message: "We couldn't find that." });
    expect(blank).toEqual({ ok: false, status: 422, message: "Please tell us why." });
    const audits = await sql.get<{ n: number }>("SELECT count(*) AS n FROM audit_events");
    expect(audits?.n).toBe(0);
    const held = await listHeldFiles(sql, await caller(sql, "admin-token"));
    expect(held.map((row) => row.id)).toEqual([FILE]);
    expect(held[0]?.relativePath).toBe("brand/logo.png");
    expect(held[0]?.workspaceName).toBe("Northwind Co");
  });

  it("posts the review through the admin route", async () => {
    const sql = await db();
    await seed(sql, "held");
    const response = await reviewRoute(
      new Request(`https://handoff.example/api/admin/held/${FILE}`, {
        method: "POST",
        headers: {
          cookie: "handoff_session=admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "release", reason: REASON }),
      }),
      { params: Promise.resolve({ fileId: FILE }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("clean");
  });
});
