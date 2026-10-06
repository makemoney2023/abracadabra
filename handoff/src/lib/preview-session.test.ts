import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { workspacesFor } from "@/db/records";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { can } from "./authz";
import { getCaller } from "./session";
import { openPreviewSession, PREVIEW_EMAIL, PREVIEW_SLUG } from "./preview-session";

const NOW = 1_700_000_000_000;

async function memoryDb(): Promise<Sql> {
  process.env.HANDOFF_SQLITE_PATH = ":memory:";
  const sql = await openHandoffDb();
  await migrate(sql);
  return sql;
}

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
});

describe("openPreviewSession", () => {
  it("opens a folder member who can upload, without sending mail", async () => {
    const sql = await memoryDb();
    const opened = await openPreviewSession({ sql, now: NOW });

    expect(opened.slug).toBe(PREVIEW_SLUG);
    const caller = await getCaller(sql, opened.sessionToken, NOW);
    expect(caller.staff).toBeNull();
    const user = await sql.get<{ email: string }>("SELECT email FROM users WHERE id = ?", [
      caller.userId,
    ]);
    expect(user?.email).toBe(PREVIEW_EMAIL);
    const workspaces = await workspacesFor(sql, caller);
    expect(workspaces.map((row) => row.display_name)).toEqual(["Northwind Studio"]);
    const workspaceId = workspaces[0]?.id ?? "";
    expect(caller.memberships).toEqual([{ workspaceId, role: "client_owner" }]);
    expect(can(caller, "batch.create", { workspaceId })).toBe(true);
    const requests = await sql.all<{ title: string; status: string }>(
      "SELECT title, status FROM requests WHERE status = 'open' ORDER BY position",
    );
    expect(requests).toEqual([{ title: "Files", status: "open" }]);
    const links = await sql.get<{ n: number }>("SELECT count(*) AS n FROM magic_links");
    expect(links?.n).toBe(0);
  });

  it("turns an older staff preview into a folder member with one open ask", async () => {
    const sql = await memoryDb();
    const userId = "user-preview";
    const workspaceId = "ws-preview";
    await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
      userId,
      PREVIEW_EMAIL,
      NOW,
    ]);
    await sql.run(
      `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
       VALUES (?, ?, 1, ?, NULL)`,
      [userId, PREVIEW_EMAIL, NOW],
    );
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
         quota_bytes, retention_days, request_digest, status, opened_at
       ) VALUES (?, ?, 'Northwind', 'Northwind Studio', NULL, 'Abracadabra', 'standard', 1, 30, 0, 'active', ?)`,
      [workspaceId, PREVIEW_SLUG, NOW],
    );
    await sql.run(
      `INSERT INTO requests (
         id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
       ) VALUES ('req-logo', ?, 1, 'Logo', NULL, NULL, NULL, 'open', NULL, NULL)`,
      [workspaceId],
    );
    await sql.run(
      `INSERT INTO requests (
         id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
       ) VALUES ('req-word', ?, 2, 'Wordmark', NULL, NULL, NULL, 'open', NULL, NULL)`,
      [workspaceId],
    );

    const opened = await openPreviewSession({ sql, now: NOW + 5 });
    const caller = await getCaller(sql, opened.sessionToken, NOW + 5);
    expect(caller.staff).toBeNull();
    expect(caller.memberships).toEqual([{ workspaceId, role: "client_owner" }]);
    const open = await sql.all<{ id: string }>(
      "SELECT id FROM requests WHERE workspace_id = ? AND status = 'open' ORDER BY position",
      [workspaceId],
    );
    expect(open.map((row) => row.id)).toEqual(["req-logo"]);
  });

  it("reuses the same locker on a second open", async () => {
    const sql = await memoryDb();
    const first = await openPreviewSession({ sql, now: NOW });
    const second = await openPreviewSession({ sql, now: NOW + 1 });

    expect(second.slug).toBe(first.slug);
    expect(second.sessionToken).not.toBe(first.sessionToken);
    const users = await sql.get<{ n: number }>("SELECT count(*) AS n FROM users");
    const workspaces = await sql.get<{ n: number }>("SELECT count(*) AS n FROM workspaces");
    const requests = await sql.get<{ n: number }>("SELECT count(*) AS n FROM requests");
    const sessions = await sql.get<{ n: number }>("SELECT count(*) AS n FROM sessions");
    expect(users?.n).toBe(1);
    expect(workspaces?.n).toBe(1);
    expect(requests?.n).toBe(1);
    expect(sessions?.n).toBe(2);
  });
});
