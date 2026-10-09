import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { connectorGrant, saveConnectorGrant } from "./connector-grants";

const NOW = 1_700_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
const outsider: Caller = { userId: "client-1", staff: null, operatorOf: [], memberships: [] };

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

describe("connector grants", () => {
  it("stores one search console resource and replaces it on the next save", async () => {
    const sql = await database();
    const first = await saveConnectorGrant(sql, staff, {
      organizationId: "org-1",
      connectorId: "search-console",
      resource: "sc-domain:northwind.example",
    });
    expect(first).toEqual({ ok: true });
    expect(await connectorGrant(sql, "org-1", "search-console")).toBe("sc-domain:northwind.example");
    await saveConnectorGrant(sql, staff, {
      organizationId: "org-1",
      connectorId: "search-console",
      resource: "https://northwind.example/",
    });
    const rows = await sql.all<{ resource: string }>("SELECT resource FROM connector_grants");
    expect(rows).toEqual([{ resource: "https://northwind.example/" }]);
  });

  it("refuses a caller who cannot see the client", async () => {
    const sql = await database();
    const saved = await saveConnectorGrant(sql, outsider, {
      organizationId: "org-1",
      connectorId: "search-console",
      resource: "sc-domain:northwind.example",
    });
    expect(saved).toEqual({ ok: false, error: "missing" });
    expect(await connectorGrant(sql, "org-1", "search-console")).toBe("");
  });

  it("removes the row when the resource is empty", async () => {
    const sql = await database();
    await saveConnectorGrant(sql, staff, {
      organizationId: "org-1",
      connectorId: "search-console",
      resource: "sc-domain:northwind.example",
    });
    await saveConnectorGrant(sql, staff, { organizationId: "org-1", connectorId: "search-console", resource: "  " });
    expect(await connectorGrant(sql, "org-1", "search-console")).toBe("");
  });
});
