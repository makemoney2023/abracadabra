import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { can } from "./authz";
import { openPreviewSession } from "./preview-session";
import { getCaller } from "./session";
import { ensureUploadShare, openUploadShare, sharePageUrl } from "./share-link";

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

describe("upload share link", () => {
  it("keeps one link for the space and lets a visitor upload without becoming the owner", async () => {
    const sql = await memoryDb();
    const owner = await openPreviewSession({ sql, now: NOW });
    const workspace = await sql.get<{ id: string }>("SELECT id FROM workspaces");
    const workspaceId = workspace?.id ?? "";
    const first = await ensureUploadShare(sql, workspaceId, NOW);
    const second = await ensureUploadShare(sql, workspaceId, NOW + 1);
    expect(second).toBe(first);
    expect(sharePageUrl(first, { origin: "https://handoff.example/" })).toBe(
      `https://handoff.example/share/${first}`,
    );
    expect(sharePageUrl(first, { host: "localhost:3000", proto: "http" })).toBe(
      `http://localhost:3000/share/${first}`,
    );

    const opened = await openUploadShare(sql, first, NOW + 2);
    expect(opened?.slug).toBe("strongfoam");
    expect(opened?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(opened?.userId).not.toBe(owner.userId);
    const caller = await getCaller(sql, opened?.sessionToken ?? "", NOW + 2);
    expect(caller.staff).toBeNull();
    expect(caller.memberships).toEqual([{ workspaceId, role: "client_member" }]);
    expect(can(caller, "batch.create", { workspaceId })).toBe(true);
    expect(can(caller, "invite.member", { workspaceId })).toBe(false);
    const links = await sql.get<{ n: number }>("SELECT count(*) AS n FROM magic_links");
    expect(links?.n).toBe(0);
  });

  it("reuses the same guest and refuses a bad or closed link", async () => {
    const sql = await memoryDb();
    await openPreviewSession({ sql, now: NOW });
    const workspace = await sql.get<{ id: string }>("SELECT id FROM workspaces");
    const token = await ensureUploadShare(sql, workspace?.id ?? "", NOW);
    const first = await openUploadShare(sql, token, NOW + 1);
    const second = await openUploadShare(sql, token, NOW + 2);
    expect(second?.userId).toBe(first?.userId);
    expect(second?.sessionToken).not.toBe(first?.sessionToken);
    const users = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM users WHERE email LIKE 'share+%@handoff.local'",
    );
    const members = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM memberships WHERE role = 'client_member' AND revoked_at IS NULL",
    );
    expect(users?.n).toBe(1);
    expect(members?.n).toBe(1);
    expect(await openUploadShare(sql, "nope", NOW + 3)).toBeNull();
    await sql.run("UPDATE workspaces SET status = 'archived' WHERE id = ?", [workspace?.id ?? ""]);
    expect(await openUploadShare(sql, token, NOW + 4)).toBeNull();
  });
});
