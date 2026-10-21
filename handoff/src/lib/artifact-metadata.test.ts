import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import {
  addArtifactRelation,
  hardDeleteBlocked,
  readCanonicalUrl,
  revokeLibraryFile,
  saveArtifactMetadata,
  selectLibraryFile,
} from "./artifact-metadata";

const NOW = 1_800_000_000_000;
function failure<T>(result: { ok: true; value: T } | { ok: false; error: string }): string {
  if (result.ok) throw new Error("expected a refused result");
  return result.error;
}

const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: ["ws-1"], memberships: [] };
const member: Caller = { userId: "member-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_member" }] };

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, domain, kind, created_at, updated_at)
     VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?),
            ('org-2', 'Other', 'other.example', 'client', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days,
       request_digest, status, opened_at, organization_id
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1'),
              ('ws-2', 'other', 'Other', 'Other', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-2')`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO batches (id, workspace_id, created_by, created_at, last_activity_at)
     VALUES ('batch-1', 'ws-1', 'staff-1', ?, ?), ('batch-2', 'ws-2', 'staff-1', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO files (
       id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at
     ) VALUES ('file-clean', 'batch-1', 'ws-1', 'brief.pdf', 'pdf', 10, 'ws-1/batch-1/file-clean', 'source', 'clean', 0, ?),
              ('file-held', 'batch-1', 'ws-1', 'raw.pdf', 'pdf', 10, 'ws-1/batch-1/file-held', 'source', 'held', 0, ?),
              ('file-other', 'batch-2', 'ws-2', 'other.pdf', 'pdf', 10, 'ws-2/batch-2/file-other', 'source', 'clean', 0, ?)`,
    [NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at
     ) VALUES ('d-1', 'org-1', 'ws-1', 'Article', 'document', 'approved', 1, 1, 'staff', ?, ?),
              ('d-2', 'org-2', 'ws-2', 'Other', 'document', 'approved', 1, 1, 'staff', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverable_items (
       id, deliverable_id, version, format, title, copy_text, media_json, link_url, status, sort
     ) VALUES ('item-1', 'd-1', 1, 'link', 'Q4', NULL, '[]', 'http://legacy.example/q4?secret=1', 'approved', 0),
              ('item-2', 'd-2', 1, 'link', 'Other', NULL, '[]', 'https://other.example/a', 'approved', 0)`,
  );
  return sql;
}

describe("article metadata", () => {
  it("reads a legacy link until metadata is saved, then prefers the canonical URL", async () => {
    const sql = await database();
    expect(readCanonicalUrl(null, "http://legacy.example/q4?secret=1")).toMatchObject({
      url: "http://legacy.example/q4?secret=1",
      source: "link",
      unavailable: false,
    });
    const saved = await saveArtifactMetadata(sql, staff, {
      deliverableId: "d-1",
      itemId: "item-1",
      version: 1,
      expectedUpdatedAt: null,
      artifactType: "article",
      canonicalUrl: "https://news.example/q4?utm_source=secret",
      dek: "Launch",
      articleStatus: "published",
      sourceFileId: "file-clean",
    }, NOW, { production: true });
    expect(saved.ok).toBe(true);
    const row = await sql.get<{ canonical_url: string; link_url: string }>(
      `SELECT m.canonical_url, i.link_url
       FROM deliverable_artifact_metadata m JOIN deliverable_items i ON i.id = m.item_id
       WHERE m.item_id = 'item-1'`,
    );
    expect(row).toMatchObject({
      canonical_url: "https://news.example/q4?utm_source=secret",
      link_url: "https://news.example/q4?utm_source=secret",
    });
    expect(readCanonicalUrl(row?.canonical_url, "http://legacy.example/q4?secret=1").source).toBe("metadata");
    const activity = await sql.get<{ data_json: string }>("SELECT data_json FROM activities WHERE kind = 'library.metadata'");
    expect(activity?.data_json).toContain("https://news.example/q4");
    expect(activity?.data_json).not.toContain("utm_source");
  });

  it("rejects unsafe production writes, stale edits, and other workspaces", async () => {
    const sql = await database();
    expect(failure(await saveArtifactMetadata(sql, staff, {
      deliverableId: "d-1", itemId: "item-1", version: 1, expectedUpdatedAt: null, artifactType: "article", canonicalUrl: "http://news.example/q4",
    }, NOW, { production: true }))).toBe("invalid");
    expect(failure(await saveArtifactMetadata(sql, member, {
      deliverableId: "d-1", itemId: "item-1", version: 1, expectedUpdatedAt: null, artifactType: "article", canonicalUrl: "https://news.example/q4",
    }, NOW, { production: true }))).toBe("forbidden");
    const saved = await saveArtifactMetadata(sql, staff, {
      deliverableId: "d-1", itemId: "item-1", version: 1, expectedUpdatedAt: null, artifactType: "article", canonicalUrl: "https://news.example/q4",
    }, NOW, { production: true });
    expect(saved.ok).toBe(true);
    expect(failure(await saveArtifactMetadata(sql, staff, {
      deliverableId: "d-1", itemId: "item-1", version: 1, expectedUpdatedAt: NOW - 1, artifactType: "article", canonicalUrl: "https://news.example/q4b",
    }, NOW + 1, { production: true }))).toBe("stale");
    expect(failure(await saveArtifactMetadata(sql, staff, {
      deliverableId: "d-2", itemId: "item-2", version: 1, expectedUpdatedAt: null, artifactType: "article", canonicalUrl: "https://other.example/a",
    }, NOW, { production: true }))).toBe("forbidden");
  });
});

describe("library file selections and relations", () => {
  it("keeps an audit row for every selection cycle without deleting the file", async () => {
    const sql = await database();
    expect(failure(await selectLibraryFile(sql, member, "file-clean", NOW))).toBe("forbidden");
    expect(failure(await selectLibraryFile(sql, staff, "file-held", NOW))).toBe("invalid");
    expect(failure(await selectLibraryFile(sql, staff, "file-other", NOW))).toBe("forbidden");
    const first = await selectLibraryFile(sql, staff, "file-clean", NOW);
    const again = await selectLibraryFile(sql, staff, "file-clean", NOW + 1);
    expect(first.ok && again.ok && first.value.id === again.value.id).toBe(true);
    const revoked = await revokeLibraryFile(sql, staff, "file-clean", NOW + 2);
    expect(revoked.ok && revoked.value).toEqual({ fileRemains: true });
    const second = await selectLibraryFile(sql, staff, "file-clean", NOW + 3);
    expect(second.ok && first.ok && second.value.id !== first.value.id).toBe(true);
    const rows = await sql.all<{ revoked_at: number | null }>("SELECT revoked_at FROM library_file_selections WHERE file_id = 'file-clean' ORDER BY selected_at");
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.revoked_at == null)).toHaveLength(1);
    expect(await sql.get("SELECT id FROM files WHERE id = 'file-clean'")).toEqual({ id: "file-clean" });
  });

  it("refuses orphan, cross-workspace, and duplicate relations and blocks hard delete", async () => {
    const sql = await database();
    expect(failure(await addArtifactRelation(sql, staff, {
      sourceKind: "deliverable_item", sourceId: "missing", sourceVersion: 1,
      targetKind: "file", targetId: "file-clean", targetVersion: 0, relationKind: "source_of",
    }, NOW))).toBe("missing");
    expect(failure(await addArtifactRelation(sql, staff, {
      sourceKind: "deliverable_item", sourceId: "item-1", sourceVersion: 1,
      targetKind: "file", targetId: "file-other", targetVersion: 0, relationKind: "source_of",
    }, NOW))).toBe("invalid");
    const created = await addArtifactRelation(sql, staff, {
      sourceKind: "file", sourceId: "file-clean", sourceVersion: 0,
      targetKind: "deliverable_item", targetId: "item-1", targetVersion: 1, relationKind: "source_of",
    }, NOW);
    expect(created.ok).toBe(true);
    expect(failure(await addArtifactRelation(sql, staff, {
      sourceKind: "file", sourceId: "file-clean", sourceVersion: 0,
      targetKind: "deliverable_item", targetId: "item-1", targetVersion: 1, relationKind: "source_of",
    }, NOW))).toBe("conflict");
    expect(await hardDeleteBlocked(sql, "file", "file-clean")).toBe(true);
    expect(await hardDeleteBlocked(sql, "file", "file-held")).toBe(false);
  });
});
