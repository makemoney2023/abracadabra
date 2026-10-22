import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { clientIpFromHeaders, createViewLink, coarseUserAgent, libraryViewLinksEnabled, listViewLinks, openViewLink, refreshViewLink, revokeViewLink, shareHashPepperAvailable, unlockViewLink, viewDownload } from "./library-shares";

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
    "INSERT INTO client_agents (id, label, token_hash, created_at, updated_at) VALUES ('agent-1', 'Ada', 'hash', ?, ?)",
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO batches (id, workspace_id, created_by, created_at, last_activity_at, released_at)
     VALUES ('batch-1', 'ws-1', 'owner-1', ?, ?, ?)`,
    [NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at
     ) VALUES ('d-1', 'org-1', 'ws-1', 'Article', 'document', 'approved', 1, 1, 'staff', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO agent_work_items (
       id, agent_id, external_id, state, kind, title, organization_id, workspace_id,
       deliverable_id, deliverable_version, released_at, created_at, updated_at
     ) VALUES ('work-item-1', 'agent-1', 'item-1', 'filed', 'document', 'Article', 'org-1', 'ws-1',
               'd-1', 1, ?, ?, ?),
              ('work-built-1', 'agent-1', 'built-1', 'filed', 'site', 'Campaign site', 'org-1', 'ws-1',
               NULL, NULL, ?, ?, ?)`,
    [NOW, NOW, NOW, NOW, NOW, NOW],
  );
  await sql.run(
    "INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, link_url, status, sort, work_item_id) VALUES ('item-1', 'd-1', 1, 'link', 'Q4 article', '[]', 'https://news.example/q4', 'approved', 0, 'work-item-1')",
  );
  await sql.run(
    `INSERT INTO built_work (
       id, work_item_id, batch_id, organization_id, workspace_id, title, live_url, status, created_at
     ) VALUES ('built-1', 'work-built-1', 'batch-1', 'org-1', 'ws-1', 'Campaign site', 'https://site.example', 'live', ?)`,
    [NOW],
  );
  return sql;
}

describe("library view links", () => {
  it("classifies a browser without storing the raw agent", () => {
    expect(coarseUserAgent("Mozilla/5.0 (iPhone) Safari/604.1")).toBe("mobile-safari");
    expect(coarseUserAgent("")).toBe("unknown");
    expect(coarseUserAgent("Mozilla/5.0 Chrome/120")).toBe("desktop-chrome");
    expect(coarseUserAgent("Mozilla/5.0 Chrome/120")).not.toContain("Mozilla");
    expect(clientIpFromHeaders(new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.2, 198.51.100.3",
    }))).toBe("203.0.113.7");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "198.51.100.2, 198.51.100.3" }))).toBe("198.51.100.2");
    expect(shareHashPepperAvailable(true, "")).toBe(false);
    expect(shareHashPepperAvailable(true, "pepper")).toBe(true);
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

  it("fails closed when pinned work is withdrawn, superseded, or archived", async () => {
    process.env.LIBRARY_VIEW_LINKS = "on";
    process.env.HANDOFF_SHARE_HASH_PEPPER = "pepper";

    const withdrawnSql = await database();
    const withdrawn = await createViewLink(withdrawnSql, owner, {
      workspaceId: "ws-1",
      items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }],
    }, NOW, "https://handoff.example");
    expect(withdrawn.ok).toBe(true);
    if (!withdrawn.ok) return;
    await withdrawnSql.run("UPDATE agent_work_items SET retracted_at = ? WHERE id = 'work-item-1'", [NOW + 1]);
    expect(failed(await openViewLink(withdrawnSql, withdrawn.url.split("/view/")[1] ?? "", NOW + 2))).toBe("unavailable");

    const supersededSql = await database();
    const superseded = await createViewLink(supersededSql, owner, {
      workspaceId: "ws-1",
      items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }],
    }, NOW, "https://handoff.example");
    expect(superseded.ok).toBe(true);
    if (!superseded.ok) return;
    await supersededSql.run("UPDATE agent_work_items SET superseded_by = 'replacement' WHERE id = 'work-item-1'");
    expect(failed(await openViewLink(supersededSql, superseded.url.split("/view/")[1] ?? "", NOW + 2))).toBe("unavailable");

    const archivedSql = await database();
    const archived = await createViewLink(archivedSql, owner, {
      workspaceId: "ws-1",
      items: [{ resourceKind: "built_work", resourceId: "built-1", resourceVersion: 0 }],
    }, NOW, "https://handoff.example");
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    await archivedSql.run("UPDATE built_work SET status = 'archived' WHERE id = 'built-1'");
    expect(failed(await openViewLink(archivedSql, archived.url.split("/view/")[1] ?? "", NOW + 2))).toBe("unavailable");
  });

  it("treats supplied invalid or expired unlock sessions as unavailable", async () => {
    const sql = await database();
    process.env.LIBRARY_VIEW_LINKS = "on";
    process.env.HANDOFF_SHARE_HASH_PEPPER = "pepper";
    const created = await createViewLink(sql, owner, {
      workspaceId: "ws-1",
      passcode: "correct-horse",
      items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }],
    }, NOW, "https://handoff.example");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const token = created.url.split("/view/")[1] ?? "";

    expect(failed(await openViewLink(sql, token, NOW))).toBe("locked");
    expect(failed(await openViewLink(sql, token, NOW, "forged-session"))).toBe("unavailable");
    const unlocked = await unlockViewLink(sql, token, "correct-horse", "203.0.113.9", NOW);
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) return;
    await sql.run("UPDATE library_share_unlock_sessions SET expires_at = ? WHERE share_id = ?", [NOW - 1, created.id]);
    expect(failed(await openViewLink(sql, token, NOW, unlocked.cookie.value))).toBe("unavailable");
  });

  it("returns no more than eight history events per view link", async () => {
    const sql = await database();
    process.env.LIBRARY_VIEW_LINKS = "on";
    process.env.HANDOFF_SHARE_HASH_PEPPER = "pepper";
    const created = await createViewLink(sql, owner, {
      workspaceId: "ws-1",
      items: [{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }],
    }, NOW, "https://handoff.example");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    for (let index = 0; index < 12; index += 1) {
      await sql.run(
        "INSERT INTO library_share_events (id, share_id, kind, at) VALUES (?, ?, 'opened', ?)",
        [crypto.randomUUID(), created.id, NOW + index + 1],
      );
    }
    const listed = await listViewLinks(sql, owner, "ws-1");
    expect(listed.ok && listed.shares[0]?.events).toHaveLength(8);
    expect(listed.ok && listed.shares[0]?.events.map((event) => event.at))
      .toEqual([NOW + 12, NOW + 11, NOW + 10, NOW + 9, NOW + 8, NOW + 7, NOW + 6, NOW + 5]);
  });
});

async function hashForTest(ip: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("pepper"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Buffer.from(signature).toString("hex");
}
