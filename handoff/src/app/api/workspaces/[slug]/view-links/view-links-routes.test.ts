import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { openObjectStore } from "@/lib/store/objects";
import { DELETE, PATCH } from "./[shareId]/route";
import { GET as downloadViewFile } from "../../../../view/[token]/files/[shareItemPublicId]/route";
import { POST as unlockView } from "../../../../view/[token]/unlock/route";
import { GET, POST } from "./route";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FILE_ID = "33333333-3333-4333-8333-333333333333";
const BATCH_ID = "44444444-4444-4444-8444-444444444444";
const ORG = "55555555-5555-4555-8555-555555555555";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signIn(sql: Sql, userId: string, email: string, token: string): Promise<void> {
  const now = Date.now();
  await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [userId, email, now]);
  await sql.run(
    "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)",
    [crypto.randomUUID(), userId, await sha256Hex(token), now, now + LIMITS.sessionTtlMs],
  );
}

async function seed(sql: Sql): Promise<void> {
  const now = Date.now();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, 'Acme', 'acme.example', 'client', ?, ?)", [ORG, now, now]);
  for (const [id, slug] of [[WORKSPACE, "acme"], [OTHER, "other"]] as const) {
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id
       ) VALUES (?, ?, ?, ?, 'Studio', 'standard', 1000, 30, 0, 'active', ?, ?)`,
      [id, slug, slug, slug, now, ORG],
    );
  }
  await signIn(sql, "user-owner", "owner@example.com", "owner-token");
  await signIn(sql, "user-member", "member@example.com", "member-token");
  await signIn(sql, "user-out", "out@example.com", "out-token");
  await sql.run(
    "INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at) VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)",
    [WORKSPACE, now],
  );
  await sql.run(
    "INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at) VALUES ('mem-member', ?, 'user-member', 'member@example.com', 'client_member', ?, NULL)",
    [WORKSPACE, now],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at
     ) VALUES ('d-1', ?, ?, 'Article', 'document', 'approved', 1, 1, 'staff', ?, ?)`,
    [ORG, WORKSPACE, now, now],
  );
  await sql.run(
    "INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, link_url, status, sort) VALUES ('item-1', 'd-1', 1, 'link', 'Q4 article', '[]', 'https://news.example/q4', 'approved', 0)",
  );
  await sql.run(
    `INSERT INTO batches (
       id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
     ) VALUES (?, ?, NULL, 'user-owner', NULL, NULL, ?, ?, NULL, NULL)`,
    [BATCH_ID, WORKSPACE, now, now],
  );
  const objectKey = `${WORKSPACE}/${BATCH_ID}/${FILE_ID}`;
  await sql.run(
    `INSERT INTO files (
       id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at
     ) VALUES (?, ?, ?, 'brand/brief.pdf', 'pdf', 4, ?, 'brand', 'clean', 0, ?)`,
    [FILE_ID, BATCH_ID, WORKSPACE, objectKey, now],
  );
  await openObjectStore().put(objectKey, new TextEncoder().encode("file"));
}

function call(method: "GET" | "POST" | "PATCH" | "DELETE", token: string, workspaceId = WORKSPACE, body?: unknown, shareId = "share"): Promise<Response> {
  const request = new Request(`https://handoff.example/api/workspaces/${workspaceId}/view-links`, {
    method,
    headers: { cookie: `handoff_session=${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (method === "DELETE") return DELETE(request, { params: Promise.resolve({ slug: workspaceId, shareId }) });
  if (method === "PATCH") return PATCH(request, { params: Promise.resolve({ slug: workspaceId, shareId }) });
  if (method === "POST") return POST(request, { params: Promise.resolve({ slug: workspaceId }) });
  return GET(request, { params: Promise.resolve({ slug: workspaceId }) });
}

describe("view link routes", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_OBJECT_PATH;
    delete process.env.LIBRARY_VIEW_LINKS;
    delete process.env.HANDOFF_SHARE_HASH_PEPPER;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-view-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
    process.env.HANDOFF_SHARE_HASH_PEPPER = "pepper";
    const sql = await openHandoffDb();
    await migrate(sql);
    await seed(sql);
    return sql;
  }

  it("hides creation when the flag is off and refuses a member", async () => {
    const sql = await db();
    const off = await call("POST", "owner-token", WORKSPACE, { items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }] });
    expect(off.status).toBe(404);
    await expect(off.json()).resolves.toEqual({ error: "disabled" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM library_shares"))?.n).toBe(0);
    process.env.LIBRARY_VIEW_LINKS = "on";
    const member = await call("POST", "member-token", WORKSPACE, { items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }] });
    expect(member.status).toBe(403);
    const outsider = await call("POST", "out-token", WORKSPACE, { items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }] });
    expect(outsider.status).toBe(404);
    const foreign = await call("POST", "owner-token", OTHER, { items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }] });
    expect(foreign.status).toBe(404);
  });

  it("returns the view URL once, lists without it, and revokes", async () => {
    const sql = await db();
    process.env.LIBRARY_VIEW_LINKS = "on";
    const missing = await call("POST", "owner-token", WORKSPACE, { items: [{ resourceKind: "deliverable_item", resourceId: "missing-item", resourceVersion: 1 }] });
    expect(missing.status).toBe(404);
    const created = await call("POST", "owner-token", WORKSPACE, {
      title: "Q4",
      allowDownloads: false,
      items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }],
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { url: string; id: string };
    expect(body.url).toContain("/view/");
    const token = body.url.split("/view/")[1] ?? "";
    const listed = await call("GET", "owner-token");
    const list = (await listed.json()) as { shares: { id: string }[] };
    expect(JSON.stringify(list)).not.toContain(token);
    expect(list.shares[0]?.id).toBe(body.id);
    const activity = await sql.get<{ data_json: string }>("SELECT data_json FROM activities WHERE kind = 'library.view_link_created'");
    expect(activity?.data_json ?? "").not.toContain(token);
    expect(activity?.data_json ?? "").not.toContain("https://");
    const revoked = await call("DELETE", "owner-token", WORKSPACE, undefined, body.id);
    expect(revoked.status).toBe(200);
    const events = await sql.all<{ kind: string }>("SELECT kind FROM library_share_events");
    expect(events.map((event) => event.kind)).toContain("revoked");
    expect(events.map((event) => event.kind)).toContain("created");
  });

  it("accepts the public workspace slug as well as the workspace id", async () => {
    await db();
    process.env.LIBRARY_VIEW_LINKS = "on";
    const created = await call("POST", "owner-token", "acme", {
      items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }],
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string };
    const listed = await call("GET", "owner-token", "acme");
    expect(listed.status).toBe(200);
    const revoked = await call("DELETE", "owner-token", "acme", undefined, body.id);
    expect(revoked.status).toBe(200);
  });

  it("locks a passcode, rate limits unlock, and downloads only the shared public file", async () => {
    await db();
    process.env.LIBRARY_VIEW_LINKS = "on";
    const created = await call("POST", "owner-token", WORKSPACE, {
      passcode: "correct-horse",
      allowDownloads: true,
      items: [{ resourceKind: "file", resourceId: FILE_ID, resourceVersion: 0 }],
    });
    const body = (await created.json()) as { url: string };
    const token = decodeURIComponent(body.url.split("/view/")[1] ?? "");
    const wrong = await unlockView(
      new Request(`https://handoff.example/view/${token}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
        body: JSON.stringify({ passcode: "nope" }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(wrong.status).toBe(404);
    expect(wrong.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await unlockView(
        new Request(`https://handoff.example/view/${token}/unlock`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
          body: JSON.stringify({ passcode: "nope" }),
        }),
        { params: Promise.resolve({ token }) },
      );
    }
    const blocked = await unlockView(
      new Request(`https://handoff.example/view/${token}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
        body: JSON.stringify({ passcode: "correct-horse" }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(blocked.status).toBe(429);
    const opened = await unlockView(
      new Request(`https://handoff.example/view/${token}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ passcode: "correct-horse" }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(opened.status).toBe(303);
    const setCookie = opened.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("library_view=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    const cookie = setCookie.split(";")[0] ?? "";
    const publicId = (await (await openHandoffDb()).get<{ public_id: string }>("SELECT public_id FROM library_share_items"))?.public_id ?? "";
    const denied = await downloadViewFile(new Request(`https://handoff.example/view/${token}/files/${FILE_ID}`), {
      params: Promise.resolve({ token, shareItemPublicId: FILE_ID }),
    });
    expect(denied.status).toBe(404);
    const file = await downloadViewFile(new Request(`https://handoff.example/view/${token}/files/${publicId}`, { headers: { cookie } }), {
      params: Promise.resolve({ token, shareItemPublicId: publicId }),
    });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(file.headers.get("x-frame-options")).toBe("DENY");
    expect(await file.text()).toBe("file");
    expect(file.headers.get("content-disposition")).not.toContain(FILE_ID);
  });

  it("refreshes a view link only for an authorized owner", async () => {
    const sql = await db();
    process.env.LIBRARY_VIEW_LINKS = "on";
    const created = await call("POST", "owner-token", WORKSPACE, {
      items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }],
    });
    const body = (await created.json()) as { id: string };
    expect((await call("PATCH", "member-token", WORKSPACE, undefined, body.id)).status).toBe(403);
    expect((await call("PATCH", "owner-token", WORKSPACE, undefined, "missing-share")).status).toBe(404);

    await sql.run("UPDATE deliverables SET version = 2, published_version = 2 WHERE id = 'd-1'");
    await sql.run(
      "INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, link_url, status, sort) VALUES ('item-2', 'd-1', 2, 'link', 'Q4 revised', '[]', 'https://news.example/q4', 'approved', 0)",
    );
    const refreshed = await call("PATCH", "owner-token", WORKSPACE, undefined, body.id);
    expect(refreshed.status).toBe(200);
    await expect(refreshed.json()).resolves.toEqual({ updated: true });
    const activity = await sql.get<{ actor_kind: string }>("SELECT actor_kind FROM activities WHERE kind = 'library.view_link_updated'");
    expect(activity?.actor_kind).toBe("system");
  });
});
