import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { sqliteSql } from "./sql";

const NOW = 1_800_000_000_000;

async function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run("INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-a', 'A', 'client', ?, ?)", [NOW, NOW]);
  await sql.run("INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-b', 'B', 'client', ?, ?)", [NOW, NOW]);
  return { db, sql };
}

describe("migration 0053_search_console", () => {
  it("creates the three tables and their indexes, and a second migrate changes nothing", async () => {
    const { sql } = await database();
    const tables = await sql.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('search_properties', 'search_sync_runs', 'search_access_grants') ORDER BY name",
    );
    expect(tables.map((row) => row.name)).toEqual(["search_access_grants", "search_properties", "search_sync_runs"]);
    const indexes = await sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'search_%' ORDER BY name");
    expect(indexes.map((row) => row.name)).toEqual([
      "search_access_grants_invite",
      "search_access_grants_live",
      "search_properties_org",
      "search_properties_site",
      "search_sync_runs_property",
    ]);
    await expect(migrate(sql)).resolves.toBeUndefined();
  });

  it("allows one live mapping per property, defaults to pending with a 200 inspection budget and the loop off", async () => {
    const { sql } = await database();
    const insert = (id: string, org: string, status = "pending") =>
      sql.run(
        "INSERT INTO search_properties (id, organization_id, site_url, status, created_at, updated_at) VALUES (?, ?, 'sc-domain:a.com', ?, ?, ?)",
        [id, org, status, NOW, NOW],
      );
    await insert("p1", "org-a");
    await expect(insert("p2", "org-b")).rejects.toThrow(/UNIQUE/);
    await sql.run("UPDATE search_properties SET status = 'removed' WHERE id = 'p1'");
    await insert("p3", "org-b");
    const row = await sql.get<{ provider: string; inspect_budget: number; loop_enabled: number; backfill_state: string }>(
      "SELECT provider, inspect_budget, loop_enabled, backfill_state FROM search_properties WHERE id = 'p3'",
    );
    expect(row).toEqual({ provider: "gsc", inspect_budget: 200, loop_enabled: 0, backfill_state: "none" });
    await expect(
      sql.run("INSERT INTO search_properties (id, organization_id, site_url, inspect_budget, created_at, updated_at) VALUES ('p4', 'org-a', 'sc-domain:b.com', 5000, ?, ?)", [NOW, NOW]),
    ).rejects.toThrow(/CHECK/);
    await expect(
      sql.run("INSERT INTO search_properties (id, organization_id, site_url, status, created_at, updated_at) VALUES ('p5', 'org-a', 'sc-domain:c.com', 'weird', ?, ?)", [NOW, NOW]),
    ).rejects.toThrow(/CHECK/);
    await expect(
      sql.run("INSERT INTO search_properties (id, organization_id, site_url, created_at, updated_at) VALUES ('p6', 'org-zzz', 'sc-domain:d.com', ?, ?)", [NOW, NOW]),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("needs a membership or an invite on a grant and keeps one live grant per member", async () => {
    const { sql } = await database();
    await sql.run(
      `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at)
       VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Acme', 'standard', 0, 30, 0, 'active', ?)`,
      [NOW],
    );
    await sql.run("INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at) VALUES ('m-1', 'ws-1', 'u-1', 'm@acme.example', 'client_member', ?)", [NOW]);
    await expect(
      sql.run("INSERT INTO search_access_grants (id, workspace_id, granted_by, granted_at) VALUES ('g0', 'ws-1', 'owner', ?)", [NOW]),
    ).rejects.toThrow(/CHECK/);
    await sql.run("INSERT INTO search_access_grants (id, workspace_id, membership_id, granted_by, granted_at) VALUES ('g1', 'ws-1', 'm-1', 'owner', ?)", [NOW]);
    await expect(
      sql.run("INSERT INTO search_access_grants (id, workspace_id, membership_id, granted_by, granted_at) VALUES ('g2', 'ws-1', 'm-1', 'owner', ?)", [NOW]),
    ).rejects.toThrow(/UNIQUE/);
    await sql.run("UPDATE search_access_grants SET revoked_at = ? WHERE id = 'g1'", [NOW]);
    await sql.run("INSERT INTO search_access_grants (id, workspace_id, membership_id, granted_by, granted_at) VALUES ('g3', 'ws-1', 'm-1', 'owner', ?)", [NOW]);
    const live = await sql.all("SELECT id FROM search_access_grants WHERE revoked_at IS NULL");
    expect(live).toEqual([{ id: "g3" }]);
  });
});
