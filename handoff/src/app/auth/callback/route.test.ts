import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { requestMagicLink, SESSION_COOKIE } from "@/lib/session";
import { GET } from "./route";

const NOW = 1_700_000_000_000;

describe("GET /auth/callback", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_SUPER_ADMIN_EMAILS;
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("sets an httpOnly session cookie and drops the token from the next URL", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-session-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_SUPER_ADMIN_EMAILS = "owner@example.com";
    const sql = await openHandoffDb();
    await migrate(sql);
    let link = "";
    await requestMagicLink({
      sql,
      email: "owner@example.com",
      now: Date.now(),
      origin: "https://handoff.example",
      from: "Handoff <handoff@example.com>",
      allowlist: ["owner@example.com"],
      send: async (message) => {
        link = message.text;
      },
    });
    const token = link.match(/token=([a-f0-9]+)/)?.[1] ?? "";
    const response = await GET(new Request(`https://handoff.example/auth/callback?token=${token}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://handoff.example/");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).not.toContain(token);
    expect(NOW).toBeGreaterThan(0);
  });

  it("redirects a used link without a session cookie", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-session-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const response = await GET(new Request("https://handoff.example/auth/callback?token=deadbeef"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://handoff.example/?notice=link");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
