import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { SearchApiError } from "./errors";
import type { GscClient } from "./gsc";
import {
  listSearchProperties,
  mapSearchProperty,
  normalizeSiteUrl,
  readAccessCheck,
  refreshSearchAccess,
  removeSearchProperty,
  runSearchAccessCron,
} from "./properties";
import { throwawayServiceAccount } from "./test-key";

const NOW = 1_800_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
const client: Caller = { userId: "client-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_owner" }] };

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  for (const [id, name] of [["org-a", "Abracadabra"], ["org-b", "Northwind"]]) {
    await sql.run("INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES (?, ?, 'client', ?, ?)", [id, name, NOW, NOW]);
  }
  return sql;
}

function fakeClient(listSites: GscClient["listSites"]): GscClient {
  return {
    listSites,
    querySearchAnalytics: vi.fn(),
    listSitemaps: vi.fn(),
    inspectUrl: vi.fn(),
  };
}

async function onEnv() {
  return { SEARCH_CONSOLE: "on", GOOGLE_SA_KEY_JSON: (await throwawayServiceAccount()).json };
}

describe("normalizeSiteUrl", () => {
  it("accepts domain and URL-prefix properties and rejects junk", () => {
    expect(normalizeSiteUrl("sc-domain:Abra-Ca-Dabra.app")).toBe("sc-domain:abra-ca-dabra.app");
    expect(normalizeSiteUrl("abra-ca-dabra.app")).toBe("sc-domain:abra-ca-dabra.app");
    expect(normalizeSiteUrl("https://WWW.Example.com")).toBe("https://www.example.com/");
    expect(normalizeSiteUrl("https://example.com/blog")).toBe("https://example.com/blog/");
    for (const bad of ["", "sc-domain:", "sc-domain:not a host", "ftp://example.com/", "https://example.com/?a=1", "https://u:p@example.com/", "localhost", "javascript:alert(1)"]) {
      expect(normalizeSiteUrl(bad)).toBeNull();
    }
  });
});

describe("mapping a property to a client", () => {
  it("lets staff map one property per client, logs it, and blocks the same property on another client", async () => {
    const sql = await database();
    const mapped = await mapSearchProperty(sql, staff, { organizationId: "org-a", siteUrl: "sc-domain:abra-ca-dabra.app", now: NOW });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.property).toMatchObject({ status: "pending", inspect_budget: 200, loop_enabled: 0, mapped_by: "staff-1" });
    expect(await mapSearchProperty(sql, staff, { organizationId: "org-a", siteUrl: "abra-ca-dabra.app", now: NOW })).toEqual({ ok: false, error: "duplicate" });
    expect(await mapSearchProperty(sql, staff, { organizationId: "org-b", siteUrl: "sc-domain:abra-ca-dabra.app", now: NOW })).toEqual({ ok: false, error: "taken" });
    expect(await mapSearchProperty(sql, staff, { organizationId: "org-a", siteUrl: "not a url", now: NOW })).toEqual({ ok: false, error: "invalid" });
    const activity = await sql.all<{ kind: string; actor_kind: string }>("SELECT kind, actor_kind FROM activities WHERE organization_id = 'org-a'");
    expect(activity).toEqual([{ kind: "search.property_mapped", actor_kind: "staff" }]);
    expect(await listSearchProperties(sql, "org-b")).toEqual([]);
  });

  it("refuses non-staff callers and unknown clients", async () => {
    const sql = await database();
    expect(await mapSearchProperty(sql, client, { organizationId: "org-a", siteUrl: "sc-domain:a.com", now: NOW })).toEqual({ ok: false, error: "missing" });
    expect(await mapSearchProperty(sql, staff, { organizationId: "org-zzz", siteUrl: "sc-domain:a.com", now: NOW })).toEqual({ ok: false, error: "missing" });
  });

  it("removes a mapping (scoped to its client) and frees the property for a new one", async () => {
    const sql = await database();
    const mapped = await mapSearchProperty(sql, staff, { organizationId: "org-a", siteUrl: "sc-domain:a.com", now: NOW });
    if (!mapped.ok) throw new Error("map failed");
    expect(await removeSearchProperty(sql, staff, { organizationId: "org-b", propertyId: mapped.property.id, now: NOW })).toEqual({ ok: false, error: "missing" });
    expect(await removeSearchProperty(sql, client, { organizationId: "org-a", propertyId: mapped.property.id, now: NOW })).toEqual({ ok: false, error: "missing" });
    expect(await removeSearchProperty(sql, staff, { organizationId: "org-a", propertyId: mapped.property.id, now: NOW })).toEqual({ ok: true });
    expect(await listSearchProperties(sql, "org-a")).toEqual([]);
    expect((await mapSearchProperty(sql, staff, { organizationId: "org-b", siteUrl: "sc-domain:a.com", now: NOW })).ok).toBe(true);
  });
});

describe("refreshSearchAccess (hourly, handoff Worker)", () => {
  it("records off or a missing key and makes no Google call (fail closed)", async () => {
    const sql = await database();
    const listSites = vi.fn();
    expect(await refreshSearchAccess({ sql, env: {}, now: NOW, client: fakeClient(listSites) })).toEqual({ checkedAt: NOW, ok: false, reason: "off" });
    expect(await refreshSearchAccess({ sql, env: { SEARCH_CONSOLE: "on" }, now: NOW, client: fakeClient(listSites) })).toMatchObject({ ok: false, reason: "missing_key" });
    expect(listSites).not.toHaveBeenCalled();
    expect(await readAccessCheck(sql)).toMatchObject({ ok: false, reason: "missing_key" });
  });

  it("activates visible properties, keeps unshared ones pending, and marks a removed share access_lost", async () => {
    const sql = await database();
    const env = await onEnv();
    const a = await mapSearchProperty(sql, staff, { organizationId: "org-a", siteUrl: "sc-domain:abra-ca-dabra.app", now: NOW });
    const b = await mapSearchProperty(sql, staff, { organizationId: "org-b", siteUrl: "https://northwind.example/", now: NOW });
    if (!a.ok || !b.ok) throw new Error("map failed");

    const first = await refreshSearchAccess({
      sql,
      env,
      now: NOW + 1,
      client: fakeClient(async () => [
        { siteUrl: "sc-domain:abra-ca-dabra.app", permissionLevel: "siteRestrictedUser" },
        { siteUrl: "https://northwind.example/", permissionLevel: "siteUnverifiedUser" },
      ]),
    });
    expect(first).toMatchObject({ ok: true, clientEmail: "hq-search-reader@test-project.iam.gserviceaccount.com" });
    expect((await listSearchProperties(sql, "org-a"))[0]).toMatchObject({ status: "active", permission_level: "siteRestrictedUser", last_error: null });
    expect((await listSearchProperties(sql, "org-b"))[0]).toMatchObject({ status: "pending", last_error: "not_shared" });

    await refreshSearchAccess({ sql, env, now: NOW + 2, client: fakeClient(async () => []) });
    expect((await listSearchProperties(sql, "org-a"))[0]).toMatchObject({ status: "access_lost", permission_level: null });

    await refreshSearchAccess({
      sql,
      env,
      now: NOW + 3,
      client: fakeClient(async () => [{ siteUrl: "sc-domain:abra-ca-dabra.app", permissionLevel: "siteFullUser" }]),
    });
    expect((await listSearchProperties(sql, "org-a"))[0]).toMatchObject({ status: "active" });
    const kinds = await sql.all<{ kind: string }>("SELECT kind FROM activities WHERE organization_id = 'org-a' ORDER BY created_at");
    expect(kinds.map((row) => row.kind)).toEqual(["search.property_mapped", "search.access_confirmed", "search.access_lost", "search.access_restored"]);
  });

  it("records a Google failure without changing statuses or throwing", async () => {
    const sql = await database();
    const env = await onEnv();
    await mapSearchProperty(sql, staff, { organizationId: "org-a", siteUrl: "sc-domain:a.com", now: NOW });
    const check = await refreshSearchAccess({
      sql,
      env,
      now: NOW + 1,
      client: fakeClient(async () => {
        throw new SearchApiError("auth", 401, "UNAUTHENTICATED");
      }),
    });
    expect(check).toMatchObject({ ok: false, reason: "auth" });
    const [row] = await listSearchProperties(sql, "org-a");
    expect(row).toMatchObject({ status: "pending", last_error: "Search Console auth (HTTP 401: UNAUTHENTICATED)" });
    expect(JSON.stringify(await readAccessCheck(sql))).not.toContain("PRIVATE KEY");
  });
});

describe("runSearchAccessCron", () => {
  it("runs only on the hourly cron and never throws into the scheduled handler", async () => {
    const sql = await database();
    const env = await onEnv();
    const listSites = vi.fn(async () => []);
    await runSearchAccessCron({ sql, env, cron: "* * * * *", now: NOW, client: fakeClient(listSites) });
    expect(listSites).not.toHaveBeenCalled();
    await runSearchAccessCron({ sql, env, cron: "0 * * * *", now: NOW, client: fakeClient(listSites) });
    expect(listSites).toHaveBeenCalledTimes(1);
    const broken = { ...sql, run: async () => { throw new Error("db down"); }, get: async () => { throw new Error("db down"); } } as Sql;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runSearchAccessCron({ sql: broken, env, cron: "0 * * * *", now: NOW, client: fakeClient(listSites) })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("writes the off state once, not every hour", async () => {
    const sql = await database();
    await refreshSearchAccess({ sql, env: {}, now: NOW, client: fakeClient(vi.fn()) });
    await refreshSearchAccess({ sql, env: {}, now: NOW + 3_600_000, client: fakeClient(vi.fn()) });
    expect((await readAccessCheck(sql))?.checkedAt).toBe(NOW);
  });
});
