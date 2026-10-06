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

  it("opens the invite page after an invite magic link and ignores an off-site next", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-session-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_SUPER_ADMIN_EMAILS = "owner@example.com";
    const sql = await openHandoffDb();
    await migrate(sql);
    const inviteId = "11111111-1111-4111-8111-111111111111";
    let link = "";
    await requestMagicLink({
      sql,
      email: "owner@example.com",
      now: Date.now(),
      origin: "https://handoff.example",
      from: "Handoff <handoff@example.com>",
      allowlist: ["owner@example.com"],
      returnTo: `/invites/${inviteId}`,
      send: async (message) => {
        link = message.text;
      },
    });
    const token = link.match(/token=([a-f0-9]+)/)?.[1] ?? "";
    const next = encodeURIComponent(`/invites/${inviteId}`);
    const response = await GET(
      new Request(`https://handoff.example/auth/callback?token=${token}&next=${next}`),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://handoff.example/invites/${inviteId}`);
    expect(response.headers.get("location")).not.toContain(token);

    let second = "";
    await requestMagicLink({
      sql,
      email: "owner@example.com",
      now: Date.now() + 1_000,
      origin: "https://handoff.example",
      from: "Handoff <handoff@example.com>",
      allowlist: ["owner@example.com"],
      send: async (message) => {
        second = message.text;
      },
    });
    const other = second.match(/token=([a-f0-9]+)/)?.[1] ?? "";
    const blocked = await GET(
      new Request(`https://handoff.example/auth/callback?token=${other}&next=${encodeURIComponent("https://evil.example")}`),
    );
    expect(blocked.headers.get("location")).toBe("https://handoff.example/");
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
