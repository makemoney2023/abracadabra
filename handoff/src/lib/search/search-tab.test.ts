import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { migrateSearch } from "@/db/migrate-search";
import { sqliteSql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { canSeeSpaceSearch, hasSearchProperty, loadSearchTab } from "./search-tab";

const NOW = Date.parse("2026-10-25T12:00:00Z");

async function setup() {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  const searchSql = sqliteSql(new DatabaseSync(":memory:"));
  await migrateSearch(searchSql);
  const property = async (id: string, org: string, status: string, created: number) => {
    await sql.run("INSERT OR IGNORE INTO organizations (id, name, kind, created_at, updated_at) VALUES (?, ?, 'client', ?, ?)", [
      org,
      org,
      NOW,
      NOW,
    ]);
    await sql.run(
      "INSERT INTO search_properties (id, organization_id, site_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, org, `sc-domain:${id}.com`, status, created, created],
    );
  };
  const day = (org: string, prop: string, clicks: number) =>
    searchSql.run(
      "INSERT INTO search_daily_site (organization_id, property_id, day, search_type, clicks, impressions, pos_sum, is_final) VALUES (?, ?, '2026-10-20', 'web', ?, 100, 300, 1)",
      [org, prop, clicks],
    );
  return { sql, searchSql, property, day };
}

describe("loadSearchTab", () => {
  it("has no property and no report when nothing is mapped", async () => {
    const { sql, searchSql } = await setup();
    expect(await loadSearchTab(sql, searchSql, { organizationId: "org-a", now: NOW })).toMatchObject({
      properties: [],
      property: null,
      report: null,
      range: "28d",
      sort: "clicks",
    });
  });

  it("does not read SEARCH_DB for a pending property", async () => {
    const { sql, property } = await setup();
    await property("a1", "org-a", "pending", NOW);
    const tab = await loadSearchTab(sql, null, { organizationId: "org-a", now: NOW });
    expect(tab.property?.id).toBe("a1");
    expect(tab.report).toBeNull();
  });

  it("shows unavailable, not a crash, for an active property when SEARCH_DB is missing", async () => {
    const { sql, property } = await setup();
    await property("a1", "org-a", "active", NOW);
    expect((await loadSearchTab(sql, null, { organizationId: "org-a", now: NOW })).report).toEqual({
      state: "unavailable",
      reason: "no_db",
    });
  });

  it("prefers an active property and ignores a property id from another organization", async () => {
    const { sql, searchSql, property, day } = await setup();
    await property("a-pending", "org-a", "pending", NOW - 10);
    await property("a-live", "org-a", "active", NOW);
    await property("b-live", "org-b", "active", NOW);
    await day("org-a", "a-live", 7);
    await day("org-b", "b-live", 999);
    const mine = await loadSearchTab(sql, searchSql, { organizationId: "org-a", now: NOW });
    expect(mine.property?.id).toBe("a-live");
    expect(mine.report).toMatchObject({ state: "ok", totals: { clicks: 7 } });

    const sneaky = await loadSearchTab(sql, searchSql, { organizationId: "org-a", property: "b-live", now: NOW });
    expect(sneaky.property?.id).toBe("a-live");
    expect(sneaky.properties.map((row) => row.id)).toEqual(["a-pending", "a-live"]);
    expect(sneaky.report).toMatchObject({ totals: { clicks: 7 } });
  });

  it("cleans up range and sort from the URL", async () => {
    const { sql, searchSql, property } = await setup();
    await property("a1", "org-a", "active", NOW);
    const tab = await loadSearchTab(sql, searchSql, { organizationId: "org-a", range: "5y", sort: "1;drop", now: NOW });
    expect(tab).toMatchObject({ range: "28d", sort: "clicks" });
    expect((await loadSearchTab(sql, searchSql, { organizationId: "org-a", range: "16m", sort: "ctr", now: NOW })).range).toBe(
      "16m",
    );
  });
});

describe("hasSearchProperty", () => {
  it("is true only for a space whose organization has a mapped property", async () => {
    const { sql, property } = await setup();
    await property("a1", "org-a", "pending", NOW);
    await property("b1", "org-b", "removed", NOW);
    const space = (id: string, org: string) =>
      sql.run(
        `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id)
         VALUES (?, ?, ?, ?, 'Studio', 'standard', 1000, 30, 0, 'active', ?, ?)`,
        [id, id, id, id, NOW, org],
      );
    await space("ws-a", "org-a");
    await space("ws-b", "org-b");
    expect(await hasSearchProperty(sql, "ws-a")).toBe(true);
    expect(await hasSearchProperty(sql, "ws-b")).toBe(false);
    expect(await hasSearchProperty(sql, "ws-missing")).toBe(false);
  });
});

describe("canSeeSpaceSearch", () => {
  const caller = (patch: Partial<Caller>): Caller => ({ userId: "u1", staff: null, operatorOf: [], memberships: [], ...patch });

  it("lets every member of the space see Search, not only owners", () => {
    expect(canSeeSpaceSearch(caller({ memberships: [{ workspaceId: "ws-a", role: "client_member" }] }), "ws-a")).toBe(true);
    expect(canSeeSpaceSearch(caller({ memberships: [{ workspaceId: "ws-a", role: "client_owner" }] }), "ws-a")).toBe(true);
    expect(canSeeSpaceSearch(caller({ operatorOf: ["ws-a"] }), "ws-a")).toBe(true);
    expect(canSeeSpaceSearch(caller({ staff: { superAdmin: true } }), "ws-a")).toBe(true);
  });

  it("keeps out people who aren't in that space", () => {
    expect(canSeeSpaceSearch(caller({ memberships: [{ workspaceId: "ws-b", role: "client_owner" }] }), "ws-a")).toBe(false);
    expect(canSeeSpaceSearch(caller({ operatorOf: ["ws-b"] }), "ws-a")).toBe(false);
    expect(canSeeSpaceSearch(caller({ userId: null }), "ws-a")).toBe(false);
  });
});
