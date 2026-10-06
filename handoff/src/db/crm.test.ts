import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import {
  createOrganization,
  linkWorkspace,
  listOrganizations,
  normalizeDomain,
  organizationById,
  unlinkedWorkspaces,
} from "./crm";
import { migrate } from "./migrate";
import { sqliteSql, type Sql } from "./sql";

const NOW = 1_700_000_000_000;

const staff: Caller = {
  userId: "staff-1",
  staff: { superAdmin: false },
  operatorOf: [],
  memberships: [],
};

const outsider: Caller = {
  userId: "client-1",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: "ws-1", role: "client_member" }],
};

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at
     ) VALUES (
       'ws-1', 'strongfoam', 'Strongfoam', 'Strongfoam', NULL, 'Studio', 'standard',
       1000, 30, 0, 'active', ?
     )`,
    [NOW],
  );
  return sql;
}

describe("normalizeDomain", () => {
  it("keeps a bare host and drops www", () => {
    expect(normalizeDomain("https://www.Example.com/path")).toBe("example.com");
    expect(normalizeDomain("  renewimplants.com ")).toBe("renewimplants.com");
  });

  it("rejects a blank or nonsense website", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("not a website")).toBeNull();
  });
});

describe("crm organizations", () => {
  it("refuses a person who is not staff", async () => {
    const sql = await database();
    expect(await listOrganizations(sql, outsider)).toEqual([]);
    const created = await createOrganization(sql, outsider, { name: "Northwind" }, NOW);
    expect(created).toEqual({ ok: false, error: "forbidden" });
  });

  it("creates a client and lists it for staff", async () => {
    const sql = await database();
    const created = await createOrganization(
      sql,
      staff,
      { name: "Renew Implants", website: "https://www.renewimplants.com" },
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.kind).toBe("client");
    expect(created.value.domain).toBe("renewimplants.com");
    const rows = await listOrganizations(sql, staff);
    expect(rows.map((row) => row.name)).toEqual(["Renew Implants"]);
    const again = await organizationById(sql, staff, created.value.id);
    expect(again?.name).toBe("Renew Implants");
    expect(await organizationById(sql, outsider, created.value.id)).toBeUndefined();
    const activity = await sql.get<{ kind: string; actor_id: string }>(
      "SELECT kind, actor_id FROM activities WHERE organization_id = ?",
      [created.value.id],
    );
    expect(activity).toEqual({ kind: "note", actor_id: "staff-1" });
  });

  it("refuses a second client with the same website", async () => {
    const sql = await database();
    const first = await createOrganization(sql, staff, { name: "One", website: "example.com" }, NOW);
    expect(first.ok).toBe(true);
    const second = await createOrganization(sql, staff, { name: "Two", website: "https://example.com" }, NOW);
    expect(second).toEqual({ ok: false, error: "taken" });
  });

  it("refuses a blank name", async () => {
    const sql = await database();
    const created = await createOrganization(sql, staff, { name: "   " }, NOW);
    expect(created).toEqual({ ok: false, error: "invalid" });
  });
});

describe("crm space links", () => {
  it("links a space to one client and leaves it off the free list", async () => {
    const sql = await database();
    const created = await createOrganization(sql, staff, { name: "Strongfoam" }, NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const free = await unlinkedWorkspaces(sql, staff);
    expect(free.map((row) => row.id)).toEqual(["ws-1"]);
    const linked = await linkWorkspace(sql, staff, { organizationId: created.value.id, workspaceId: "ws-1" }, NOW);
    expect(linked).toEqual({ ok: true });
    const row = await sql.get<{ organization_id: string }>(
      "SELECT organization_id FROM workspaces WHERE id = 'ws-1'",
    );
    expect(row?.organization_id).toBe(created.value.id);
    expect(await unlinkedWorkspaces(sql, staff)).toEqual([]);
    const other = await createOrganization(sql, staff, { name: "Other" }, NOW);
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    const stolen = await linkWorkspace(
      sql,
      staff,
      { organizationId: other.value.id, workspaceId: "ws-1" },
      NOW,
    );
    expect(stolen).toEqual({ ok: false, error: "space_taken" });
  });

  it("refuses a link from someone who is not staff", async () => {
    const sql = await database();
    const created = await createOrganization(sql, staff, { name: "Strongfoam" }, NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const linked = await linkWorkspace(
      sql,
      outsider,
      { organizationId: created.value.id, workspaceId: "ws-1" },
      NOW,
    );
    expect(linked).toEqual({ ok: false, error: "forbidden" });
  });
});
