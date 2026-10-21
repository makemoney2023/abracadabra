import type { Caller } from "@/lib/authz";
import { can } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { inspectCanonicalUrl, redactUrlForActivity, LIBRARY_ARTIFACT_TYPES, type LibraryArtifactType } from "./library-artifacts";

const TYPES = new Set<string>(LIBRARY_ARTIFACT_TYPES);
const ARTICLE_STATUSES = new Set(["draft", "review", "approved", "published", "updated", "archived"]);

export type MetadataError = "forbidden" | "missing" | "invalid" | "stale" | "conflict";
export type MetadataResult<T> = { ok: true; value: T } | { ok: false; error: MetadataError };

export type CanonicalRead = {
  url: string | null;
  hostname: string | null;
  unavailable: boolean;
  source: "metadata" | "link" | "none";
};

type ItemContext = {
  organization_id: string;
  workspace_id: string;
  link_url: string | null;
};

export function readCanonicalUrl(metadataUrl: string | null | undefined, linkUrl: string | null | undefined): CanonicalRead {
  if (metadataUrl) {
    const parsed = inspectCanonicalUrl(metadataUrl, "legacy");
    return parsed.ok
      ? { url: parsed.url, hostname: parsed.hostname, unavailable: false, source: "metadata" }
      : { url: null, hostname: null, unavailable: true, source: "metadata" };
  }
  if (linkUrl) {
    const parsed = inspectCanonicalUrl(linkUrl, "legacy");
    return parsed.ok
      ? { url: parsed.url, hostname: parsed.hostname, unavailable: false, source: "link" }
      : { url: null, hostname: null, unavailable: true, source: "link" };
  }
  return { url: null, hostname: null, unavailable: false, source: "none" };
}

async function itemContext(sql: Sql, deliverableId: string, itemId: string, version: number): Promise<ItemContext | undefined> {
  return sql.get<ItemContext>(
    `SELECT d.organization_id, d.workspace_id, i.link_url
     FROM deliverable_items i
     JOIN deliverables d ON d.id = i.deliverable_id
     WHERE d.id = ? AND i.id = ? AND i.version = ?`,
    [deliverableId, itemId, version],
  );
}

export async function saveArtifactMetadata(
  sql: Sql,
  caller: Caller,
  input: {
    deliverableId: string;
    itemId: string;
    version: number;
    expectedUpdatedAt: number | null;
    artifactType: string;
    canonicalUrl?: string | null;
    dek?: string | null;
    publisherName?: string | null;
    authorName?: string | null;
    externalPublishedAt?: number | null;
    articleStatus?: string | null;
    sourceFileId?: string | null;
  },
  now: number,
  options: { production?: boolean } = {},
): Promise<MetadataResult<{ updatedAt: number }>> {
  const item = await itemContext(sql, input.deliverableId, input.itemId, input.version);
  if (!item) return { ok: false, error: "missing" };
  if (!can(caller, "article_promotion.create", { workspaceId: item.workspace_id })) return { ok: false, error: "forbidden" };
  if (!TYPES.has(input.artifactType)) return { ok: false, error: "invalid" };
  if (input.articleStatus && !ARTICLE_STATUSES.has(input.articleStatus)) return { ok: false, error: "invalid" };
  let canonical: string | null = null;
  if (input.canonicalUrl) {
    const parsed = inspectCanonicalUrl(input.canonicalUrl, "write", { production: options.production });
    if (!parsed.ok) return { ok: false, error: "invalid" };
    canonical = parsed.url;
  }
  if (input.sourceFileId) {
    const file = await sql.get<{ workspace_id: string; status: string }>(
      "SELECT workspace_id, status FROM files WHERE id = ?",
      [input.sourceFileId],
    );
    if (!file || file.workspace_id !== item.workspace_id || file.status !== "clean") return { ok: false, error: "invalid" };
  }
  const existing = await sql.get<{ updated_at: number }>(
    "SELECT updated_at FROM deliverable_artifact_metadata WHERE item_id = ? AND version = ?",
    [input.itemId, input.version],
  );
  if ((existing?.updated_at ?? null) !== input.expectedUpdatedAt) return { ok: false, error: "stale" };
  const id = existing ? null : crypto.randomUUID();
  const statements = existing
    ? [
        {
          statement: `UPDATE deliverable_artifact_metadata
             SET artifact_type = ?, dek = ?, canonical_url = ?, publisher_name = ?, author_name = ?,
                 external_published_at = ?, article_status = ?, source_file_id = ?, updated_at = ?
             WHERE item_id = ? AND version = ?`,
          params: [
            input.artifactType,
            input.dek ?? null,
            canonical,
            input.publisherName ?? null,
            input.authorName ?? null,
            input.externalPublishedAt ?? null,
            input.articleStatus ?? null,
            input.sourceFileId ?? null,
            now,
            input.itemId,
            input.version,
          ],
        },
      ]
    : [
        {
          statement: `INSERT INTO deliverable_artifact_metadata (
             id, organization_id, workspace_id, deliverable_id, item_id, version, artifact_type, dek,
             canonical_url, publisher_name, author_name, external_published_at, article_status, source_file_id,
             seo_title, seo_description, created_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
          params: [
            id,
            item.organization_id,
            item.workspace_id,
            input.deliverableId,
            input.itemId,
            input.version,
            input.artifactType,
            input.dek ?? null,
            canonical,
            input.publisherName ?? null,
            input.authorName ?? null,
            input.externalPublishedAt ?? null,
            input.articleStatus ?? null,
            input.sourceFileId ?? null,
            caller.userId,
            now,
            now,
          ],
        },
      ];
  await sql.batch([
    ...statements,
    {
      statement: "UPDATE deliverable_items SET link_url = ? WHERE id = ? AND version = ?",
      params: [canonical, input.itemId, input.version],
    },
    {
      statement: `INSERT INTO activities (
         id, organization_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
       ) VALUES (?, ?, ?, 'library.metadata', 'staff', ?, NULL, ?, ?)`,
      params: [
        crypto.randomUUID(),
        item.organization_id,
        item.workspace_id,
        caller.userId,
        JSON.stringify({ itemId: input.itemId, version: input.version, url: canonical ? redactUrlForActivity(canonical) : null }),
        now,
      ],
    },
  ]);
  return { ok: true, value: { updatedAt: now } };
}

async function fileRow(sql: Sql, fileId: string) {
  return sql.get<{ id: string; workspace_id: string; organization_id: string | null; status: string }>(
    `SELECT f.id, f.workspace_id, w.organization_id, f.status
     FROM files f JOIN workspaces w ON w.id = f.workspace_id WHERE f.id = ?`,
    [fileId],
  );
}

export async function selectLibraryFile(
  sql: Sql,
  caller: Caller,
  fileId: string,
  now: number,
): Promise<MetadataResult<{ id: string }>> {
  const file = await fileRow(sql, fileId);
  if (!file || !file.organization_id) return { ok: false, error: "missing" };
  if (!can(caller, "library_file.select", { workspaceId: file.workspace_id })) return { ok: false, error: "forbidden" };
  if (file.status !== "clean") return { ok: false, error: "invalid" };
  const active = await sql.get<{ id: string }>(
    "SELECT id FROM library_file_selections WHERE workspace_id = ? AND file_id = ? AND revoked_at IS NULL",
    [file.workspace_id, fileId],
  );
  if (active) return { ok: true, value: active };
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO library_file_selections (
       id, organization_id, workspace_id, file_id, selected_by, selected_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, file.organization_id, file.workspace_id, fileId, caller.userId ?? "staff", now],
  );
  return { ok: true, value: { id } };
}

export async function revokeLibraryFile(sql: Sql, caller: Caller, fileId: string, now: number): Promise<MetadataResult<{ fileRemains: true }>> {
  const file = await fileRow(sql, fileId);
  if (!file) return { ok: false, error: "missing" };
  if (!can(caller, "library_file.select", { workspaceId: file.workspace_id })) return { ok: false, error: "forbidden" };
  await sql.run(
    `UPDATE library_file_selections SET revoked_by = ?, revoked_at = ?
     WHERE workspace_id = ? AND file_id = ? AND revoked_at IS NULL`,
    [caller.userId, now, file.workspace_id, fileId],
  );
  const still = await sql.get<{ id: string }>("SELECT id FROM files WHERE id = ?", [fileId]);
  if (!still) return { ok: false, error: "missing" };
  return { ok: true, value: { fileRemains: true } };
}

type Endpoint = { organizationId: string; workspaceId: string };

async function resolveEndpoint(sql: Sql, kind: string, id: string, version: number): Promise<Endpoint | "missing"> {
  if (kind === "deliverable_item") {
    const row = await sql.get<Endpoint>(
      `SELECT d.organization_id AS organizationId, d.workspace_id AS workspaceId
       FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
       WHERE i.id = ? AND i.version = ?`,
      [id, version],
    );
    return row ?? "missing";
  }
  if (version !== 0) return "missing";
  if (kind === "built_work") {
    const row = await sql.get<Endpoint>(
      "SELECT organization_id AS organizationId, workspace_id AS workspaceId FROM built_work WHERE id = ?",
      [id],
    );
    return row ?? "missing";
  }
  if (kind === "file") {
    const row = await sql.get<Endpoint>(
      `SELECT w.organization_id AS organizationId, f.workspace_id AS workspaceId
       FROM files f JOIN workspaces w ON w.id = f.workspace_id WHERE f.id = ?`,
      [id],
    );
    return row && row.organizationId ? row : "missing";
  }
  return "missing";
}

export async function addArtifactRelation(
  sql: Sql,
  caller: Caller,
  input: {
    sourceKind: string;
    sourceId: string;
    sourceVersion: number;
    targetKind: string;
    targetId: string;
    targetVersion: number;
    relationKind: "source_of" | "promotes" | "derived_from" | "supersedes";
  },
  now: number,
): Promise<MetadataResult<{ id: string }>> {
  const source = await resolveEndpoint(sql, input.sourceKind, input.sourceId, input.sourceVersion);
  const target = await resolveEndpoint(sql, input.targetKind, input.targetId, input.targetVersion);
  if (source === "missing" || target === "missing") return { ok: false, error: "missing" };
  if (source.workspaceId !== target.workspaceId || source.organizationId !== target.organizationId) return { ok: false, error: "invalid" };
  if (!can(caller, "article_promotion.create", { workspaceId: source.workspaceId })) return { ok: false, error: "forbidden" };
  const duplicate = await sql.get<{ id: string }>(
    `SELECT id FROM artifact_relations
     WHERE workspace_id = ? AND source_kind = ? AND source_id = ? AND source_version = ?
       AND target_kind = ? AND target_id = ? AND target_version = ? AND relation_kind = ?`,
    [source.workspaceId, input.sourceKind, input.sourceId, input.sourceVersion, input.targetKind, input.targetId, input.targetVersion, input.relationKind],
  );
  if (duplicate) return { ok: false, error: "conflict" };
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO artifact_relations (
       id, organization_id, workspace_id, source_kind, source_id, source_version,
       target_kind, target_id, target_version, relation_kind, created_by_kind, created_by_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'staff', ?, ?)`,
    [id, source.organizationId, source.workspaceId, input.sourceKind, input.sourceId, input.sourceVersion, input.targetKind, input.targetId, input.targetVersion, input.relationKind, caller.userId, now],
  );
  return { ok: true, value: { id } };
}

export async function hardDeleteBlocked(sql: Sql, kind: string, id: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    `SELECT id FROM artifact_relations
     WHERE (source_kind = ? AND source_id = ?) OR (target_kind = ? AND target_id = ?)
     LIMIT 1`,
    [kind, id, kind, id],
  );
  return Boolean(row);
}
