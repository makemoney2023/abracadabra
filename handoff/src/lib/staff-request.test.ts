import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { signHqChatToken } from "./hq-chat-token";
import { staffFromRequest } from "./staff-request";

const NOW = 1_700_000_000_000;
const SECRET = "test-hq-chat-secret";

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('staff-1', 'staff@example.com', ?)", [NOW]);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
  return sql;
}

afterEach(() => {
  delete process.env.HQ_CHAT_SECRET;
});

describe("staffFromRequest", () => {
  it("rejects a missing, expired, or tampered token", async () => {
    const sql = await database();
    process.env.HQ_CHAT_SECRET = SECRET;
    const missing = await staffFromRequest(sql, new Request("https://hq.example/api/hq-tools"), NOW);
    expect(missing).toEqual({ ok: false, status: 401 });
    const expired = signHqChatToken("staff-1", SECRET, NOW - 11 * 60 * 1000);
    const stale = await staffFromRequest(
      sql,
      new Request("https://hq.example/api/hq-tools", { headers: { authorization: `Bearer ${expired}` } }),
      NOW,
    );
    expect(stale).toEqual({ ok: false, status: 401 });
    const token = signHqChatToken("staff-1", SECRET, NOW);
    const tampered = await staffFromRequest(
      sql,
      new Request("https://hq.example/api/hq-tools", { headers: { authorization: `Bearer ${token}x` } }),
      NOW,
    );
    expect(tampered).toEqual({ ok: false, status: 401 });
  });

  it("accepts a live staff token and refuses a revoked staff row", async () => {
    const sql = await database();
    process.env.HQ_CHAT_SECRET = SECRET;
    const token = signHqChatToken("staff-1", SECRET, NOW);
    const live = await staffFromRequest(
      sql,
      new Request("https://hq.example/api/hq-tools", { headers: { authorization: `Bearer ${token}` } }),
      NOW,
    );
    expect(live.ok).toBe(true);
    await sql.run("UPDATE staff SET revoked_at = ? WHERE user_id = 'staff-1'", [NOW]);
    const revoked = await staffFromRequest(
      sql,
      new Request("https://hq.example/api/hq-tools", { headers: { authorization: `Bearer ${token}` } }),
      NOW,
    );
    expect(revoked).toEqual({ ok: false, status: 403 });
  });
});
