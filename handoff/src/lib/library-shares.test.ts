import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { createViewLink, libraryViewLinksEnabled, listViewLinks, openViewLink, revokeViewLink, unlockViewLink, viewDownload } from "./library-shares";

const NOW = 1_800_000_000_000;
const owner: Caller = { userId: "owner-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_owner" }] };
const member: Caller = { userId: "member-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_member" }] };

function failed<E>(result: { ok: true } | { ok: false; error: E }): E {
  if (result.ok) throw new Error("expected failure");
  return result.error;
}

function blocked(result: { ok: true } | { ok: false; status: number }): number {
  if (result.ok) throw new Error("expected failure");
  return result.status;
}

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [NOW, NOW]);
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at
     ) VALUES ('d-1', 'org-1', 'ws-1', 'Article', 'document', 'approved', 1, 1, 'staff', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    "INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, link_url, status, sort) VALUES ('item-1', 'd-1', 1, 'link', 'Q4 article', '[]', 'https://news.example/q4', 'approved', 0)",
  );
  return sql;
}

describe("library view links", () => {
  afterEach(() => {
    delete process.env.LIBRARY_VIEW_LINKS;
    delete process.env.HANDOFF_SHARE_HASH_PEPPER;
  });

  it("stays off until the flag is on, then stores only a token hash", async () => {
    const sql = await database();
    expect(libraryViewLinksEnabled()).toBe(false);
    expect(failed(await createViewLink(sql, owner, { workspaceId: "ws-1", items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }] }, NOW, "https://handoff.example"))).toBe("disabled");
    process.env.LIBRARY_VIEW_LINKS = "on";
    process.env.HANDOFF_SHARE_HASH_PEPPER = "pepper";
    expect(failed(await createViewLink(sql, member, { workspaceId: "ws-1", items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }] }, NOW, "https://handoff.example"))).toBe("forbidden");
    const created = await createViewLink(sql, owner, {
      workspaceId: "ws-1",
      title: "Q4",
      passcode: "correct-horse",
      allowDownloads: false,
      items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }],
    }, NOW, "https://handoff.example");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.url).toContain("/view/");
    const token = created.url.split("/view/")[1] ?? "";
    expect(token.length).toBeGreaterThanOrEqual(42);
    const listed = await listViewLinks(sql, owner, "ws-1");
    expect(listed.ok && JSON.stringify(listed.shares)).not.toContain(token);
    const stored = await sql.get<{ token_hash: string; passcode_hash: string; created_by_kind: string }>("SELECT token_hash, passcode_hash, created_by_kind FROM library_shares");
    expect(stored?.created_by_kind).toBe("client");
    expect(stored?.token_hash).not.toContain(token);
    expect(stored?.passcode_hash?.startsWith("pbkdf2-sha256$310000$")).toBe(true);
    expect(failed(await openViewLink(sql, token, NOW))).toBe("locked");
    await sql.run(
      "INSERT INTO library_share_unlock_attempts (share_id, ip_hash, count, window_start, blocked_until) VALUES (?, ?, 4, ?, NULL)",
      [created.id, await hashForTest("203.0.113.8"), NOW],
    );
    expect(blocked(await unlockViewLink(sql, token, "wrong", "203.0.113.8", NOW))).toBe(429);
    expect(blocked(await unlockViewLink(sql, token, "wrong", "203.0.113.8", NOW + 1))).toBe(429);
    const unlocked = await unlockViewLink(sql, token, "correct-horse", "203.0.113.9", NOW);
    expect(unlocked.ok && unlocked.cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    if (!unlocked.ok) return;
    const opened = await openViewLink(sql, token, NOW, unlocked.cookie.value);
    expect(opened.ok && opened.view.items[0]?.title).toBe("Q4 article");
    expect(opened.ok && JSON.stringify(opened.view)).not.toContain("item-1");
    expect(blocked(await viewDownload(sql, token, opened.ok ? opened.view.items[0]?.publicId ?? "" : "", NOW))).toBe(404);
    expect((await revokeViewLink(sql, owner, "ws-1", created.id, NOW)).ok).toBe(true);
    expect(failed(await openViewLink(sql, token, NOW, unlocked.cookie.value))).toBe("unavailable");
    const events = await sql.all<{ kind: string }>("SELECT kind FROM library_share_events ORDER BY at");
    expect(events.map((event) => event.kind)).toContain("revoked");
  });
});

async function hashForTest(ip: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("pepper"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Buffer.from(signature).toString("hex");
}
