import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { can } from "./authz";
import { signInWithPassword, ADMIN_USERNAME } from "./password-login";
import { PREVIEW_EMAIL } from "./preview-session";
import { getCaller } from "./session";

const NOW = 1_700_000_000_000;
const PASSWORD = "correct-horse-battery";

async function memoryDb(): Promise<Sql> {
  process.env.HANDOFF_SQLITE_PATH = ":memory:";
  const sql = await openHandoffDb();
  await migrate(sql);
  return sql;
}

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
  delete process.env.HANDOFF_ADMIN_PASSWORD;
});

describe("signInWithPassword", () => {
  it("opens the admin session when the username and password match", async () => {
    const sql = await memoryDb();
    const opened = await signInWithPassword({
      sql,
      username: "  Admin  ",
      password: PASSWORD,
      now: NOW,
      expectedPassword: PASSWORD,
    });

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const caller = await getCaller(sql, opened.sessionToken, NOW);
    expect(caller.staff).toEqual({ superAdmin: true });
    expect(can(caller, "workspace.create")).toBe(true);
    const user = await sql.get<{ email: string }>("SELECT email FROM users WHERE id = ?", [
      caller.userId,
    ]);
    expect(user?.email).toBe(PREVIEW_EMAIL);
    expect(opened.slug).toBe("strongfoam");
  });

  it("does not open a session for a wrong password", async () => {
    const sql = await memoryDb();
    const opened = await signInWithPassword({
      sql,
      username: ADMIN_USERNAME,
      password: "wrong-password",
      now: NOW,
      expectedPassword: PASSWORD,
    });

    expect(opened).toEqual({ ok: false, reason: "wrong" });
    const sessions = await sql.get<{ n: number }>("SELECT count(*) AS n FROM sessions");
    expect(sessions?.n).toBe(0);
  });

  it("does not open a session when the password is not configured", async () => {
    const sql = await memoryDb();
    const opened = await signInWithPassword({
      sql,
      username: ADMIN_USERNAME,
      password: PASSWORD,
      now: NOW,
      expectedPassword: null,
    });

    expect(opened).toEqual({ ok: false, reason: "unconfigured" });
    const sessions = await sql.get<{ n: number }>("SELECT count(*) AS n FROM sessions");
    expect(sessions?.n).toBe(0);
  });

  it("reads the password from the environment when one is not passed in", async () => {
    process.env.HANDOFF_ADMIN_PASSWORD = PASSWORD;
    const sql = await memoryDb();
    const opened = await signInWithPassword({
      sql,
      username: ADMIN_USERNAME,
      password: PASSWORD,
      now: NOW,
    });

    expect(opened.ok).toBe(true);
  });
});
