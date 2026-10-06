import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import type { OutboundMail } from "@/lib/session";
import { deliverNotifications, markRequestReceived, queueProductEvent } from "@/lib/notifications";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const REQUEST = "44444444-4444-4444-8444-444444444444";
const BATCH = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const ORIGIN = "https://handoff.example";

async function seed(sql: Sql, digest: number): Promise<void> {
  const now = Date.now();
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purge_after, purged_at
    ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, ?, 'active', ?, NULL, NULL, NULL)`,
    [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, digest, now],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-owner', 'owner@example.com', ?)", [now]);
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-op', 'operator@example.com', ?)", [now]);
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-member', 'member@example.com', ?)", [now]);
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
    [WORKSPACE, now],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-member', ?, 'user-member', 'member@example.com', 'client_member', ?, NULL)`,
    [WORKSPACE, now],
  );
  await sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
     VALUES ('op-1', ?, 'user-op', 'user-owner', ?, NULL)`,
    [WORKSPACE, now],
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
    [BATCH, WORKSPACE, REQUEST, now, now],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, sha256, scan_reason, scan_attempts, created_at, uploaded_at, scanned_at
    ) VALUES (?, ?, ?, 'brand/logo.png', 'png', 'image/png', 4, ?, 'brand', 'clean', 'abc', 'Win.Test.EICAR_HDB-1', 1, ?, ?, ?)`,
    [FILE, BATCH, WORKSPACE, `${WORKSPACE}/${BATCH}/${FILE}`, now, now, now],
  );
}

describe("handoff notifications", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_FROM_EMAIL;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(path.join(tmpdir(), "handoff-mail-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_FROM_EMAIL = "handoff@example.com";
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  it("marks a named request received on the first clean file", async () => {
    const sql = await db();
    await seed(sql, 0);
    const now = Date.now();
    await markRequestReceived(sql, FILE, now);
    const first = await sql.get<{ status: string; received_at: number }>(
      "SELECT status, received_at FROM requests WHERE id = ?",
      [REQUEST],
    );
    expect(first).toEqual({ status: "received", received_at: now });
    await markRequestReceived(sql, FILE, now + 50);
    const second = await sql.get<{ received_at: number }>("SELECT received_at FROM requests WHERE id = ?", [REQUEST]);
    expect(second?.received_at).toBe(now);
  });

  it("queues each product event once per recipient", async () => {
    const sql = await db();
    await seed(sql, 1);
    const now = Date.now();
    await queueProductEvent(sql, { kind: "batch.ready", batchId: BATCH }, now);
    await queueProductEvent(sql, { kind: "file.flagged", fileId: FILE, status: "rejected" }, now);
    await queueProductEvent(sql, { kind: "file.flagged", fileId: FILE, status: "held" }, now);
    await queueProductEvent(sql, { kind: "file.reviewed", fileId: FILE, status: "released" }, now);
    await queueProductEvent(sql, { kind: "file.reviewed", fileId: FILE, status: "rejected" }, now);
    await queueProductEvent(sql, { kind: "batch.window_failed", batchId: BATCH }, now);
    await queueProductEvent(sql, { kind: "request.digest", workspaceId: WORKSPACE, weekStart: 10 }, now);
    await queueProductEvent(sql, { kind: "workspace.archived", workspaceId: WORKSPACE }, now);
    await queueProductEvent(sql, { kind: "workspace.purge_scheduled", workspaceId: WORKSPACE }, now);

    const rows = await sql.all<{ event: string; recipient_email: string; idempotency_key: string }>(
      "SELECT event, recipient_email, idempotency_key FROM notifications ORDER BY idempotency_key",
    );
    const keys = new Set(rows.map((row) => row.idempotency_key));
    expect(keys.size).toBe(rows.length);
    expect(rows.filter((row) => row.event === "batch.ready").map((row) => row.recipient_email)).toEqual([
      "operator@example.com",
    ]);
    expect(rows.filter((row) => row.event === "file.rejected").map((row) => row.recipient_email).sort()).toEqual([
      "operator@example.com",
      "owner@example.com",
    ]);
    expect(rows.filter((row) => row.event === "file.released").map((row) => row.recipient_email)).toEqual([
      "owner@example.com",
    ]);
    expect(rows.filter((row) => row.event === "batch.window_failed").map((row) => row.recipient_email)).toEqual([
      "owner@example.com",
    ]);
    expect(rows.filter((row) => row.event === "request.digest").map((row) => row.recipient_email)).toEqual([
      "owner@example.com",
    ]);
    expect(rows.filter((row) => row.event === "workspace.archived").map((row) => row.recipient_email).sort()).toEqual([
      "operator@example.com",
      "owner@example.com",
    ]);
  });

  it("sends a repeated event only once", async () => {
    const sql = await db();
    await seed(sql, 0);
    const sent: OutboundMail[] = [];
    const now = Date.now();
    await queueProductEvent(sql, { kind: "batch.ready", batchId: BATCH }, now);
    await deliverNotifications(sql, async (mail) => {
      sent.push(mail);
    }, now, ORIGIN);
    await queueProductEvent(sql, { kind: "batch.ready", batchId: BATCH }, now + 1);
    await deliverNotifications(sql, async (mail) => {
      sent.push(mail);
    }, now + 1, ORIGIN);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("operator@example.com");
  });

  it("puts only a Handoff page link in the email", async () => {
    const sql = await db();
    await seed(sql, 0);
    const sent: OutboundMail[] = [];
    await queueProductEvent(sql, { kind: "file.flagged", fileId: FILE, status: "rejected" }, Date.now());
    await deliverNotifications(sql, async (mail) => {
      sent.push(mail);
    }, Date.now(), ORIGIN);
    const operator = sent.find((mail) => mail.to === "operator@example.com");
    expect(operator?.text).toContain("Northwind Co");
    expect(operator?.text).toContain("Win.Test.EICAR_HDB-1");
    expect(operator?.text).not.toContain("brand/logo.png bytes");
    const urls = operator?.text.match(/https?:\/\/\S+/g) ?? [];
    expect(urls).toEqual([`${ORIGIN}/w/northwind/batches/${BATCH}`]);
  });

  it("skips the weekly digest unless the workspace enabled it", async () => {
    const sql = await db();
    await seed(sql, 0);
    await queueProductEvent(sql, { kind: "request.digest", workspaceId: WORKSPACE, weekStart: 10 }, Date.now());
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM notifications");
    expect(count?.n).toBe(0);
  });
});
