import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { createViewLink, coarseUserAgent, libraryViewLinksEnabled, listViewLinks, openViewLink, refreshViewLink, revokeViewLink, unlockViewLink, viewDownload } from "./library-shares";

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
  it("classifies a browser without storing the raw agent", () => {
    expect(coarseUserAgent("Mozilla/5.0 (iPhone) Safari/604.1")).toBe("mobile-safari");
    expect(coarseUserAgent("")).toBe("unknown");
    expect(coarseUserAgent("Mozilla/5.0 Chrome/120")).toBe("desktop-chrome");
    expect(coarseUserAgent("Mozilla/5.0 Chrome/120")).not.toContain("Mozilla");
  });

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
    const opened = await openViewLink(sql, token, NOW, unlocked.cookie.value, { ip: "203.0.113.9", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0" });
    expect(opened.ok && opened.view.items[0]?.title).toBe("Q4 article");
    expect(opened.ok && JSON.stringify(opened.view)).not.toContain("item-1");
    const access = await sql.get<{ user_agent: string | null; ip_hash: string | null }>("SELECT user_agent, ip_hash FROM library_share_events WHERE kind = 'opened'");
    expect(access?.user_agent).toBe("desktop-chrome");
    expect(access?.ip_hash).not.toContain("203.0.113.9");
    expect(access?.ip_hash).toHaveLength(64);
    const history = await listViewLinks(sql, owner, "ws-1");
    expect(history.ok && JSON.stringify(history)).not.toContain("Mozilla");
    expect(history.ok && history.shares[0]?.events.some((event) => event.kind === "opened")).toBe(true);
    expect(blocked(await viewDownload(sql, token, opened.ok ? opened.view.items[0]?.publicId ?? "" : "", NOW))).toBe(404);
    expect((await revokeViewLink(sql, owner, "ws-1", created.id, NOW)).ok).toBe(true);
    expect(failed(await openViewLink(sql, token, NOW, unlocked.cookie.value))).toBe("unavailable");
    const events = await sql.all<{ kind: string }>("SELECT kind FROM library_share_events ORDER BY at");
    expect(events.map((event) => event.kind)).toContain("revoked");
  });

  it("keeps a pinned version until the sender updates the view link", async () => {
    const sql = await database();
    process.env.LIBRARY_VIEW_LINKS = "on";
    process.env.HANDOFF_SHARE_HASH_PEPPER = "pepper";
    const created = await createViewLink(sql, owner, {
      workspaceId: "ws-1",
      items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }],
    }, NOW, "https://handoff.example");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await sql.run("UPDATE deliverables SET version = 2, published_version = 2, updated_at = ? WHERE id = 'd-1'", [NOW + 5]);
    await sql.run(
      "INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, link_url, status, sort) VALUES ('item-2', 'd-1', 2, 'link', 'Q4 article revised', '[]', 'https://news.example/q4', 'approved', 0)",
    );
    const token = created.url.split("/view/")[1] ?? "";
    const pinned = await openViewLink(sql, token, NOW + 6);
    expect(pinned.ok && pinned.view.items[0]?.title).toBe("Q4 article");
    const before = await listViewLinks(sql, owner, "ws-1");
    expect(before.ok && before.shares[0]?.newer).toBe(true);
    expect(failed(await refreshViewLink(sql, member, "ws-1", created.id, NOW + 7))).toBe("forbidden");
    const refreshed = await refreshViewLink(sql, owner, "ws-1", created.id, NOW + 8);
    expect(refreshed).toMatchObject({ ok: true, updated: true });
    const current = await openViewLink(sql, token, NOW + 9);
    expect(current.ok && current.view.items[0]?.title).toBe("Q4 article revised");
    const after = await listViewLinks(sql, owner, "ws-1");
    expect(after.ok && after.shares[0]?.newer).toBe(false);
    expect(after.ok && after.shares[0]?.events.some((event) => event.kind === "updated")).toBe(true);
    expect(JSON.stringify(after)).not.toContain(token);
  });
});

async function hashForTest(ip: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("pepper"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Buffer.from(signature).toString("hex");
}
