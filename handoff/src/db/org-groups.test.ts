import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { createOrganization, listOrganizations, mergeOrganizations, organizationById } from "./crm";
import { migrate } from "./migrate";
import { MIGRATION_SQL } from "./migration-sql";
import { organizationGroup, parentChoices, setParentOrganization } from "./org-groups";
import { sqliteSql, type Sql } from "./sql";

const NOW = 1_700_000_000_000;

const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
const outsider: Caller = { userId: "client-1", staff: null, operatorOf: [], memberships: [] };

async function database(): Promise<{ sql: Sql; db: DatabaseSync }> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
  return { sql, db };
}

async function org(sql: Sql, name: string, website?: string, parentOrganizationId?: string): Promise<string> {
  const created = await createOrganization(sql, staff, { name, website, kind: "client", parentOrganizationId }, NOW);
  if (!created.ok) throw new Error(created.error);
  return created.value.id;
}

describe("holding groups", () => {
  it("ships the worker copy of 0027 equal to the file on disk", () => {
    const disk = readFileSync(path.join(process.cwd(), "migrations", "0027_org_parent.sql"), "utf8");
    expect(MIGRATION_SQL["0027_org_parent.sql"]).toBe(disk);
  });

  it("adds the parent column, its index and the no-self-parent check", async () => {
    const { sql, db } = await database();
    const columns = db.prepare("PRAGMA table_info(organizations)").all() as { name: string }[];
    expect(columns.filter((column) => column.name === "parent_organization_id")).toHaveLength(1);
    const index = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'organizations_parent'").get();
    expect(index).toEqual({ name: "organizations_parent" });
    const id = await org(sql, "Solo");
    await expect(sql.run("UPDATE organizations SET parent_organization_id = id WHERE id = ?", [id])).rejects.toThrow(/CHECK/);
    await migrate(sql);
    const again = db.prepare("PRAGMA table_info(organizations)").all() as { name: string }[];
    expect(again.filter((column) => column.name === "parent_organization_id")).toHaveLength(1);
  });

  it("creates a child under a parent and shows both sides of the group", async () => {
    const { sql } = await database();
    const parent = await org(sql, "LioCorr Holdings Inc.", "https://liocorr.com");
    const foam = await org(sql, "Strong Foam Insulation Inc.", "https://strongfoam.com", parent);
    const milr = await org(sql, "Milr-Corr Construction", "https://milrcorr.com", parent);
    expect((await organizationById(sql, staff, foam))?.parent_organization_id).toBe(parent);
    const group = await organizationGroup(sql, staff, parent);
    expect(group.parent).toBeNull();
    expect(group.children.map((child) => child.id)).toEqual([milr, foam]);
    const child = await organizationGroup(sql, staff, foam);
    expect(child.parent?.name).toBe("LioCorr Holdings Inc.");
    expect(child.children).toEqual([]);
  });

  it("refuses a missing parent or a parent that is itself a child", async () => {
    const { sql } = await database();
    const missing = await createOrganization(sql, staff, { name: "Orphan", parentOrganizationId: "nope" }, NOW);
    expect(missing).toEqual({ ok: false, error: "missing" });
    const top = await org(sql, "Top");
    const middle = await org(sql, "Middle", undefined, top);
    const nested = await createOrganization(sql, staff, { name: "Bottom", parentOrganizationId: middle }, NOW);
    expect(nested).toEqual({ ok: false, error: "invalid" });
  });

  it("sets, moves and clears a parent with timeline notes on each company", async () => {
    const { sql } = await database();
    const group = await org(sql, "LioCorr Holdings Inc.");
    const other = await org(sql, "Other Group");
    const square = await org(sql, "Square Assembly Inc.");
    const set = await setParentOrganization(sql, staff, { organizationId: square, parentId: group }, NOW);
    expect(set.ok && set.value.parent?.id).toBe(group);
    const moved = await setParentOrganization(sql, staff, { organizationId: square, parentId: other }, NOW + 1);
    expect(moved.ok && moved.value.parent?.id).toBe(other);
    const cleared = await setParentOrganization(sql, staff, { organizationId: square, parentId: null }, NOW + 2);
    expect(cleared.ok && cleared.value.parent).toBeNull();
    const notes = await sql.all<{ organization_id: string; body: string }>(
      "SELECT organization_id, body FROM activities WHERE body IS NOT NULL ORDER BY created_at, body",
    );
    expect(notes).toEqual(
      expect.arrayContaining([
        { organization_id: square, body: "Now part of LioCorr Holdings Inc." },
        { organization_id: group, body: "Added Square Assembly Inc. to the group." },
        { organization_id: group, body: "Square Assembly Inc. left the group." },
        { organization_id: square, body: "No longer part of Other Group." },
      ]),
    );
  });

  it("blocks self, nesting and cycles, and keeps staff-only access", async () => {
    const { sql } = await database();
    const a = await org(sql, "A");
    const b = await org(sql, "B");
    const c = await org(sql, "C");
    expect(await setParentOrganization(sql, staff, { organizationId: a, parentId: a }, NOW)).toEqual({ ok: false, error: "invalid" });
    expect((await setParentOrganization(sql, staff, { organizationId: b, parentId: a }, NOW)).ok).toBe(true);
    // a has a child, so a cannot go under anything; c cannot go under b, which is a child.
    expect(await setParentOrganization(sql, staff, { organizationId: a, parentId: c }, NOW)).toEqual({ ok: false, error: "invalid" });
    expect(await setParentOrganization(sql, staff, { organizationId: c, parentId: b }, NOW)).toEqual({ ok: false, error: "invalid" });
    expect(await setParentOrganization(sql, staff, { organizationId: c, parentId: "nope" }, NOW)).toEqual({ ok: false, error: "missing" });
    expect(await setParentOrganization(sql, outsider, { organizationId: c, parentId: a }, NOW)).toEqual({ ok: false, error: "forbidden" });
    expect(await organizationGroup(sql, outsider, a)).toEqual({ parent: null, children: [] });
    expect((await parentChoices(sql, staff, c)).map((row) => row.name)).toEqual(["A"]);
    expect(await parentChoices(sql, outsider)).toEqual([]);
  });

  it("moves a merged company's children to the company that is kept", async () => {
    const { sql } = await database();
    const keep = await org(sql, "LioCorr Holdings Inc.", "https://liocorr.com");
    const drop = await org(sql, "Liocorr duplicate");
    const child = await org(sql, "Everleigh Homes Inc.", "https://everleighhomes.com", drop);
    expect((await mergeOrganizations(sql, staff, { keepId: keep, dropId: drop }, NOW + 5)).ok).toBe(true);
    expect((await organizationById(sql, staff, child))?.parent_organization_id).toBe(keep);
    expect((await listOrganizations(sql, staff)).map((row) => row.name)).not.toContain("Liocorr duplicate");
  });
});
