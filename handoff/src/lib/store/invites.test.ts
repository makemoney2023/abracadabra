import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { LIMITS } from "@/lib/policy/limits";
import type { OutboundMail } from "@/lib/session";
import { acceptInvite, createInvite, removeMember, resendInvite } from "./invites";

const NOW = 1_700_000_000_000;
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "https://handoff.example";
const FROM = "Handoff <handoff@example.com>";

const owner: Caller = {
  userId: "user-owner",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_owner" }],
};

const operator: Caller = {
  userId: "user-operator",
  staff: { superAdmin: false },
  operatorOf: [WORKSPACE],
  memberships: [],
};

const stranger: Caller = {
  userId: "user-stranger",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_owner" }],
};

async function memoryDb(): Promise<Sql> {
  process.env.HANDOFF_SQLITE_PATH = ":memory:";
  const sql = await openHandoffDb();
  await migrate(sql);
  return sql;
}

async function seedWorkspace(sql: Sql, status = "active"): Promise<void> {
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
    ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, ?, ?, NULL, NULL)`,
    [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, status, NOW],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
    "user-owner",
    "owner@example.com",
    NOW,
  ]);
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
    [WORKSPACE, NOW],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
    "user-operator",
    "operator@example.com",
    NOW,
  ]);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('user-operator', 'operator@example.com', 0, ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
     VALUES ('op-1', ?, 'user-operator', 'user-admin', ?, NULL)`,
    [WORKSPACE, NOW],
  );
}

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
});

describe("createInvite", () => {
  it("lets a client owner invite a member and refuses an owner invite", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const sent: OutboundMail[] = [];
    const forged = await createInvite({
      sql,
      caller: stranger,
      workspaceId: WORKSPACE,
      email: "guest@example.com",
      role: "client_member",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(forged).toEqual({ ok: false, message: "You can't do that." });

    const member = await createInvite({
      sql,
      caller: owner,
      workspaceId: WORKSPACE,
      email: " Guest@Example.com ",
      role: "client_member",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(member.ok).toBe(true);
    if (!member.ok) return;
    const row = await sql.get<{ email: string; role: string; invited_by: string; expires_at: number }>(
      "SELECT email, role, invited_by, expires_at FROM invites WHERE id = ?",
      [member.value.id],
    );
    expect(row).toEqual({
      email: "guest@example.com",
      role: "client_member",
      invited_by: "user-owner",
      expires_at: NOW + LIMITS.inviteTtlDays * 24 * 60 * 60 * 1000,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("Sign in to Handoff");
    expect(sent[0]?.text).toContain(`${ORIGIN}/auth/callback?token=`);
    expect(sent[0]?.text).toContain(encodeURIComponent(`/invites/${member.value.id}`));
    expect(sent[0]?.text).not.toContain("token_hash");

    const ownerInvite = await createInvite({
      sql,
      caller: owner,
      workspaceId: WORKSPACE,
      email: "other-owner@example.com",
      role: "client_owner",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(ownerInvite).toEqual({ ok: false, message: "You can't do that." });
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM invites");
    expect(count?.n).toBe(1);
  });

  it("lets an operator invite either role", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const member = await createInvite({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      email: "member@example.com",
      role: "client_member",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async () => {},
    });
    const ownerInvite = await createInvite({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      email: "lead@example.com",
      role: "client_owner",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async () => {},
    });
    expect(member.ok).toBe(true);
    expect(ownerInvite.ok).toBe(true);
    const roles = await sql.all<{ role: string }>("SELECT role FROM invites ORDER BY email");
    expect(roles.map((row) => row.role)).toEqual(["client_owner", "client_member"]);
  });

  it("refuses a second live invite and the 31st invite in a day", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const first = await createInvite({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      email: "guest@example.com",
      role: "client_member",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async () => {},
    });
    expect(first.ok).toBe(true);
    const second = await createInvite({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      email: "guest@example.com",
      role: "client_member",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async () => {},
    });
    expect(second).toEqual({ ok: false, message: "That invite is already out." });

    for (let index = 0; index < 29; index += 1) {
      const created = await createInvite({
        sql,
        caller: operator,
        workspaceId: WORKSPACE,
        email: `person-${index}@example.com`,
        role: "client_member",
        now: NOW,
        origin: ORIGIN,
        from: FROM,
        allowlist: [],
        send: async () => {},
      });
      expect(created.ok).toBe(true);
    }
    const limited = await createInvite({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      email: "one-more@example.com",
      role: "client_member",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async () => {},
    });
    expect(limited).toEqual({ ok: false, message: "You've sent as many invites as you can today." });
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM invites");
    expect(count?.n).toBe(30);
  });

  it("resends a live invite without a second row", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const sent: OutboundMail[] = [];
    const created = await createInvite({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      email: "guest@example.com",
      role: "client_member",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async (message) => {
        sent.push(message);
      },
    });
    if (!created.ok) throw new Error(created.message);
    const resent = await resendInvite({
      sql,
      caller: operator,
      inviteId: created.value.id,
      now: NOW + 1_000,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(resent).toEqual({ ok: true, value: { id: created.value.id } });
    const rows = await sql.get<{ n: number }>("SELECT count(*) AS n FROM invites");
    expect(rows?.n).toBe(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.text).toContain(encodeURIComponent(`/invites/${created.value.id}`));
    const expiry = await sql.get<{ expires_at: number }>("SELECT expires_at FROM invites WHERE id = ?", [
      created.value.id,
    ]);
    expect(expiry?.expires_at).toBe(NOW + 1_000 + LIMITS.inviteTtlDays * 24 * 60 * 60 * 1000);
  });
});

describe("acceptInvite", () => {
  async function openInvite(sql: Sql): Promise<string> {
    const created = await createInvite({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      email: "guest@example.com",
      role: "client_member",
      now: NOW,
      origin: ORIGIN,
      from: FROM,
      allowlist: [],
      send: async () => {},
    });
    if (!created.ok) throw new Error(created.message);
    return created.value.id;
  }

  it("creates a membership keyed by user id and ignores a different email", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const inviteId = await openInvite(sql);
    await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
      "user-other",
      "other@example.com",
      NOW,
    ]);
    const mismatch = await acceptInvite({
      sql,
      caller: {
        userId: "user-other",
        staff: null,
        operatorOf: [],
        memberships: [],
      },
      inviteId,
      now: NOW + 1_000,
    });
    expect(mismatch).toEqual({ ok: false, message: "This invite was sent to a different email." });
    expect(await sql.get("SELECT id FROM memberships WHERE user_id = 'user-other'")).toBeUndefined();

    await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
      "user-guest",
      "guest@example.com",
      NOW,
    ]);
    const accepted = await acceptInvite({
      sql,
      caller: {
        userId: "user-guest",
        staff: null,
        operatorOf: [],
        memberships: [],
      },
      inviteId,
      now: NOW + 2_000,
    });
    expect(accepted.ok).toBe(true);
    const membership = await sql.get<{ user_id: string; email: string; role: string }>(
      "SELECT user_id, email, role FROM memberships WHERE user_id = 'user-guest'",
    );
    expect(membership).toEqual({
      user_id: "user-guest",
      email: "guest@example.com",
      role: "client_member",
    });
    const invite = await sql.get<{ accepted_at: number }>("SELECT accepted_at FROM invites WHERE id = ?", [
      inviteId,
    ]);
    expect(invite?.accepted_at).toBe(NOW + 2_000);
  });

  it("creates nothing for an expired, revoked, or archived invite", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
      "user-guest",
      "guest@example.com",
      NOW,
    ]);
    const guest: Caller = {
      userId: "user-guest",
      staff: null,
      operatorOf: [],
      memberships: [],
    };

    const expiredId = await openInvite(sql);
    await sql.run("UPDATE invites SET expires_at = ? WHERE id = ?", [NOW, expiredId]);
    expect(
      await acceptInvite({ sql, caller: guest, inviteId: expiredId, now: NOW }),
    ).toEqual({ ok: false, message: "That invite doesn't work anymore." });

    await sql.run("DELETE FROM invites");
    const revokedId = await openInvite(sql);
    await sql.run("UPDATE invites SET revoked_at = ? WHERE id = ?", [NOW, revokedId]);
    expect(
      await acceptInvite({ sql, caller: guest, inviteId: revokedId, now: NOW + 1 }),
    ).toEqual({ ok: false, message: "That invite doesn't work anymore." });

    await sql.run("DELETE FROM invites");
    const archivedId = await openInvite(sql);
    await sql.run("UPDATE workspaces SET status = 'archived' WHERE id = ?", [WORKSPACE]);
    expect(
      await acceptInvite({ sql, caller: guest, inviteId: archivedId, now: NOW + 2 }),
    ).toEqual({ ok: false, message: "That invite doesn't work anymore." });

    const memberships = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM memberships WHERE user_id = 'user-guest'",
    );
    expect(memberships?.n).toBe(0);
  });
});

describe("removeMember", () => {
  it("lets an owner remove a member and refuses removing an owner", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
      "user-member",
      "member@example.com",
      NOW,
    ]);
    await sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES ('mem-member', ?, 'user-member', 'member@example.com', 'client_member', ?, NULL)`,
      [WORKSPACE, NOW],
    );
    const removed = await removeMember({
      sql,
      caller: owner,
      membershipId: "mem-member",
      now: NOW + 5,
    });
    expect(removed.ok).toBe(true);
    const member = await sql.get<{ revoked_at: number }>(
      "SELECT revoked_at FROM memberships WHERE id = 'mem-member'",
    );
    expect(member?.revoked_at).toBe(NOW + 5);
    const refused = await removeMember({
      sql,
      caller: owner,
      membershipId: "mem-owner",
      now: NOW + 6,
    });
    expect(refused).toEqual({ ok: false, message: "You can't do that." });
    const still = await sql.get<{ revoked_at: number | null }>(
      "SELECT revoked_at FROM memberships WHERE id = 'mem-owner'",
    );
    expect(still?.revoked_at).toBeNull();
  });
});
