import type { Caller } from "@/lib/authz";
import { can } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { seesHeldWork } from "@/lib/held-work";
import { filePreviewSrc, posterPreviewSrc } from "@/lib/file-type";
import { listViewLinks } from "@/lib/library-shares";
import { localPublication } from "@/lib/social-queries";
import { pictureAddress, pictureRole, type PictureMedia } from "@/lib/picture-role";
import { pieceOpenHref } from "@/lib/finished-shelf";
import { FILE_BUILD_CONTEXT_SQL, ITEM_BUILD_CONTEXT_SQL } from "@/lib/library-context";
import {
  LIBRARY_ARTIFACT_TYPES,
  projectLibraryArtifact,
  type DestinationInput,
  type LibraryApproval,
  type LibraryArtifact,
  type LibraryArtifactType,
  type LibraryAudience,
  type LibraryPublication,
  type LibraryStatus,
} from "@/lib/library-artifacts";

export const LIBRARY_PAGE_SIZE = 24;
export const LIBRARY_SEARCH_MAX = 200;
const LIBRARY_QUERY_BATCH_SIZE = 96;
const LIBRARY_SOURCE_LIMIT = LIBRARY_PAGE_SIZE + 1;
const TIME_BASE = 1_000_000_000_000_000;

export type LibrarySort = "delivered" | "updated" | "published" | "title" | "needs_action";

export type LibraryListQuery = {
  workspaceId: string;
  type?: LibraryArtifactType | "all";
  status?: LibraryStatus;
  projectId?: string;
  platform?: string;
  needsAction?: boolean;
  /** When true, list pieces that were taken off the shelf. The active shelf hides them. */
  removed?: boolean;
  search?: string;
  sort?: LibrarySort;
  cursor?: string | null;
  includeHeld?: boolean;
  slug?: string;
  deliveredFrom?: number;
  deliveredTo?: number;
};

export type LibraryPage = {
  artifacts: LibraryArtifact[];
  nextCursor: string | null;
  counts: Record<string, number>;
  needsAction: number;
};

type Cursor = { order?: LibrarySort; sort: string; rank: number; id: string; version: number };
type Candidate = Cursor & { artifact: LibraryArtifact };
type CountRow = { artifact_type: LibraryArtifactType; primary_status: LibraryStatus; count: number };

const NEEDS_ACTION = new Set<LibraryStatus>(["changes_requested", "needs_attention", "needs_review"]);

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (
      !parsed
      || typeof parsed.sort !== "string"
      || typeof parsed.rank !== "number"
      || !Number.isInteger(parsed.rank)
      || parsed.rank < 0
      || parsed.rank > 2
      || typeof parsed.id !== "string"
      || typeof parsed.version !== "number"
      || !Number.isInteger(parsed.version)
      || parsed.version < 0
      || (parsed.order !== undefined && !["delivered", "updated", "published", "title", "needs_action"].includes(parsed.order))
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function like(value: string): string {
  return `%${value.toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function comparePosition(left: Cursor, right: Cursor): number {
  return (left.sort < right.sort ? -1 : left.sort > right.sort ? 1 : 0)
    || left.rank - right.rank
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    || left.version - right.version;
}

function approvalOf(itemStatus: string, deliverableStatus: string): LibraryApproval {
  if (itemStatus === "changes_requested" || deliverableStatus === "changes_requested") return "changes_requested";
  if (deliverableStatus === "draft") return "draft";
  if (itemStatus === "approved") return "approved";
  return "needs_review";
}

function publicationOf(input: {
  approval: LibraryApproval;
  targets: { outcome: string }[];
  postStatus: string | null;
  articleStatus: string | null;
  artifactType: LibraryArtifactType;
}): LibraryPublication {
  let publication = localPublication(input.targets, input.postStatus);
  if (input.articleStatus === "published" && (publication === "not_published" || publication === "ready")) publication = "published";
  if (publication === "not_published" && input.approval === "approved" && input.artifactType === "social") return "ready";
  return publication;
}

type ItemRow = {
  id: string;
  version: number;
  title: string;
  format: string;
  channel: string | null;
  copy_text: string | null;
  link_url: string | null;
  status: string;
  deliverable_id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string | null;
  project_name: string | null;
  deliverable_status: string;
  published_at: number | null;
  updated_at: number;
  dek: string | null;
  canonical_url: string | null;
  author_name: string | null;
  external_published_at: number | null;
  artifact_type: string | null;
  normalized_type: LibraryArtifactType;
  article_status: string | null;
  media_json: string;
  sort_value: string;
};

type PromotionEdge = {
  sourceId: string;
  sourceVersion: number;
  sourceDeliverableId: string;
  sourceDeliverableTitle: string;
  targetId: string;
  targetVersion: number;
  targetTitle: string;
};

type TargetRow = {
  item_id: string;
  version: number;
  account_id: string | null;
  platform: string;
  outcome: string | null;
  public_url: string | null;
  target_error: string | null;
  post_status: string;
  published_urls: string | null;
  display_name: string | null;
};

function targetsFor(rows: TargetRow[], refs: { id: string; version: number }[]): { destinations: DestinationInput[]; postStatus: string | null } {
  const wanted = new Set(refs.map((ref) => `${ref.id}:${ref.version}`));
  const matched = rows.filter((row) => wanted.has(`${row.item_id}:${row.version}`));
  const destinations: DestinationInput[] = matched.flatMap((row) => {
    if (!row.platform) return [];
    let urls: Record<string, string> = {};
    try {
      urls = JSON.parse(row.published_urls ?? "{}") as Record<string, string>;
    } catch {
      urls = {};
    }
    return [{
      platform: row.platform,
      outcome: row.outcome ?? row.post_status,
      url: row.public_url ?? (row.account_id ? urls[row.account_id] : null) ?? null,
      staffReason: row.target_error,
    }];
  });
  return { destinations, postStatus: matched[0]?.post_status ?? null };
}

export async function listLibraryArtifacts(
  sql: Sql,
  caller: Caller,
  query: LibraryListQuery,
): Promise<{ ok: true; page: LibraryPage } | { ok: false; error: "missing" | "invalid" }> {
  if (!can(caller, "workspace.view", { workspaceId: query.workspaceId })) return { ok: false, error: "missing" };
  const search = query.search?.trim() ?? "";
  if (search.length > LIBRARY_SEARCH_MAX) return { ok: false, error: "invalid" };
  const cursor = decodeCursor(query.cursor);
  if (query.cursor && !cursor) return { ok: false, error: "invalid" };
  const includeHeld = query.includeHeld === true && seesHeldWork(caller, query.workspaceId);
  const audience: LibraryAudience = includeHeld || seesHeldWork(caller, query.workspaceId) ? "staff" : "client";
  const sort = query.sort ?? "delivered";
  if (cursor?.order && cursor.order !== sort) return { ok: false, error: "invalid" };
  const type = query.type && query.type !== "all" ? query.type : null;
  const counts: Record<string, number> = { total: 0 };
  for (const artifactType of LIBRARY_ARTIFACT_TYPES) counts[artifactType] = 0;
  let needsAction = 0;
  const removedOnly = query.removed === true;
  const [items, sites, files, itemCounts, siteCounts, fileCounts] = await Promise.all([
    loadItems(sql, query, includeHeld, search, sort, cursor, type),
    removedOnly ? Promise.resolve([]) : loadSites(sql, query, includeHeld, search, sort, cursor, type),
    removedOnly ? Promise.resolve([]) : loadFiles(sql, query, includeHeld, search, sort, cursor, type),
    countItems(sql, query, includeHeld, search),
    removedOnly ? Promise.resolve([]) : countSites(sql, query, includeHeld, search),
    removedOnly ? Promise.resolve([]) : countFiles(sql, query, includeHeld, search),
  ]);
  for (const row of [...itemCounts, ...siteCounts, ...fileCounts]) {
    const count = Number(row.count);
    counts.total += count;
    counts[row.artifact_type] = (counts[row.artifact_type] ?? 0) + count;
    if (NEEDS_ACTION.has(row.primary_status)) needsAction += count;
  }
  const refs = items.map((item) => ({ id: item.id, version: item.version }));
  const promotions = await loadPromotions(sql, query.workspaceId, refs);
  const targetRefs = new Map(refs.map((ref) => [`${ref.id}:${ref.version}`, ref]));
  for (const edge of promotions) targetRefs.set(`${edge.sourceId}:${edge.sourceVersion}`, { id: edge.sourceId, version: edge.sourceVersion });
  const targets = await loadTargets(sql, query.workspaceId, [...targetRefs.values()]);
  const visible = [
    ...projectItems(items, targets, promotions, audience, query),
    ...projectSites(sites, audience),
    ...projectFiles(files, audience, query.slug ?? query.workspaceId),
  ].sort(comparePosition).slice(0, LIBRARY_PAGE_SIZE + 1);
  const page = visible.slice(0, LIBRARY_PAGE_SIZE);
  return {
    ok: true,
    page: {
      artifacts: page.map((row) => row.artifact),
      nextCursor: visible.length > LIBRARY_PAGE_SIZE && page.length > 0
        ? encodeCursor({ order: sort, sort: page.at(-1)!.sort, rank: page.at(-1)!.rank, id: page.at(-1)!.id, version: page.at(-1)!.version })
        : null,
      counts,
      needsAction,
    },
  };
}

function projectItems(rows: ItemRow[], targets: TargetRow[], promotions: PromotionEdge[], audience: LibraryAudience, query: LibraryListQuery): Candidate[] {
  return rows.map((row) => {
    const promoting = promotions
      .filter((edge) => edge.targetId === row.id && edge.targetVersion === row.version)
      .map((edge) => ({ id: edge.sourceId, version: edge.sourceVersion }));
    const attached = targetsFor(targets, [{ id: row.id, version: row.version }, ...promoting]);
    const promotedBy = promotions.filter((edge) => edge.targetId === row.id && edge.targetVersion === row.version).length;
    const promotesTitle = promotions.find((edge) => edge.sourceId === row.id && edge.sourceVersion === row.version)?.targetTitle ?? null;
    const promotionCollections = [...new Map(
      promotions
        .filter((edge) => edge.targetId === row.id && edge.targetVersion === row.version)
        .map((edge) => [
          edge.sourceDeliverableId,
          {
            id: edge.sourceDeliverableId,
            title: edge.sourceDeliverableTitle,
            href: `/w/${query.slug ?? query.workspaceId}/work/${edge.sourceDeliverableId}`,
          },
        ]),
    ).values()];
    const approval = approvalOf(row.status, row.deliverable_status);
    const artifactType = row.normalized_type;
    const publication = publicationOf({
      approval,
      targets: attached.destinations,
      postStatus: attached.postStatus,
      articleStatus: row.article_status,
      artifactType: artifactType === "article" || artifactType === "social" ? artifactType : "document",
    });
    const delivered = row.external_published_at ?? row.published_at;
    const artifact = projectLibraryArtifact({
      sourceKind: "deliverable_item",
      sourceId: row.id,
      version: row.version,
      workspaceId: row.workspace_id,
      organizationId: row.organization_id,
      title: row.title,
      format: row.format,
      channel: row.channel,
      hasArticleMetadata: row.artifact_type === "article" || Boolean(row.dek || row.canonical_url || row.article_status),
      artifactTypeOverride: artifactType,
      canonicalUrl: row.canonical_url ?? row.link_url,
      dek: row.dek,
      authorName: row.author_name,
      publishedAt: delivered,
      approval,
      publication,
      updatedAt: row.updated_at,
      audience,
      destinations: attached.destinations,
      href: pieceOpenHref(query.slug ?? query.workspaceId, row.deliverable_id, row.id),
      previewSrc: previewSrc(row.media_json, row.deliverable_id, row.id),
      promotionMedia: promotionMedia(row.media_json, row.deliverable_id, row.id),
      promotedBy,
      promotesTitle,
      promotionCollections,
    });
    return { sort: row.sort_value, rank: 0, id: row.id, version: row.version, artifact };
  });
}

function projectSites(rows: SiteRow[], audience: LibraryAudience): Candidate[] {
  return rows.map((row) => {
    const artifact = projectLibraryArtifact({
      sourceKind: "built_work",
      sourceId: row.id,
      workspaceId: row.workspace_id,
      organizationId: row.organization_id,
      title: row.title,
      canonicalUrl: row.live_url ?? row.preview_url,
      dek: row.description,
      approval: "approved",
      publication: row.live_url ? "published" : "not_published",
      updatedAt: row.created_at,
      audience,
      href: row.live_url ?? row.preview_url,
    });
    return { sort: row.sort_value, rank: 1, id: row.id, version: 0, artifact };
  });
}

function projectFiles(rows: FileRow[], audience: LibraryAudience, slug: string): Candidate[] {
  return rows.map((row) => {
    const artifact = projectLibraryArtifact({
      sourceKind: "file",
      sourceId: row.id,
      workspaceId: row.workspace_id,
      organizationId: row.organization_id,
      title: row.relative_path.split("/").pop() ?? row.relative_path,
      approval: "approved",
      publication: "not_published",
      updatedAt: row.created_at,
      audience,
      href: `/w/${slug}/files/${row.id}`,
      previewSrc: posterPreviewSrc(row.id, row.poster_file_id) ?? filePreviewSrc(row.id, row.relative_path),
    });
    return { sort: row.sort_value, rank: 2, id: row.id, version: 0, artifact };
  });
}

function searchClause(columns: string[], search: string, params: unknown[], extraSql = ""): string {
  if (!search) return "";
  const pattern = like(search);
  const parts = columns.map((column) => {
    params.push(pattern);
    return `lower(COALESCE(${column}, '')) LIKE ? ESCAPE '\\'`;
  });
  if (extraSql) {
    const marks = extraSql.match(/\?/g)?.length ?? 0;
    for (let index = 0; index < marks; index += 1) params.push(pattern);
    parts.push(extraSql);
  }
  return ` AND (${parts.join(" OR ")})`;
}

export function previewSrc(mediaJson: string, deliverableId: string, itemId: string): string | null {
  const role = pictureRole(mediaEntries(mediaJson));
  if (!role) return null;
  return pictureAddress(deliverableId, itemId, role);
}

function mediaEntries(mediaJson: string): PictureMedia[] {
  try {
    const parsed = JSON.parse(mediaJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const role = (entry as { role?: unknown }).role;
      const contentType = (entry as { content_type?: unknown }).content_type;
      if (typeof role !== "string" || !role) return [];
      const type = typeof contentType === "string" ? contentType : undefined;
      return [{ role, contentType: type, video: type?.toLowerCase().startsWith("video/") ?? false }];
    });
  } catch {
    return [];
  }
}

export function promotionMedia(mediaJson: string, deliverableId: string, itemId: string): LibraryArtifact["promotionMedia"] {
  try {
    const parsed = JSON.parse(mediaJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const key = (entry as { r2_key?: unknown }).r2_key;
      const role = (entry as { role?: unknown }).role;
      const contentType = (entry as { content_type?: unknown }).content_type;
      if (typeof key !== "string" || typeof role !== "string" || typeof contentType !== "string") return [];
      const preview = contentType.toLowerCase().startsWith("image/")
        ? `/api/deliverables/${deliverableId}/items/${itemId}/media/${encodeURIComponent(role)}`
        : null;
      return [{ key, role, contentType, previewSrc: preview }];
    });
  } catch {
    return [];
  }
}

const ITEM_ARTIFACT_TYPE_SQL = `CASE
  WHEN m.artifact_type IN ('article', 'social', 'video', 'image', 'website', 'document', 'file') THEN m.artifact_type
  WHEN i.format = 'link' AND (m.dek IS NOT NULL OR m.canonical_url IS NOT NULL OR m.article_status IS NOT NULL) THEN 'article'
  WHEN i.format IN ('link', 'page', 'file') THEN 'document'
  WHEN i.format IN ('video', 'static', 'carousel', 'story', 'ad_video', 'ad_static', 'ad_carousel') AND i.channel IS NOT NULL THEN 'social'
  WHEN i.format IN ('video', 'ad_video') THEN 'video'
  WHEN i.format IN ('static', 'carousel', 'story', 'ad_static', 'ad_carousel') THEN 'image'
  ELSE 'document'
END`;

function relatedPostPredicate(itemAlias: string): string {
  return `(p.item_id = ${itemAlias}.id AND p.version = ${itemAlias}.version)
    OR EXISTS (
      SELECT 1 FROM artifact_relations ar
      WHERE ar.workspace_id = ${itemAlias}.workspace_id
        AND ar.relation_kind = 'promotes'
        AND ar.source_kind = 'deliverable_item'
        AND ar.target_kind = 'deliverable_item'
        AND ar.source_id = p.item_id AND ar.source_version = p.version
        AND ar.target_id = ${itemAlias}.id AND ar.target_version = ${itemAlias}.version
    )`;
}

function relatedOutcomeExists(itemAlias: string, condition: string): string {
  return `EXISTS (
    SELECT 1
    FROM social_posts p
    JOIN deliverables pd ON pd.id = p.deliverable_id AND pd.workspace_id = ${itemAlias}.workspace_id
    LEFT JOIN social_post_targets pt ON pt.post_id = p.id
    WHERE (${relatedPostPredicate(itemAlias)}) AND ${condition}
  )`;
}

function itemCtes(query: LibraryListQuery, includeHeld: boolean, search: string, sort?: LibrarySort): { sql: string; params: unknown[] } {
  const params: unknown[] = [query.workspaceId, includeHeld ? 1 : 0, includeHeld ? 1 : 0, query.removed ? 1 : 0];
  const projectSql = query.projectId ? " AND d.project_id = ?" : "";
  if (query.projectId) params.push(query.projectId);
  const searchSql = searchClause(
    ["i.title", "i.copy_text", "i.section", "m.dek", "m.canonical_url", "m.author_name", "i.link_url", "projects.name"],
    search,
    params,
    `EXISTS (
      SELECT 1 FROM social_posts sp
      LEFT JOIN social_post_targets spt ON spt.post_id = sp.id
      LEFT JOIN social_accounts sa ON sa.id = spt.account_id
      WHERE (
          (sp.item_id = i.id AND sp.version = i.version)
          OR EXISTS (
            SELECT 1 FROM artifact_relations search_ar
            WHERE search_ar.workspace_id = d.workspace_id
              AND search_ar.relation_kind = 'promotes'
              AND search_ar.source_kind = 'deliverable_item'
              AND search_ar.target_kind = 'deliverable_item'
              AND search_ar.source_id = sp.item_id
              AND search_ar.source_version = sp.version
              AND search_ar.target_id = i.id
              AND search_ar.target_version = i.version
          )
        )
        AND (
          lower(COALESCE(spt.platform, '')) LIKE ? ESCAPE '\\'
          OR lower(COALESCE(sa.display_name, '')) LIKE ? ESCAPE '\\'
        )
    )`,
  );
  const hasOutcome = (values: string) => relatedOutcomeExists("ib", `COALESCE(pt.outcome, p.status) IN (${values})`);
  const hasPostStatus = (values: string) => relatedOutcomeExists("ib", `p.status IN (${values})`);
  const sortExpression = sort === "title"
    ? "lower(title)"
    : sort === "updated"
      ? `printf('%016d', ${TIME_BASE} - updated_at)`
      : sort === "needs_action"
        ? `CASE WHEN primary_status IN ('changes_requested', 'needs_attention', 'needs_review') THEN '0:' ELSE '1:' END
           || printf('%016d', ${TIME_BASE} - updated_at)`
        : `printf('%016d', ${TIME_BASE} - delivered_at)`;
  return {
    params,
    sql: `item_base AS (
      SELECT i.id, i.version, i.title, i.format, i.channel, i.copy_text, i.link_url, i.status, i.media_json,
             d.id AS deliverable_id, d.organization_id, d.workspace_id, d.project_id, projects.name AS project_name,
             d.status AS deliverable_status, d.published_at, d.updated_at,
             m.dek, m.canonical_url, m.author_name, m.external_published_at, m.artifact_type, m.article_status,
             ${ITEM_ARTIFACT_TYPE_SQL} AS normalized_type,
             COALESCE(m.external_published_at, d.published_at, d.updated_at) AS delivered_at,
             CASE
               WHEN i.status = 'changes_requested' OR d.status = 'changes_requested' THEN 'changes_requested'
               WHEN d.status = 'draft' THEN 'draft'
               WHEN i.status = 'approved' THEN 'approved'
               ELSE 'needs_review'
             END AS approval
      FROM deliverable_items i
      JOIN deliverables d ON d.id = i.deliverable_id AND i.version = COALESCE(d.published_version, d.version)
      LEFT JOIN deliverable_artifact_metadata m ON m.item_id = i.id AND m.version = i.version
      LEFT JOIN projects ON projects.id = d.project_id
      WHERE d.workspace_id = ?
        AND d.status != 'archived'
        AND (? = 1 OR d.published_version IS NOT NULL)
        AND (? = 1 OR NOT EXISTS (
          SELECT 1 FROM agent_work_items hw
          WHERE hw.deliverable_id = d.id AND hw.deliverable_version = i.version AND hw.state = 'filed'
            AND hw.released_at IS NULL AND hw.retracted_at IS NULL AND hw.superseded_by IS NULL
        ))
        AND NOT EXISTS (
          SELECT 1 FROM agent_work_items gone
          WHERE gone.id = i.work_item_id AND (gone.retracted_at IS NOT NULL OR gone.superseded_by IS NOT NULL)
        )
        AND (i.removed_at IS NOT NULL) = ?
        AND NOT ${ITEM_BUILD_CONTEXT_SQL}
        ${projectSql}
        ${searchSql}
    ),
    item_publication AS (
      SELECT ib.*,
             CASE
               WHEN ${hasOutcome("'succeeded', 'published'")} AND ${hasOutcome("'failed', 'uncertain'")} THEN 'partially_published'
               WHEN ${hasOutcome("'failed', 'uncertain'")} THEN 'needs_attention'
               WHEN ${hasOutcome("'publishing', 'sending'")} THEN 'publishing'
               WHEN ${hasOutcome("'scheduled'")} THEN 'scheduled'
               WHEN ${relatedOutcomeExists("ib", "pt.id IS NOT NULL")}
                    AND NOT ${relatedOutcomeExists("ib", "pt.id IS NOT NULL AND pt.outcome NOT IN ('succeeded', 'published')")} THEN 'published'
               WHEN ${hasPostStatus("'partial', 'failed'")} THEN
                 CASE WHEN ${hasOutcome("'succeeded', 'published'")} THEN 'partially_published' ELSE 'needs_attention' END
               WHEN ${hasPostStatus("'sending'")} THEN 'publishing'
               WHEN ${hasPostStatus("'scheduled'")} THEN 'scheduled'
               WHEN ${hasPostStatus("'published'")} THEN 'published'
               WHEN ib.article_status = 'published' THEN 'published'
               WHEN ib.approval = 'approved' AND ib.normalized_type = 'social' THEN 'ready'
               ELSE 'not_published'
             END AS publication
      FROM item_base ib
    ),
    item_status AS (
      SELECT ip.*,
             CASE
               WHEN approval = 'changes_requested' THEN 'changes_requested'
               WHEN publication = 'needs_attention' THEN 'needs_attention'
               WHEN approval = 'needs_review' THEN 'needs_review'
               WHEN publication = 'publishing' THEN 'publishing'
               WHEN publication = 'scheduled' THEN 'scheduled'
               WHEN publication = 'partially_published' THEN 'partially_published'
               WHEN publication = 'published' THEN 'published'
               WHEN publication = 'ready' THEN 'ready'
               WHEN approval = 'approved' THEN 'approved'
               ELSE 'draft'
             END AS primary_status
      FROM item_publication ip
    )${sort ? `,
    item_sorted AS (
      SELECT item_status.*, ${sortExpression} AS sort_value
      FROM item_status
    )` : ""}`,
  };
}

function itemActiveFilters(query: LibraryListQuery, type: LibraryArtifactType | null): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.status) {
    clauses.push("primary_status = ?");
    params.push(query.status);
  }
  if (query.needsAction) clauses.push("primary_status IN ('changes_requested', 'needs_attention', 'needs_review')");
  if (query.platform) {
    clauses.push(relatedOutcomeExists("item_status", "pt.platform = ?"));
    params.push(query.platform);
  }
  if (query.deliveredFrom != null) {
    clauses.push("delivered_at >= ?");
    params.push(query.deliveredFrom);
  }
  if (query.deliveredTo != null) {
    clauses.push("delivered_at <= ?");
    params.push(query.deliveredTo);
  }
  if (type) {
    clauses.push("normalized_type = ?");
    params.push(type);
  }
  return { sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "", params };
}

function seekClause(cursor: Cursor | null, rank: number, versionColumn = "version"): { sql: string; params: unknown[] } {
  const sort = cursor?.sort ?? null;
  const cursorRank = cursor?.rank ?? -1;
  const id = cursor?.id ?? "";
  const version = cursor?.version ?? -1;
  return {
    sql: ` AND (? IS NULL OR sort_value > ?
      OR (sort_value = ? AND (${rank} > ?
        OR (${rank} = ? AND (id > ? OR (id = ? AND ${versionColumn} > ?))))))`,
    params: [sort, sort, sort, cursorRank, cursorRank, id, id, version],
  };
}

async function loadItems(
  sql: Sql,
  query: LibraryListQuery,
  includeHeld: boolean,
  search: string,
  sort: LibrarySort,
  cursor: Cursor | null,
  type: LibraryArtifactType | null,
): Promise<ItemRow[]> {
  const ctes = itemCtes(query, includeHeld, search, sort);
  const filters = itemActiveFilters(query, type);
  const seek = seekClause(cursor, 0);
  return sql.all<ItemRow>(
    `WITH ${ctes.sql}
     SELECT id, version, title, format, channel, copy_text, link_url, status, media_json,
            deliverable_id, organization_id, workspace_id, project_id, project_name,
            deliverable_status, published_at, updated_at, dek, canonical_url, author_name,
            external_published_at, artifact_type, normalized_type, article_status, sort_value
     FROM item_sorted item_status
     WHERE 1 = 1${filters.sql}${seek.sql}
     ORDER BY sort_value, id, version
     LIMIT ?`,
    [...ctes.params, ...filters.params, ...seek.params, LIBRARY_SOURCE_LIMIT],
  );
}

async function countItems(sql: Sql, query: LibraryListQuery, includeHeld: boolean, search: string): Promise<CountRow[]> {
  const ctes = itemCtes(query, includeHeld, search);
  const filters = itemActiveFilters(query, null);
  return sql.all<CountRow>(
    `WITH ${ctes.sql}
     SELECT normalized_type AS artifact_type, primary_status, COUNT(*) AS count
     FROM item_status
     WHERE 1 = 1${filters.sql}
     GROUP BY normalized_type, primary_status`,
    [...ctes.params, ...filters.params],
  );
}

type SiteRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  title: string;
  live_url: string | null;
  preview_url: string | null;
  created_at: number;
  description: string | null;
  sort_value: string;
};

function simpleSortExpression(sort: LibrarySort, title: string, timestamp: string, status: string): string {
  if (sort === "title") return `lower(${title})`;
  if (sort === "needs_action") {
    return `CASE WHEN ${status} IN ('changes_requested', 'needs_attention', 'needs_review') THEN '0:' ELSE '1:' END
      || printf('%016d', ${TIME_BASE} - ${timestamp})`;
  }
  return `printf('%016d', ${TIME_BASE} - ${timestamp})`;
}

function siteCte(query: LibraryListQuery, includeHeld: boolean, search: string, sort?: LibrarySort): { sql: string; params: unknown[] } {
  const params: unknown[] = [query.workspaceId, includeHeld ? 1 : 0];
  const projectSql = query.projectId ? " AND bw.project_id = ?" : "";
  if (query.projectId) params.push(query.projectId);
  const searchSql = searchClause(["bw.title", "bw.description", "bw.live_url"], search, params);
  const base = `site_base AS (
    SELECT bw.id, bw.organization_id, bw.workspace_id, bw.title, bw.live_url, bw.preview_url, bw.created_at, bw.description,
           'website' AS artifact_type,
           CASE WHEN NULLIF(bw.live_url, '') IS NOT NULL THEN 'published' ELSE 'approved' END AS primary_status
    FROM built_work bw
    JOIN agent_work_items w ON w.id = bw.work_item_id
    JOIN batches b ON b.id = bw.batch_id
    WHERE bw.workspace_id = ? AND w.state = 'filed' AND bw.status != 'archived'
      AND b.deleted_at IS NULL AND b.discarded_at IS NULL
      AND (? = 1 OR ((b.held_at IS NULL OR b.released_at IS NOT NULL) AND b.hidden_at IS NULL))
      ${projectSql}
      ${searchSql}
  )`;
  return {
    params,
    sql: sort
      ? `${base}, site_sorted AS (
          SELECT site_base.*, ${simpleSortExpression(sort, "title", "created_at", "primary_status")} AS sort_value
          FROM site_base
        )`
      : base,
  };
}

function siteActiveFilters(query: LibraryListQuery, type: LibraryArtifactType | null): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.status) {
    clauses.push("primary_status = ?");
    params.push(query.status);
  }
  if (query.needsAction || query.platform) clauses.push("0 = 1");
  if (query.deliveredFrom != null) {
    clauses.push("created_at >= ?");
    params.push(query.deliveredFrom);
  }
  if (query.deliveredTo != null) {
    clauses.push("created_at <= ?");
    params.push(query.deliveredTo);
  }
  if (type) {
    clauses.push("artifact_type = ?");
    params.push(type);
  }
  return { sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "", params };
}

async function loadSites(
  sql: Sql,
  query: LibraryListQuery,
  includeHeld: boolean,
  search: string,
  sort: LibrarySort,
  cursor: Cursor | null,
  type: LibraryArtifactType | null,
): Promise<SiteRow[]> {
  const ctes = siteCte(query, includeHeld, search, sort);
  const filters = siteActiveFilters(query, type);
  const seek = seekClause(cursor, 1, "0");
  return sql.all<SiteRow>(
    `WITH ${ctes.sql}
     SELECT id, organization_id, workspace_id, title, live_url, preview_url, created_at, description, sort_value
     FROM site_sorted
     WHERE 1 = 1${filters.sql}${seek.sql}
     ORDER BY sort_value, id
     LIMIT ?`,
    [...ctes.params, ...filters.params, ...seek.params, LIBRARY_SOURCE_LIMIT],
  );
}

async function countSites(sql: Sql, query: LibraryListQuery, includeHeld: boolean, search: string): Promise<CountRow[]> {
  const ctes = siteCte(query, includeHeld, search);
  const filters = siteActiveFilters(query, null);
  return sql.all<CountRow>(
    `WITH ${ctes.sql}
     SELECT artifact_type, primary_status, COUNT(*) AS count
     FROM site_base
     WHERE 1 = 1${filters.sql}
     GROUP BY artifact_type, primary_status`,
    [...ctes.params, ...filters.params],
  );
}

type FileRow = {
  id: string;
  workspace_id: string;
  organization_id: string;
  relative_path: string;
  created_at: number;
  sort_value: string;
  poster_file_id: string | null;
};

function fileCte(query: LibraryListQuery, includeHeld: boolean, search: string, sort?: LibrarySort): { sql: string; params: unknown[] } {
  const params: unknown[] = [query.workspaceId, includeHeld ? 1 : 0];
  const searchSql = searchClause(["f.relative_path"], search, params);
  const projectSql = query.projectId ? " AND 0 = 1" : "";
  const base = `file_raw AS (
    SELECT f.id, f.workspace_id, w.organization_id AS organization_id, f.relative_path, f.created_at,
           fp.poster_file_id AS poster_file_id,
           'file' AS artifact_type, 'approved' AS primary_status
    FROM library_file_selections s
    JOIN files f ON f.id = s.file_id
    LEFT JOIN file_posters fp ON fp.file_id = f.id
    JOIN workspaces w ON w.id = f.workspace_id
    JOIN batches b ON b.id = f.batch_id
    WHERE s.workspace_id = ? AND s.revoked_at IS NULL AND f.status = 'clean'
      AND NOT ${FILE_BUILD_CONTEXT_SQL}
      AND b.deleted_at IS NULL AND b.discarded_at IS NULL
      AND (? = 1 OR ((b.held_at IS NULL OR b.released_at IS NOT NULL) AND b.hidden_at IS NULL))
      ${projectSql}
      ${searchSql}
  ),
  file_base AS (
    SELECT file_raw.*,
           (
             WITH RECURSIVE path_parts(name, rest) AS (
               SELECT '', relative_path || '/'
               UNION ALL
               SELECT substr(rest, 1, instr(rest, '/') - 1), substr(rest, instr(rest, '/') + 1)
               FROM path_parts
               WHERE rest != ''
             )
             SELECT name FROM path_parts WHERE rest = '' LIMIT 1
           ) AS title
    FROM file_raw
  )`;
  return {
    params,
    sql: sort
      ? `${base}, file_sorted AS (
          SELECT file_base.*, ${simpleSortExpression(sort, "title", "created_at", "primary_status")} AS sort_value
          FROM file_base
        )`
      : base,
  };
}

function fileActiveFilters(query: LibraryListQuery, type: LibraryArtifactType | null): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.status) {
    clauses.push("primary_status = ?");
    params.push(query.status);
  }
  if (query.needsAction || query.platform) clauses.push("0 = 1");
  if (query.deliveredFrom != null) {
    clauses.push("created_at >= ?");
    params.push(query.deliveredFrom);
  }
  if (query.deliveredTo != null) {
    clauses.push("created_at <= ?");
    params.push(query.deliveredTo);
  }
  if (type) {
    clauses.push("artifact_type = ?");
    params.push(type);
  }
  return { sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "", params };
}

async function loadFiles(
  sql: Sql,
  query: LibraryListQuery,
  includeHeld: boolean,
  search: string,
  sort: LibrarySort,
  cursor: Cursor | null,
  type: LibraryArtifactType | null,
): Promise<FileRow[]> {
  const ctes = fileCte(query, includeHeld, search, sort);
  const filters = fileActiveFilters(query, type);
  const seek = seekClause(cursor, 2, "0");
  return sql.all<FileRow>(
    `WITH ${ctes.sql}
     SELECT id, workspace_id, organization_id, relative_path, created_at, sort_value, poster_file_id
     FROM file_sorted
     WHERE 1 = 1${filters.sql}${seek.sql}
     ORDER BY sort_value, id
     LIMIT ?`,
    [...ctes.params, ...filters.params, ...seek.params, LIBRARY_SOURCE_LIMIT],
  );
}

async function countFiles(sql: Sql, query: LibraryListQuery, includeHeld: boolean, search: string): Promise<CountRow[]> {
  const ctes = fileCte(query, includeHeld, search);
  const filters = fileActiveFilters(query, null);
  return sql.all<CountRow>(
    `WITH ${ctes.sql}
     SELECT artifact_type, primary_status, COUNT(*) AS count
     FROM file_base
     WHERE 1 = 1${filters.sql}
     GROUP BY artifact_type, primary_status`,
    [...ctes.params, ...filters.params],
  );
}

async function loadTargets(sql: Sql, workspaceId: string, refs: { id: string; version: number }[]): Promise<TargetRow[]> {
  if (refs.length === 0) return [];
  const rows: TargetRow[] = [];
  for (let offset = 0; offset < refs.length; offset += LIBRARY_QUERY_BATCH_SIZE) {
    const batch = refs.slice(offset, offset + LIBRARY_QUERY_BATCH_SIZE);
    const marks = batch.map(() => "?").join(",");
    const ids = batch.map((ref) => ref.id);
    rows.push(...await sql.all<TargetRow>(
    `SELECT p.item_id, p.version, t.account_id, t.platform, t.outcome, t.public_url, t.error AS target_error, p.status AS post_status, p.published_urls, a.display_name
     FROM social_posts p
     JOIN deliverables d ON d.id = p.deliverable_id
     LEFT JOIN social_post_targets t ON t.post_id = p.id
     LEFT JOIN social_accounts a ON a.id = t.account_id
     WHERE d.workspace_id = ? AND p.item_id IN (${marks})`,
    [workspaceId, ...ids],
    ));
  }
  return rows;
}

async function loadPromotions(
  sql: Sql,
  workspaceId: string,
  refs: { id: string; version: number }[],
): Promise<PromotionEdge[]> {
  if (refs.length === 0) return [];
  const marks = refs.map(() => "?").join(",");
  const ids = refs.map((ref) => ref.id);
  const rows = await sql.all<{
    source_id: string;
    source_version: number;
    source_deliverable_id: string;
    source_deliverable_title: string;
    target_id: string;
    target_version: number;
    target_title: string;
  }>(
    `SELECT r.source_id, r.source_version, si.deliverable_id AS source_deliverable_id,
            sd.title AS source_deliverable_title, r.target_id, r.target_version, ti.title AS target_title
     FROM artifact_relations r
     JOIN deliverable_items si ON si.id = r.source_id AND si.version = r.source_version
     JOIN deliverables sd ON sd.id = si.deliverable_id
     JOIN deliverable_items ti ON ti.id = r.target_id AND ti.version = r.target_version
     WHERE r.workspace_id = ? AND r.relation_kind = 'promotes' AND r.target_kind = 'deliverable_item'
       AND (r.source_id IN (${marks}) OR r.target_id IN (${marks}))`,
    [workspaceId, ...ids, ...ids],
  );
  return rows.map((row) => ({
    sourceId: row.source_id,
    sourceVersion: row.source_version,
    sourceDeliverableId: row.source_deliverable_id,
    sourceDeliverableTitle: row.source_deliverable_title,
    targetId: row.target_id,
    targetVersion: row.target_version,
    targetTitle: row.target_title,
  }));
}

export async function staffLibrarySummaries(
  sql: Sql,
  caller: Caller,
  spaces: { id: string; slug: string; display_name: string }[],
): Promise<{ workspaceId: string; slug: string; name: string; counts: Record<string, number>; reviewNeeded: number; recent: { title: string; status: string }[]; viewLinks: { live: number; revoked: number } }[]> {
  return Promise.all(spaces.map(async (space) => {
    const [listed, links] = await Promise.all([
      listLibraryArtifacts(sql, caller, { workspaceId: space.id, slug: space.slug, includeHeld: true }),
      listViewLinks(sql, caller, space.id),
    ]);
    const artifacts = listed.ok ? listed.page.artifacts : [];
    const shares = links.ok ? links.shares : [];
    return {
      workspaceId: space.id,
      slug: space.slug,
      name: space.display_name,
      counts: listed.ok ? listed.page.counts : {},
      reviewNeeded: listed.ok ? listed.page.needsAction : 0,
      recent: artifacts.slice(0, 3).map((artifact) => ({ title: artifact.title, status: artifact.primaryStatus })),
      viewLinks: { live: shares.filter((share) => share.revokedAt == null).length, revoked: shares.filter((share) => share.revokedAt != null).length },
    };
  }));
}
