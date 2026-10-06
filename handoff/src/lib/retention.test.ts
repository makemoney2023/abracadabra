import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST as archiveRoute } from "@/app/api/workspaces/[slug]/archive/route";
import { GET as exportRoute } from "@/app/api/workspaces/[slug]/export/route";
import { POST as purgeRoute } from "@/app/api/workspaces/[slug]/purge/route";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { issueDownload } from "@/lib/downloads";
import { renderProductEmail } from "@/lib/email-templates";
import { LIMITS } from "@/lib/policy/limits";
import { archiveWorkspace, exportWorkspace, purgeWorkspace, queuePurgeReminders } from "@/lib/retention";
import { getCaller } from "@/lib/session";
import { createBatch } from "@/lib/store/batches";
import { createInvite } from "@/lib/store/invites";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { createRequest } from "@/lib/store/requests";
import { purgeDueWorkspaces } from "@/worker/jobs/purge";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const REQUEST = "44444444-4444-4444-8444-444444444444";
const BATCH = "22222222-2222-4222-8222-222222222222";
const BATCH_TWO = "55555555-5555-4555-8555-555555555555";
const FILE = "33333333-3333-4333-8333-333333333333";
const FILE_TWO = "66666666-6666-4666-8666-666666666666";
const ORIGIN = "http://127.0.0.1:3000";
const DAY_MS = 24 * 60 * 60 * 1000;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seed(sql: Sql): Promise<void> {
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
    `INSERT INTO invites (id, workspace_id, email, role, invited_by, expires_at, accepted_at, revoked_at)
     VALUES ('invite-1', ?, 'guest@example.com', 'client_member', 'user-admin', ?, NULL, NULL)`,
    [WORKSPACE, createdAt + 14 * DAY_MS],
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
    `INSERT INTO batches (
      id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
    ) VALUES (?, ?, NULL, 'user-owner', 'Notes', NULL, ?, ?, NULL, NULL)`,
    [BATCH_TWO, WORKSPACE, createdAt + 1, createdAt + 1],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, sha256, scan_reason, scan_attempts, created_at, uploaded_at, scanned_at
    ) VALUES (?, ?, ?, 'brand/logo.png', 'png', 'image/png', 4, ?, 'brand', 'clean', ?, NULL, 1, ?, ?, ?)`,
    [FILE, BATCH, WORKSPACE, `${WORKSPACE}/${BATCH}/${FILE}`, "ab".repeat(32), createdAt, createdAt, createdAt],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
      object_key, tag, status, sha256, scan_reason, scan_attempts, created_at, uploaded_at, scanned_at
    ) VALUES (?, ?, ?, 'notes/hold.txt', 'txt', 'text/plain', 8, ?, 'other', 'held', ?, 'Heuristics.Limits', 1, ?, ?, ?)`,
    [FILE_TWO, BATCH_TWO, WORKSPACE, `${WORKSPACE}/${BATCH_TWO}/${FILE_TWO}`, "cd".repeat(32), createdAt, createdAt, createdAt],
  );
}

function throwingStore(): ObjectStore {
  return {
    stat: async () => null,
    read: async () => null,
    remove: async () => {
      throw new Error("disk");
    },
    put: async () => undefined,
    beginUpload: async () => "00000000-0000-4000-8000-000000000000",
    readUpload: async () => null,
    writePart: async () => undefined,
    finishUpload: async () => undefined,
  };
}

describe("workspace retention", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_SIGNING_SECRET;
    delete process.env.HANDOFF_FROM_EMAIL;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-retention-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_SIGNING_SECRET = "test-signing-secret";
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  async function caller(sql: Sql, token: string) {
    return getCaller(sql, token, Date.now());
  }

  it("archives a workspace, keeps downloads, and refuses new work", async () => {
    const sql = await db();
    await seed(sql);
    const now = Date.now();
    const archived = await archiveWorkspace({
      sql,
      caller: await caller(sql, "operator-token"),
      workspaceId: WORKSPACE,
      now,
    });
    expect(archived).toEqual({ ok: true, purgeAfter: now + LIMITS.defaultRetentionDays * DAY_MS });
    const row = await sql.get<{ status: string; archived_at: number; purge_after: number }>(
      "SELECT status, archived_at, purge_after FROM workspaces WHERE id = ?",
      [WORKSPACE],
    );
    expect(row).toEqual({
      status: "archived",
      archived_at: now,
      purge_after: now + LIMITS.defaultRetentionDays * DAY_MS,
    });
    const again = await archiveWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      workspaceId: WORKSPACE,
      now: now + 1,
    });
    expect(again).toEqual({ ok: false, status: 409, message: "That workspace is no longer active." });
    const audits = await sql.all<{ action: string; metadata: string }>(
      "SELECT action, metadata FROM audit_events WHERE action = 'workspace.archived'",
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).not.toContain("https://");
    expect(audits[0]?.metadata).not.toContain("sig=");

    const batch = await createBatch({
      sql,
      caller: await caller(sql, "owner-token"),
      slug: "northwind",
      now,
      body: { files: [{ relativePath: "note.txt", sizeBytes: 1, contentType: "text/plain" }] },
    });
    expect(batch).toMatchObject({ ok: false, status: 409, message: "That workspace is no longer active." });
    const invite = await createInvite({
      sql,
      caller: await caller(sql, "operator-token"),
      workspaceId: WORKSPACE,
      email: "new@example.com",
      role: "client_member",
      now,
      origin: ORIGIN,
      from: "handoff@example.com",
      allowlist: [],
      send: async () => undefined,
    });
    expect(invite).toEqual({ ok: false, message: "You cannot do that." });
    const request = await createRequest({
      sql,
      caller: await caller(sql, "operator-token"),
      workspaceId: WORKSPACE,
      title: "Extra",
      guidance: null,
      suggestedTag: null,
      dueOn: null,
    });
    expect(request).toEqual({ ok: false, message: "That workspace is no longer active." });
    const download = await issueDownload({
      sql,
      caller: await caller(sql, "owner-token"),
      batchId: BATCH,
      fileId: FILE,
      origin: ORIGIN,
      now,
    });
    expect(download.ok).toBe(true);

    const mail = await sql.all<{ event: string; recipient_email: string; payload: string }>(
      "SELECT event, recipient_email, payload FROM notifications ORDER BY recipient_email",
    );
    expect(mail.map((row) => row.event)).toEqual(["workspace.archived", "workspace.archived"]);
    expect(mail.map((row) => row.recipient_email)).toEqual(["operator@example.com", "owner@example.com"]);
    const purgeOn = new Date(now + LIMITS.defaultRetentionDays * DAY_MS).toISOString().slice(0, 10);
    const payload = JSON.parse(mail[0]?.payload ?? "{}") as { purgeOn?: string };
    expect(payload.purgeOn).toBe(purgeOn);
    const rendered = renderProductEmail({
      from: "handoff@example.com",
      to: "owner@example.com",
      event: "workspace.archived",
      payload: { displayName: "Northwind Co", slug: "northwind", purgeOn },
      origin: ORIGIN,
    });
    expect(rendered.text).toContain(purgeOn);
    expect(await queuePurgeReminders(sql, now)).toBe(0);
  });

  it("queues the purge reminder only inside the seven-day window", async () => {
    const sql = await db();
    await seed(sql);
    const now = Date.now();
    const archived = await archiveWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      workspaceId: WORKSPACE,
      now,
    });
    if (!archived.ok) throw new Error(archived.message);
    const early = archived.purgeAfter - LIMITS.purgeReminderLeadMs - 1;
    expect(await queuePurgeReminders(sql, early)).toBe(0);
    const edge = archived.purgeAfter - LIMITS.purgeReminderLeadMs;
    expect(await queuePurgeReminders(sql, edge)).toBe(2);
    expect(await queuePurgeReminders(sql, edge)).toBe(0);
    const reminders = await sql.all<{ event: string; payload: string }>(
      "SELECT event, payload FROM notifications WHERE event = 'workspace.purge_scheduled'",
    );
    expect(reminders).toHaveLength(2);
    const purgeOn = new Date(archived.purgeAfter).toISOString().slice(0, 10);
    expect(JSON.parse(reminders[0]?.payload ?? "{}")).toMatchObject({ purgeOn });
    const rendered = renderProductEmail({
      from: "handoff@example.com",
      to: "owner@example.com",
      event: "workspace.purge_scheduled",
      payload: { displayName: "Northwind Co", slug: "northwind", purgeOn },
      origin: ORIGIN,
    });
    expect(rendered.subject).toContain("will be purged");
    expect(rendered.text).toContain(purgeOn);
  });

  it("exports every batch with a 24-hour link and no URL in the audit", async () => {
    const sql = await db();
    await seed(sql);
    const now = Date.now();
    const outsider = await exportWorkspace({
      sql,
      caller: await caller(sql, "out-token"),
      workspaceId: WORKSPACE,
      origin: ORIGIN,
      now,
    });
    const operator = await exportWorkspace({
      sql,
      caller: await caller(sql, "operator-token"),
      workspaceId: WORKSPACE,
      origin: ORIGIN,
      now,
    });
    expect(outsider).toEqual({ ok: false, status: 404, message: "Not found." });
    expect(operator).toEqual({ ok: false, status: 403, message: "You cannot do that." });
    delete process.env.HANDOFF_SIGNING_SECRET;
    const missing = await exportWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      workspaceId: WORKSPACE,
      origin: ORIGIN,
      now,
    });
    expect(missing).toEqual({ ok: false, status: 503, message: "File links are not configured." });
    process.env.HANDOFF_SIGNING_SECRET = "test-signing-secret";
    const result = await exportWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      workspaceId: WORKSPACE,
      origin: ORIGIN,
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.slug).toBe("northwind");
    expect(result.document.batches.map((batch) => batch.batchId)).toEqual([BATCH, BATCH_TWO]);
    const clean = result.document.batches[0]?.files[0];
    const held = result.document.batches[1]?.files[0];
    expect(clean?.url).toContain(`/api/files/${FILE}/content`);
    const exp = Number(new URL(clean?.url ?? ORIGIN).searchParams.get("exp"));
    expect(exp).toBe(Math.floor(now / 1000) + LIMITS.workspaceExportTtlSeconds);
    expect(held?.url).toBeUndefined();
    const audit = await sql.get<{ metadata: string; action: string }>(
      "SELECT action, metadata FROM audit_events WHERE action = 'workspace.exported'",
    );
    expect(audit?.action).toBe("workspace.exported");
    expect(audit?.metadata).not.toContain("sig=");
    expect(audit?.metadata).not.toContain("http");
    expect(audit?.metadata).toContain("2");
  });

  it("purges a due workspace, deletes objects, and keeps the audit", async () => {
    const sql = await db();
    await seed(sql);
    const now = Date.now();
    const store = localObjectStore(path.join(directory, "objects"));
    await store.put(`${WORKSPACE}/${BATCH}/${FILE}`, new Uint8Array([1, 2, 3, 4]));
    await store.put(`${WORKSPACE}/${BATCH_TWO}/${FILE_TWO}`, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    const active = await purgeWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      store,
      workspaceId: WORKSPACE,
      reason: "too soon",
      now,
    });
    expect(active).toEqual({ ok: false, status: 409, message: "That workspace is still active." });
    const archived = await archiveWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      workspaceId: WORKSPACE,
      now,
    });
    if (!archived.ok) throw new Error(archived.message);
    expect(await purgeDueWorkspaces(sql, store, archived.purgeAfter - 1)).toBe(0);
    expect(await purgeDueWorkspaces(sql, store, archived.purgeAfter)).toBe(1);
    expect(await store.stat(`${WORKSPACE}/${BATCH}/${FILE}`)).toBeNull();
    expect(await store.stat(`${WORKSPACE}/${BATCH_TWO}/${FILE_TWO}`)).toBeNull();
    expect(await sql.get("SELECT id FROM files")).toBeUndefined();
    expect(await sql.get("SELECT id FROM batches")).toBeUndefined();
    expect(await sql.get("SELECT id FROM requests")).toBeUndefined();
    expect(await sql.get("SELECT id FROM invites")).toBeUndefined();
    expect(await sql.get("SELECT id FROM memberships")).toBeUndefined();
    const operators = await sql.get<{ n: number }>("SELECT count(*) AS n FROM workspace_operators");
    expect(operators?.n).toBe(1);
    const workspace = await sql.get<{ status: string; purged_at: number }>(
      "SELECT status, purged_at FROM workspaces WHERE id = ?",
      [WORKSPACE],
    );
    expect(workspace).toEqual({ status: "purged", purged_at: archived.purgeAfter });
    const purged = await sql.get<{ actor_user_id: string | null; metadata: string }>(
      "SELECT actor_user_id, metadata FROM audit_events WHERE action = 'workspace.purged'",
    );
    expect(purged?.actor_user_id).toBeNull();
    const metadata = JSON.parse(purged?.metadata ?? "{}") as { fileCount: number; bytes: number };
    expect(metadata.fileCount).toBe(2);
    expect(metadata.bytes).toBe(12);
    const survived = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM audit_events WHERE action = 'workspace.archived'",
    );
    expect(survived?.n).toBe(1);
    const repeat = await purgeWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      store,
      workspaceId: WORKSPACE,
      reason: "again",
      now: archived.purgeAfter,
    });
    expect(repeat).toEqual({ ok: false, status: 409, message: "That workspace is already purged." });
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM audit_events WHERE action = 'workspace.purged'");
    expect(count?.n).toBe(1);
  });

  it("requires a super-admin and a reason to purge early, and leaves rows when delete fails", async () => {
    const sql = await db();
    await seed(sql);
    const now = Date.now();
    const store = localObjectStore(path.join(directory, "objects"));
    const archived = await archiveWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      workspaceId: WORKSPACE,
      now,
    });
    if (!archived.ok) throw new Error(archived.message);
    const operator = await purgeWorkspace({
      sql,
      caller: await caller(sql, "operator-token"),
      store,
      workspaceId: WORKSPACE,
      reason: "Engagement ended.",
      now,
    });
    const outsider = await purgeWorkspace({
      sql,
      caller: await caller(sql, "out-token"),
      store,
      workspaceId: WORKSPACE,
      reason: "Engagement ended.",
      now,
    });
    const blank = await purgeWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      store,
      workspaceId: WORKSPACE,
      reason: "  ",
      now,
    });
    expect(operator).toEqual({ ok: false, status: 403, message: "You cannot do that." });
    expect(outsider).toEqual({ ok: false, status: 404, message: "Not found." });
    expect(blank).toEqual({ ok: false, status: 422, message: "A reason is required." });
    const failed = await purgeDueWorkspaces(sql, throwingStore(), archived.purgeAfter);
    expect(failed).toBe(0);
    const still = await sql.get<{ status: string }>("SELECT status FROM workspaces WHERE id = ?", [WORKSPACE]);
    expect(still?.status).toBe("archived");
    expect(await sql.get<{ id: string }>("SELECT id FROM files WHERE id = ?", [FILE])).toEqual({ id: FILE });
    const early = await purgeWorkspace({
      sql,
      caller: await caller(sql, "admin-token"),
      store,
      workspaceId: WORKSPACE,
      reason: "  Engagement ended.  ",
      now,
    });
    expect(early).toEqual({ ok: true });
    const audit = await sql.get<{ metadata: string; actor_user_id: string }>(
      "SELECT metadata, actor_user_id FROM audit_events WHERE action = 'workspace.purged'",
    );
    expect(audit?.actor_user_id).toBe("user-admin");
    expect(audit?.metadata).toContain("Engagement ended.");
    expect(audit?.metadata).not.toContain("sig=");
  });

  it("archives, exports, and purges through the workspace routes", async () => {
    const sql = await db();
    await seed(sql);
    const cookie = "handoff_session=admin-token";
    const archived = await archiveRoute(
      new Request(`${ORIGIN}/api/workspaces/northwind/archive`, { method: "POST", headers: { cookie } }),
      { params: Promise.resolve({ slug: "northwind" }) },
    );
    expect(archived.status).toBe(200);
    const body = (await archived.json()) as { purgeAfter: number };
    expect(body.purgeAfter).toBeGreaterThan(Date.now());
    const exported = await exportRoute(
      new Request(`${ORIGIN}/api/workspaces/northwind/export`, { headers: { cookie } }),
      { params: Promise.resolve({ slug: "northwind" }) },
    );
    expect(exported.status).toBe(200);
    const document = (await exported.json()) as { batches: Array<{ batchId: string }> };
    expect(document.batches).toHaveLength(2);
    const purged = await purgeRoute(
      new Request(`${ORIGIN}/api/workspaces/northwind/purge`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ reason: "Engagement ended." }),
      }),
      { params: Promise.resolve({ slug: "northwind" }) },
    );
    expect(purged.status).toBe(200);
    const status = await sql.get<{ status: string }>("SELECT status FROM workspaces WHERE slug = 'northwind'");
    expect(status?.status).toBe("purged");
  });
});
