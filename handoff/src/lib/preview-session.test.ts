import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { workspacesFor } from "@/db/records";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
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
  it("opens a super-admin session and a locker without sending mail", async () => {
    const sql = await memoryDb();
    const opened = await openPreviewSession({ sql, now: NOW });

    expect(opened.slug).toBe(PREVIEW_SLUG);
    const caller = await getCaller(sql, opened.sessionToken, NOW);
    expect(caller.staff?.superAdmin).toBe(true);
    const user = await sql.get<{ email: string }>("SELECT email FROM users WHERE id = ?", [
      caller.userId,
    ]);
    expect(user?.email).toBe(PREVIEW_EMAIL);
    const workspaces = await workspacesFor(sql, caller);
    expect(workspaces.map((row) => row.display_name)).toEqual(["Northwind Studio"]);
    const requests = await sql.all<{ title: string; status: string }>(
      "SELECT title, status FROM requests ORDER BY position",
    );
    expect(requests).toEqual([
      { title: "Logo", status: "open" },
      { title: "Wordmark", status: "open" },
    ]);
    const links = await sql.get<{ n: number }>("SELECT count(*) AS n FROM magic_links");
    expect(links?.n).toBe(0);
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
    expect(requests?.n).toBe(2);
    expect(sessions?.n).toBe(2);
  });
});
