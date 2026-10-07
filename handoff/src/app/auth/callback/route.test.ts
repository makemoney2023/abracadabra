import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { requestMagicLink, SESSION_COOKIE } from "@/lib/session";
import CallbackPage from "./page";
import { GET, POST } from "./open/route";

const NOW = 1_700_000_000_000;

function postSignIn(token: string, next?: string) {
  const body = new URLSearchParams({ token });
  if (next) body.set("next", next);
  return new Request("https://handoff.example/auth/callback/open", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("magic link confirm", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_SUPER_ADMIN_EMAILS;
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  async function issuedLink(returnTo?: string) {
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
      returnTo,
      send: async (message) => {
        link = message.text;
      },
    });
    const token = link.match(/token=([a-f0-9]+)/)?.[1] ?? "";
    return { sql, token };
  }

  it("shows a button and leaves the link unused", async () => {
    const { sql, token } = await issuedLink();
    const html = renderToStaticMarkup(
      await CallbackPage({ searchParams: Promise.resolve({ token }) }),
    );
    expect(html).toContain("Sign in");
    expect(html).toContain("/auth/callback/open");
    expect(html).toContain(`value="${token}"`);
    const row = await sql.get<{ consumed_at: number | null }>("SELECT consumed_at FROM magic_links");
    expect(row?.consumed_at).toBeNull();
  });

  it("signs in only when the button is pressed", async () => {
    const { sql, token } = await issuedLink();
    await CallbackPage({ searchParams: Promise.resolve({ token }) });
    const response = await POST(postSignIn(token));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://handoff.example/");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).not.toContain(token);
    const row = await sql.get<{ consumed_at: number | null }>("SELECT consumed_at FROM magic_links");
    expect(row?.consumed_at).not.toBeNull();
    expect(NOW).toBeGreaterThan(0);
  });

  it("opens the invite page after an invite magic link and ignores an off-site next", async () => {
    const inviteId = "11111111-1111-4111-8111-111111111111";
    const { token } = await issuedLink(`/invites/${inviteId}`);
    const response = await POST(postSignIn(token, `/invites/${inviteId}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://handoff.example/invites/${inviteId}`);
    expect(response.headers.get("location")).not.toContain(token);

    let second = "";
    const sql = await openHandoffDb();
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
    const blocked = await POST(postSignIn(other, "https://evil.example"));
    expect(blocked.headers.get("location")).toBe("https://handoff.example/");
  });

  it("sends a used link home without a session cookie", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-session-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const response = await POST(postSignIn("deadbeef"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://handoff.example/?notice=link");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not sign in when the open address is only visited", async () => {
    const { sql, token } = await issuedLink();
    const response = await GET(new Request(`https://handoff.example/auth/callback/open?token=${token}`));
    expect(response.status).toBe(405);
    expect(response.headers.get("set-cookie")).toBeNull();
    const row = await sql.get<{ consumed_at: number | null }>("SELECT consumed_at FROM magic_links");
    expect(row?.consumed_at).toBeNull();
  });
});
