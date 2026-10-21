import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { fileProvenance, filterSourceFiles, folderBreadcrumbs } from "./source-provenance";

describe("source provenance", () => {
  it("builds folder breadcrumbs and filters the file list", () => {
    expect(folderBreadcrumbs("brand/logos/mark.svg")).toEqual([
      { name: "Files", path: "" },
      { name: "brand", path: "brand" },
      { name: "logos", path: "brand/logos" },
    ]);
    const files = [
      { id: "1", name: "brand/brief.pdf", status: "clean", updatedAt: 2 },
      { id: "2", name: "notes.txt", status: "pending", updatedAt: 9 },
    ];
    expect(filterSourceFiles(files, { search: "brief", folder: "brand" }).map((file) => file.id)).toEqual(["1"]);
    expect(filterSourceFiles(files, { status: "pending", sort: "date" }).map((file) => file.id)).toEqual(["2"]);
  });

  it("links a source file to the work that used it and the work delivered as that file", async () => {
    const sql = sqliteSql(new DatabaseSync(":memory:"));
    await migrate(sql);
    const now = 1_800_000_000_000;
    await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [now, now]);
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id
       ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
      [now],
    );
    await sql.run(
      `INSERT INTO batches (id, workspace_id, created_by, created_at, last_activity_at) VALUES ('b-1', 'ws-1', 'user-1', ?, ?)`,
      [now, now],
    );
    await sql.run(
      `INSERT INTO files (id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at)
       VALUES ('file-1', 'b-1', 'ws-1', 'brief.pdf', 'pdf', 10, 'key', 'brand', 'clean', 0, ?)`,
      [now],
    );
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at
       ) VALUES ('d-1', 'org-1', 'ws-1', 'Launch', 'document', 'approved', 1, 1, 'staff', ?, ?)`,
      [now, now],
    );
    await sql.run(
      "INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, status, sort) VALUES ('item-1', 'd-1', 1, 'page', 'Launch page', '[]', 'approved', 0)",
    );
    await sql.run(
      `INSERT INTO deliverable_artifact_metadata (
         id, organization_id, workspace_id, deliverable_id, item_id, version, artifact_type, source_file_id, created_at, updated_at
       ) VALUES ('m-1', 'org-1', 'ws-1', 'd-1', 'item-1', 1, 'document', 'file-1', ?, ?)`,
      [now, now],
    );
    await sql.run(
      `INSERT INTO artifact_relations (
         id, organization_id, workspace_id, source_kind, source_id, source_version, target_kind, target_id, target_version,
         relation_kind, created_by_kind, created_at
       ) VALUES ('r-1', 'org-1', 'ws-1', 'deliverable_item', 'item-1', 1, 'file', 'file-1', 0, 'derived_from', 'staff', ?)`,
      [now],
    );
    const links = await fileProvenance(sql, "ws-1", "file-1", "acme");
    expect(links.usedIn).toEqual([{ title: "Launch page", href: "/w/acme/work/d-1" }]);
    expect(links.deliveredAs).toEqual([{ title: "Launch page", href: "/w/acme/work/d-1" }]);
  });
});
