import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { GET } from "./route";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
let directory = "";

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
  delete process.env.HANDOFF_SQLITE_PATH;
  delete process.env.HQ_CHAT_SECRET;
  delete process.env.AGENT_URL;
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = "";
});

describe("GET /api/hq-chat/token", () => {
  it("refuses a caller with no session", async () => {
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    const response = await GET(new Request("https://hq.example/api/hq-chat/token"));
    expect(response.status).toBe(401);
  });

  it("refuses to sign when the chat secret is missing and signs when it is set", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "hq-chat-"));
    const file = path.join(directory, "handoff.db");
    const db = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys = ON");
    const sql = sqliteSql(db);
    await migrate(sql);
    const raw = "session-token";
    const hash = createHash("sha256").update(raw).digest("hex");
    const now = Date.now();
    await sql.run("INSERT INTO users (id, email, created_at) VALUES ('staff-1', 'staff@example.com', ?)", [now]);
    await sql.run(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES ('sess-1', 'staff-1', ?, ?, ?, NULL)`,
      [hash, now, now + 86_400_000],
    );
    await sql.run(
      `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
       VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
      [now],
    );
    db.close();
    process.env.HANDOFF_SQLITE_PATH = file;
    process.env.AGENT_URL = "https://agent.example";
    const request = new Request("https://hq.example/api/hq-chat/token", {
      headers: { cookie: "handoff_session=session-token" },
    });
    const missing = await GET(request);
    expect(missing.status).toBe(503);
    process.env.HQ_CHAT_SECRET = "chat-secret";
    const signed = await GET(request);
    expect(signed.status).toBe(200);
    const body = (await signed.json()) as { userId: string; agent: string; host: string; token: string };
    expect(body.userId).toBe("staff-1");
    expect(body.agent).toBe("hq-chat");
    expect(body.host).toBe("agent.example");
    expect(body.token.split(".")).toHaveLength(2);
  });
});
