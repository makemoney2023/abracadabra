import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { addArtifactRelation } from "./artifact-relations";

const staff: Caller = { userId: "staff-1", staff: { superAdmin: true }, operatorOf: [], memberships: [] };

describe("artifact relations", () => {
  it("pins versions in one workspace and reports a duplicate", async () => {
    const sql = sqliteSql(new DatabaseSync(":memory:"));
    await migrate(sql);
    const now = 1_800_000_000_000;
    await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [now, now]);
    await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-2', 'Other', 'other.example', 'client', ?, ?)", [now, now]);
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id
       ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
      [now],
    );
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id
       ) VALUES ('ws-2', 'other', 'Other', 'Other', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-2')`,
      [now],
    );
    await sql.run(
      `INSERT INTO deliverables (id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at)
       VALUES ('d-1', 'org-1', 'ws-1', 'A', 'document', 'approved', 1, 1, 'staff', ?, ?)`,
      [now, now],
    );
    await sql.run(
      `INSERT INTO deliverables (id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at)
       VALUES ('d-2', 'org-2', 'ws-2', 'B', 'document', 'approved', 1, 1, 'staff', ?, ?)`,
      [now, now],
    );
    await sql.run("INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, status, sort) VALUES ('item-1', 'd-1', 1, 'page', 'One', '[]', 'approved', 0)");
    await sql.run("INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, status, sort) VALUES ('item-2', 'd-1', 1, 'page', 'Two', '[]', 'approved', 1)");
    await sql.run("INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, status, sort) VALUES ('item-3', 'd-2', 1, 'page', 'Other', '[]', 'approved', 0)");
    const created = await addArtifactRelation(sql, staff, {
      sourceKind: "deliverable_item", sourceId: "item-1", sourceVersion: 1,
      targetKind: "deliverable_item", targetId: "item-2", targetVersion: 1, relationKind: "derived_from",
    }, now);
    expect(created.ok).toBe(true);
    const duplicate = await addArtifactRelation(sql, staff, {
      sourceKind: "deliverable_item", sourceId: "item-1", sourceVersion: 1,
      targetKind: "deliverable_item", targetId: "item-2", targetVersion: 1, relationKind: "derived_from",
    }, now);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toBe("conflict");
    const foreign = await addArtifactRelation(sql, staff, {
      sourceKind: "deliverable_item", sourceId: "item-1", sourceVersion: 1,
      targetKind: "deliverable_item", targetId: "item-3", targetVersion: 1, relationKind: "derived_from",
    }, now);
    expect(foreign.ok).toBe(false);
    const stored = await sql.get<{ source_version: number; target_version: number }>("SELECT source_version, target_version FROM artifact_relations");
    expect(stored).toEqual({ source_version: 1, target_version: 1 });
  });
});