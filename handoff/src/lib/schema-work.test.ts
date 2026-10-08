import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { listProjectDeliverables, listWorkspaceDeliverables } from "@/db/deliverables";
import { listWork } from "@/db/crm";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { consumeIntake } from "./intake/consume";

const NOW = 1_700_000_000_000;

const staff: Caller = {
  userId: "staff-1",
  staff: { superAdmin: true },
  operatorOf: [],
  memberships: [],
};

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('staff-1', 'staff@example.com', 1, ?, NULL)`,
    [NOW],
  );
  return sql;
}

const payload = {
  scan_id: "scan-1",
  domain: "northwind.example",
  origin: "https://northwind.example",
  business_name: "Northwind",
  files: [
    { path: "json-ld/home.jsonld", content: '{"@type":"Organization"}' },
    { path: "llms.txt", content: "# Northwind" },
    { path: "sitemap.xml", content: "<urlset></urlset>" },
    { path: "robots.txt", content: "User-agent: *" },
  ],
};

describe("schema package intake", () => {
  it("files the package on a new space and leaves a task on the work board", async () => {
    const sql = await database();
    const result = await consumeIntake(sql, { source: "schema", payload }, NOW);
    expect(result).toMatchObject({ ok: true, duplicate: false });

    const org = await sql.get<{ name: string; domain: string; kind: string }>(
      "SELECT name, domain, kind FROM organizations",
    );
    expect(org).toEqual({ name: "Northwind", domain: "northwind.example", kind: "client" });

    const space = await sql.get<{ slug: string; organization_id: string; project_id: string }>(
      "SELECT slug, organization_id, project_id FROM workspaces",
    );
    expect(space?.slug).toBe("northwind-example");
    expect(space?.organization_id).toBeTruthy();
    expect(space?.project_id).toBeTruthy();

    const piece = await sql.get<{ title: string; kind: string; status: string; published_version: number }>(
      "SELECT title, kind, status, published_version FROM deliverables",
    );
    expect(piece).toMatchObject({
      title: "Schema for northwind.example",
      kind: "website",
      status: "in_review",
      published_version: 1,
    });

    const items = await sql.all<{ title: string }>("SELECT title FROM deliverable_items ORDER BY sort");
    expect(items.map((item) => item.title)).toEqual([
      "json-ld/home.jsonld",
      "llms.txt",
      "sitemap.xml",
      "robots.txt",
    ]);

    const task = await sql.get<{ title: string; status: string; deliverable_id: string | null }>(
      "SELECT title, status, deliverable_id FROM tasks",
    );
    expect(task?.title).toBe("Schema for northwind.example");
    expect(task?.status).toBe("todo");
    expect(task?.deliverable_id).toBeTruthy();

    const projectId = space?.project_id ?? "";
    const finished = await listProjectDeliverables(sql, staff, projectId);
    expect(finished.map((row) => row.title)).toEqual(["Schema for northwind.example"]);

    const board = await listWork(sql, staff, {}, NOW);
    expect(board.map((row) => row.title)).toEqual(["Schema for northwind.example"]);
  });

  it("reuses the space that already belongs to the domain", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "schema", payload }, NOW);
    const again = await consumeIntake(
      sql,
      { source: "schema", payload: { ...payload, scan_id: "scan-2" } },
      NOW + 1,
    );
    expect(again).toMatchObject({ ok: true, duplicate: false });
    const spaces = await sql.all<{ id: string }>("SELECT id FROM workspaces");
    const orgs = await sql.all<{ id: string }>("SELECT id FROM organizations");
    expect(spaces).toHaveLength(1);
    expect(orgs).toHaveLength(1);
    const pieces = await sql.all<{ title: string }>("SELECT title FROM deliverables");
    expect(pieces).toHaveLength(2);
  });

  it("does nothing the second time the same scan arrives", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "schema", payload }, NOW);
    const again = await consumeIntake(sql, { source: "schema", payload }, NOW + 1);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    const pieces = await sql.all<{ id: string }>("SELECT id FROM deliverables");
    expect(pieces).toHaveLength(1);
  });

  it("shows the published package in the client space", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "schema", payload }, NOW);
    const space = await sql.get<{ id: string }>("SELECT id FROM workspaces");
    await sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES ('mem-1', ?, 'client-1', 'ada@northwind.example', 'client_member', ?, NULL)`,
      [space?.id, NOW],
    );
    const client: Caller = {
      userId: "client-1",
      staff: null,
      operatorOf: [],
      memberships: [{ workspaceId: space?.id ?? "", role: "client_member" }],
    };
    const cards = await listWorkspaceDeliverables(sql, client, space?.id ?? "");
    expect(cards.map((card) => card.title)).toEqual(["Schema for northwind.example"]);
  });
});
