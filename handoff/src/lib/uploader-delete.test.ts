import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { deleteUploadedFile, deleteUploadedFolder, issueDownload, listFolderFiles } from "@/lib/downloads";
import { openObjectStore } from "@/lib/store/objects";
import { claimUploadedFile } from "@/worker/jobs/scan";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const OTHER_BATCH = "44444444-4444-4444-8444-444444444444";
const FILE = "33333333-3333-4333-8333-333333333333";
const NESTED = "55555555-5555-4555-8555-555555555555";
const ROOT = "66666666-6666-4666-8666-666666666666";
const THEIRS = "77777777-7777-4777-8777-777777777777";
const NOW = 1_700_000_000_000;

const uploader: Caller = {
  userId: "user-member",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_member" }],
};

const otherMember: Caller = {
  userId: "user-other",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_member" }],
};

let directory = "";

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
  delete process.env.HANDOFF_OBJECT_PATH;
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = "";
});

async function memoryDb(): Promise<Sql> {
  directory = mkdtempSync(path.join(tmpdir(), "handoff-delete-"));
  process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
  process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
  const sql = await openHandoffDb();
  await migrate(sql);
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
    ) VALUES (?, 'strongfoam', 'Strongfoam', 'Strongfoam', NULL, 'Abracadabra', 'standard', 1000, 30, 0, 'active', ?, NULL, NULL)`,
    [WORKSPACE, NOW],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-member', 'member@example.com', ?)", [NOW]);
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-other', 'other@example.com', ?)", [NOW]);
  for (const [id, user, email] of [
    ["mem-1", "user-member", "member@example.com"],
    ["mem-2", "user-other", "other@example.com"],
  ] as const) {
    await sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES (?, ?, ?, ?, 'client_member', ?, NULL)`,
      [id, WORKSPACE, user, email, NOW],
    );
  }
  for (const [id, createdBy] of [
    [BATCH, "user-member"],
    [OTHER_BATCH, "user-other"],
  ] as const) {
    await sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?, NULL, NULL)`,
      [id, WORKSPACE, createdBy, NOW, NOW],
    );
  }
  return sql;
}

async function addFile(
  sql: Sql,
  id: string,
  batchId: string,
  relativePath: string,
  status: string,
): Promise<void> {
  const key = `${WORKSPACE}/${batchId}/${id}`;
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at
    ) VALUES (?, ?, ?, ?, 'txt', 4, ?, 'other', ?, 0, ?)`,
    [id, batchId, WORKSPACE, relativePath, key, status, NOW],
  );
  await openObjectStore().put(key, new TextEncoder().encode("file"));
}

describe("uploader delete", () => {
  it("lets the person who uploaded a file remove it, even when it is still checking", async () => {
    const sql = await memoryDb();
    await addFile(sql, FILE, BATCH, "notes.txt", "uploaded");
    const removed = await deleteUploadedFile({ sql, caller: uploader, batchId: BATCH, fileId: FILE, now: NOW });
    expect(removed).toEqual({ ok: true });
    expect(await listFolderFiles(sql, uploader, WORKSPACE)).toEqual([]);
    expect(await openObjectStore().read(`${WORKSPACE}/${BATCH}/${FILE}`)).toBeNull();
    const row = await sql.get<{ status: string; object_deleted_at: number; scan_reason: string }>(
      "SELECT status, object_deleted_at, scan_reason FROM files WHERE id = ?",
      [FILE],
    );
    expect(row?.object_deleted_at).toBe(NOW);
    expect(row?.status).toBe("failed");
    expect(await claimUploadedFile(sql, NOW)).toBeNull();
    const again = await deleteUploadedFile({ sql, caller: uploader, batchId: BATCH, fileId: FILE, now: NOW + 1 });
    expect(again).toEqual({ ok: true });
  });

  it("lets the uploader remove a ready file and then blocks download", async () => {
    const sql = await memoryDb();
    await addFile(sql, FILE, BATCH, "logo.png", "clean");
    const removed = await deleteUploadedFile({ sql, caller: uploader, batchId: BATCH, fileId: FILE, now: NOW });
    expect(removed).toEqual({ ok: true });
    const download = await issueDownload({
      sql,
      caller: uploader,
      batchId: BATCH,
      fileId: FILE,
      origin: "https://handoff.example",
      now: NOW,
    });
    expect(download).toMatchObject({ ok: false, status: 404 });
    expect(await listFolderFiles(sql, uploader, WORKSPACE)).toEqual([]);
  });

  it("refuses a delete from someone else in the same folder", async () => {
    const sql = await memoryDb();
    await addFile(sql, FILE, BATCH, "notes.txt", "uploaded");
    const removed = await deleteUploadedFile({
      sql,
      caller: otherMember,
      batchId: BATCH,
      fileId: FILE,
      now: NOW,
    });
    expect(removed).toEqual({ ok: false, status: 404, message: "We couldn't find that." });
    expect(await listFolderFiles(sql, uploader, WORKSPACE)).toHaveLength(1);
  });

  it("deletes a folder the person uploaded and leaves other files", async () => {
    const sql = await memoryDb();
    await addFile(sql, FILE, BATCH, "photos/a.txt", "uploaded");
    await addFile(sql, NESTED, BATCH, "photos/trip/b.txt", "clean");
    await addFile(sql, ROOT, BATCH, "notes.txt", "uploaded");
    await addFile(sql, THEIRS, OTHER_BATCH, "photos/c.txt", "uploaded");
    const removed = await deleteUploadedFolder({
      sql,
      caller: uploader,
      workspaceId: WORKSPACE,
      folderName: "photos",
      now: NOW,
    });
    expect(removed).toEqual({ ok: true, removed: 2 });
    const left = await listFolderFiles(sql, uploader, WORKSPACE);
    expect(left.map((file) => file.name).sort()).toEqual(["notes.txt", "photos/c.txt"]);
  });

  it("rejects a folder name that is not one plain folder", async () => {
    const sql = await memoryDb();
    await addFile(sql, FILE, BATCH, "photos/a.txt", "uploaded");
    const removed = await deleteUploadedFolder({
      sql,
      caller: uploader,
      workspaceId: WORKSPACE,
      folderName: "photos/trip",
      now: NOW,
    });
    expect(removed.ok).toBe(false);
    if (!removed.ok) expect(removed.status).toBe(422);
    expect(await listFolderFiles(sql, uploader, WORKSPACE)).toHaveLength(1);
  });
});
