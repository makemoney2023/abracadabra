import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "./policy/limits";
import { consumeMagicLink, getCaller, requestMagicLink } from "./session";

const NOW = 1_700_000_000_000;
const ORIGIN = "https://handoff.example";
const FROM = "Handoff <handoff@example.com>";

type Sent = { to: string; subject: string; text: string };

async function memoryDb(): Promise<Sql> {
  process.env.HANDOFF_SQLITE_PATH = ":memory:";
  const sql = await openHandoffDb();
  await migrate(sql);
  return sql;
}

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
});

describe("requestMagicLink", () => {
  it("emails a Handoff link and does not name a workspace", async () => {
    const sql = await memoryDb();
    const sent: Sent[] = [];
    const reply = await requestMagicLink({
      sql,
      email: "  Owner@Example.com ",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: ["owner@example.com"],
      send: async (message) => {
        sent.push(message);
      },
    });

    expect(reply.message).toBe("If this address can open Handoff, a sign-in link is on its way.");
    expect(reply.message).not.toContain("example.com");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("owner@example.com");
    expect(sent[0]?.subject).toBe("Sign in to Handoff");
    expect(sent[0]?.text).toContain(`${ORIGIN}/auth/callback?token=`);
    expect(sent[0]?.text.toLowerCase()).not.toContain("workspace");
    const token = sent[0]?.text.match(/token=([a-f0-9]+)/)?.[1];
    expect(token).toBeTruthy();
    const stored = await sql.get<{ token_hash: string }>("SELECT token_hash FROM magic_links");
    expect(stored?.token_hash).not.toBe(token);
  });

  it("uses the same reply when the address cannot sign in", async () => {
    const sql = await memoryDb();
    const sent: Sent[] = [];
    const reply = await requestMagicLink({
      sql,
      email: "stranger@example.com",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: ["owner@example.com"],
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(reply.message).toBe("If this address can open Handoff, a sign-in link is on its way.");
    expect(sent).toHaveLength(0);
  });

  it("stops sending after the hourly limit", async () => {
    const sql = await memoryDb();
    let sends = 0;
    for (let i = 0; i < LIMITS.magicLinksPerEmailPerHour + 1; i += 1) {
      await requestMagicLink({
        sql,
        email: "owner@example.com",
        now: NOW + i,
        origin: ORIGIN,
        from: FROM,
        allowlist: ["owner@example.com"],
        send: async () => {
          sends += 1;
        },
      });
    }
    expect(sends).toBe(LIMITS.magicLinksPerEmailPerHour);
  });

  it("emails a live invite and skips expired, revoked, and archived ones", async () => {
    const sql = await memoryDb();
    await sql.run(
      `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at)
       VALUES ('ws-live', 'alpha', 'Alpha', 'Alpha Co', 'Alpha', 'standard', 1, 90, 0, 'active', ?),
              ('ws-old', 'beta', 'Beta', 'Beta Co', 'Beta', 'standard', 1, 90, 0, 'archived', ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO invites (id, workspace_id, email, role, invited_by, expires_at, accepted_at, revoked_at)
       VALUES ('inv-live', 'ws-live', 'guest@example.com', 'client_member', 'owner', ?, NULL, NULL),
              ('inv-late', 'ws-live', 'late@example.com', 'client_member', 'owner', ?, NULL, NULL),
              ('inv-stop', 'ws-live', 'stopped@example.com', 'client_member', 'owner', ?, NULL, ?),
              ('inv-arch', 'ws-old', 'archived@example.com', 'client_owner', 'owner', ?, NULL, NULL)`,
      [NOW + 86_400_000, NOW, NOW + 86_400_000, NOW, NOW + 86_400_000],
    );
    const sent: string[] = [];
    for (const email of [
      "guest@example.com",
      "late@example.com",
      "stopped@example.com",
      "archived@example.com",
    ]) {
      await requestMagicLink({
        sql,
        email,
        now: NOW,
        origin: ORIGIN,
        from: FROM,
        allowlist: [],
        send: async (message) => {
          sent.push(message.to);
        },
      });
    }
    expect(sent).toEqual(["guest@example.com"]);
  });
});

describe("consumeMagicLink and getCaller", () => {
  it("bootstraps only the first super-admin and resolves one live caller", async () => {
    const sql = await memoryDb();
    const sent: Sent[] = [];
    await requestMagicLink({
      sql,
      email: "owner@example.com",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: ["owner@example.com", "other@example.com"],
      send: async (message) => {
        sent.push(message);
      },
    });
    const token = sent[0]?.text.match(/token=([a-f0-9]+)/)?.[1] ?? "";
    const session = await consumeMagicLink({
      sql,
      token,
      now: NOW,
      allowlist: ["owner@example.com", "other@example.com"],
    });
    expect(session?.sessionToken).toBeTruthy();
    expect(await consumeMagicLink({ sql, token, now: NOW, allowlist: ["owner@example.com"] })).toBeNull();

    await sql.run(
      `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at)
       VALUES ('ws-a', 'alpha', 'Alpha', 'Alpha Co', 'Alpha', 'standard', 1, 90, 0, 'active', ?)`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
       VALUES ('op-live', 'ws-a', ?, 'owner', ?, NULL), ('op-gone', 'ws-a', ?, 'owner', ?, ?)`,
      [session?.userId, NOW, session?.userId, NOW, NOW],
    );
    await sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES ('mem-live', 'ws-a', ?, 'owner@example.com', 'client_owner', ?, NULL),
              ('mem-gone', 'ws-a', ?, 'owner@example.com', 'client_member', ?, ?)`,
      [session?.userId, NOW, session?.userId, NOW, NOW],
    );

    let gets = 0;
    const counting: Sql = {
      exec: (statement) => sql.exec(statement),
      run: (statement, params) => sql.run(statement, params),
      all: (statement, params) => sql.all(statement, params),
      async get(statement, params) {
        gets += 1;
        return sql.get(statement, params);
      },
    };
    const caller = await getCaller(counting, session?.sessionToken ?? "", NOW);
    expect(gets).toBe(1);
    expect(caller.userId).toBe(session?.userId);
    expect(caller.staff).toEqual({ superAdmin: true });
    expect(caller.operatorOf).toEqual(["ws-a"]);
    expect(caller.memberships).toEqual([{ workspaceId: "ws-a", role: "client_owner" }]);

    const staff = await sql.all<{ email: string }>("SELECT email FROM staff");
    expect(staff).toEqual([{ email: "owner@example.com" }]);

    await requestMagicLink({
      sql,
      email: "other@example.com",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: ["owner@example.com", "other@example.com"],
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(sent).toHaveLength(1);
  });

  it("treats an expired or revoked session as signed out", async () => {
    const sql = await memoryDb();
    const sent: Sent[] = [];
    await requestMagicLink({
      sql,
      email: "owner@example.com",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: ["owner@example.com"],
      send: async (message) => {
        sent.push(message);
      },
    });
    const token = sent[0]?.text.match(/token=([a-f0-9]+)/)?.[1] ?? "";
    const session = await consumeMagicLink({
      sql,
      token,
      now: NOW,
      allowlist: ["owner@example.com"],
    });
    const expired = await getCaller(sql, session?.sessionToken ?? "", NOW + LIMITS.sessionTtlMs);
    expect(expired.userId).toBeNull();
    await sql.run("UPDATE sessions SET revoked_at = ? WHERE user_id = ?", [NOW, session?.userId]);
    const revoked = await getCaller(sql, session?.sessionToken ?? "", NOW);
    expect(revoked.userId).toBeNull();
    expect(revoked.staff).toBeNull();
  });
});
