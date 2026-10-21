import type { Caller } from "@/lib/authz";
import { can } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { seesHeldWork } from "@/lib/held-work";
import { listViewLinks } from "@/lib/library-shares";
import { localPublication } from "@/lib/social-queries";
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
const FAMILY_LIMIT = 100;
const TIME_BASE = 1_000_000_000_000_000;

export type LibrarySort = "delivered" | "updated" | "published" | "title" | "needs_action";

export type LibraryListQuery = {
  workspaceId: string;
  type?: LibraryArtifactType | "all";
  status?: LibraryStatus;
  projectId?: string;
  platform?: string;
  needsAction?: boolean;
  search?: string;
  sort?: LibrarySort;
  cursor?: string | null;
  includeHeld?: boolean;
  slug?: string;
};

export type LibraryPage = {
  artifacts: LibraryArtifact[];
  nextCursor: string | null;
  counts: Record<string, number>;
};

type Cursor = { sort: string; rank: number; id: string; version: number };
type Candidate = Cursor & { artifact: LibraryArtifact };

const NEEDS_ACTION = new Set<LibraryStatus>(["changes_requested", "needs_attention", "needs_review"]);

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (!parsed || typeof parsed.sort !== "string" || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function like(value: string): string {
  return `%${value.toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function timeKey(value: number | null | undefined): string {
  const time = value ?? 0;
  return String(TIME_BASE - time).padStart(16, "0");
}

function after(row: Cursor, cursor: Cursor | null): boolean {
  if (!cursor) return true;
  if (row.sort > cursor.sort) return true;
  if (row.sort < cursor.sort) return false;
  if (row.rank > cursor.rank) return true;
  if (row.rank < cursor.rank) return false;
  if (row.id > cursor.id) return true;
  if (row.id < cursor.id) return false;
  return row.version > cursor.version;
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
  article_status: string | null;
};

type TargetRow = {
  item_id: string;
  version: number;
  platform: string;
  outcome: string | null;
  public_url: string | null;
  target_error: string | null;
  post_status: string;
  published_urls: string | null;
  display_name: string | null;
};

function targetsFor(rows: TargetRow[], itemId: string, version: number): { destinations: DestinationInput[]; postStatus: string | null } {
  const matched = rows.filter((row) => row.item_id === itemId && row.version === version);
  let urls: Record<string, string> = {};
  try {
    urls = JSON.parse(matched.find((row) => row.published_urls)?.published_urls ?? "{}") as Record<string, string>;
  } catch {
    urls = {};
  }
  const destinations: DestinationInput[] = matched.flatMap((row) => {
    if (!row.platform) return [];
    return [{
      platform: row.platform,
      outcome: row.outcome ?? row.post_status,
      url: row.public_url ?? Object.values(urls)[0] ?? null,
      staffReason: row.target_error,
    }];
  });
  return { destinations, postStatus: matched[0]?.post_status ?? null };
}

function sortKey(sort: LibrarySort, input: { delivered: number | null; updated: number; published: number | null; title: string; status: LibraryStatus }): string {
  if (sort === "title") return input.title.toLowerCase();
  if (sort === "updated") return timeKey(input.updated);
  if (sort === "published") return timeKey(input.published ?? input.delivered ?? input.updated);
  if (sort === "needs_action") {
    const rank = NEEDS_ACTION.has(input.status) ? "0" : "1";
    return `${rank}:${timeKey(input.updated)}`;
  }
  return timeKey(input.delivered ?? input.updated);
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
  const type = query.type && query.type !== "all" ? query.type : null;
  const [items, sites, files, targets, counts] = await Promise.all([
    loadItems(sql, query, includeHeld, search, type),
    loadSites(sql, query, includeHeld, search, type),
    loadFiles(sql, query, includeHeld, search, type),
    loadTargets(sql, query.workspaceId),
    countFamilies(sql, query, includeHeld, search),
  ]);
    const candidates = [...projectItems(items, targets, audience, sort, query), ...projectSites(sites, audience, sort), ...projectFiles(files, audience, sort, query.slug ?? query.workspaceId)]
    .filter((row) => !type || row.artifact.artifactType === type)
    .filter((row) => !query.status || row.artifact.primaryStatus === query.status)
    .filter((row) => !query.needsAction || NEEDS_ACTION.has(row.artifact.primaryStatus))
    .filter((row) => !query.platform || row.artifact.destinations.some((destination) => destination.platform === query.platform))
    .filter((row) => after(row, cursor))
    .sort((left, right) => left.sort.localeCompare(right.sort) || left.rank - right.rank || left.id.localeCompare(right.id) || left.version - right.version);
  const page = candidates.slice(0, LIBRARY_PAGE_SIZE);
  const next = candidates[LIBRARY_PAGE_SIZE];
  return {
    ok: true,
    page: {
      artifacts: page.map((row) => row.artifact),
      nextCursor: next ? encodeCursor(next) : null,
      counts,
    },
  };
}

function projectItems(rows: ItemRow[], targets: TargetRow[], audience: LibraryAudience, sort: LibrarySort, query: LibraryListQuery): Candidate[] {
  return rows.map((row) => {
    const attached = targetsFor(targets, row.id, row.version);
    const approval = approvalOf(row.status, row.deliverable_status);
    const artifactType = row.artifact_type;
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
      artifactTypeOverride: row.artifact_type,
      canonicalUrl: row.canonical_url ?? row.link_url,
      dek: row.dek,
      authorName: row.author_name,
      publishedAt: delivered,
      approval,
      publication,
      updatedAt: row.updated_at,
      audience,
      destinations: attached.destinations,
      href: `/w/${query.slug ?? query.workspaceId}/work/${row.deliverable_id}`,
    });
    const key = sortKey(sort, { delivered, updated: row.updated_at, published: row.external_published_at, title: row.title, status: artifact.primaryStatus });
    return { sort: key, rank: 0, id: row.id, version: row.version, artifact };
  });
}

function projectSites(rows: { id: string; organization_id: string; workspace_id: string; title: string; live_url: string | null; preview_url: string | null; created_at: number; description: string | null }[], audience: LibraryAudience, sort: LibrarySort): Candidate[] {
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
    return { sort: sortKey(sort, { delivered: row.created_at, updated: row.created_at, published: row.created_at, title: row.title, status: artifact.primaryStatus }), rank: 1, id: row.id, version: 0, artifact };
  });
}

function projectFiles(rows: { id: string; workspace_id: string; organization_id: string; relative_path: string; created_at: number }[], audience: LibraryAudience, sort: LibrarySort, slug: string): Candidate[] {
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
    });
    return { sort: sortKey(sort, { delivered: row.created_at, updated: row.created_at, published: null, title: artifact.title, status: artifact.primaryStatus }), rank: 2, id: row.id, version: 0, artifact };
  });
}

function searchClause(columns: string[], search: string, params: unknown[]): string {
  if (!search) return "";
  const pattern = like(search);
  params.push(...columns.map(() => pattern));
  return ` AND (${columns.map((column) => `lower(COALESCE(${column}, '')) LIKE ? ESCAPE '\\'`).join(" OR ")})`;
}

async function loadItems(sql: Sql, query: LibraryListQuery, includeHeld: boolean, search: string, type: LibraryArtifactType | null): Promise<ItemRow[]> {
  if (type && type !== "article" && type !== "social" && type !== "video" && type !== "image" && type !== "document") return [];
  const params: unknown[] = [query.workspaceId, includeHeld ? 1 : 0];
  let typeSql = "";
  if (type === "article") typeSql = " AND (m.artifact_type = 'article' OR (i.format = 'link' AND m.id IS NOT NULL))";
  if (type === "document") typeSql = " AND i.format IN ('page', 'file', 'link') AND COALESCE(m.artifact_type, '') != 'article'";
  if (type === "social") typeSql = " AND (i.channel IS NOT NULL OR m.artifact_type = 'social')";
  if (type === "video") typeSql = " AND i.format IN ('video', 'ad_video') AND i.channel IS NULL";
  if (type === "image") typeSql = " AND i.format IN ('static', 'carousel', 'story', 'ad_static', 'ad_carousel') AND i.channel IS NULL AND COALESCE(m.artifact_type, '') != 'article'";
  const projectSql = query.projectId ? " AND d.project_id = ?" : "";
  if (query.projectId) params.push(query.projectId);
  const searchSql = searchClause(["i.title", "m.dek", "m.canonical_url", "i.link_url", "projects.name"], search, params);
  params.push(FAMILY_LIMIT);
  return sql.all<ItemRow>(
    `SELECT i.id, i.version, i.title, i.format, i.channel, i.copy_text, i.link_url, i.status,
            d.id AS deliverable_id, d.organization_id, d.workspace_id, d.project_id, projects.name AS project_name,
            d.status AS deliverable_status, d.published_at, d.updated_at,
            m.dek, m.canonical_url, m.author_name, m.external_published_at, m.artifact_type, m.article_status
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
       ${projectSql}
       ${typeSql}
       ${searchSql}
     ORDER BY COALESCE(d.published_at, m.external_published_at, d.updated_at) DESC, i.id, i.version
     LIMIT ?`,
    [query.workspaceId, includeHeld ? 1 : 0, includeHeld ? 1 : 0, ...params.slice(2)],
  );
}

async function loadSites(sql: Sql, query: LibraryListQuery, includeHeld: boolean, search: string, type: LibraryArtifactType | null) {
  if (type && type !== "website") return [];
  const params: unknown[] = [query.workspaceId, includeHeld ? 1 : 0];
  const searchSql = searchClause(["bw.title", "bw.description", "bw.live_url"], search, params);
  params.push(FAMILY_LIMIT);
  return sql.all<{ id: string; organization_id: string; workspace_id: string; title: string; live_url: string | null; preview_url: string | null; created_at: number; description: string | null }>(
    `SELECT bw.id, bw.organization_id, bw.workspace_id, bw.title, bw.live_url, bw.preview_url, bw.created_at, bw.description
     FROM built_work bw
     JOIN agent_work_items w ON w.id = bw.work_item_id
     JOIN batches b ON b.id = bw.batch_id
     WHERE bw.workspace_id = ? AND w.state = 'filed' AND b.deleted_at IS NULL AND b.discarded_at IS NULL
       AND (? = 1 OR ((b.held_at IS NULL OR b.released_at IS NOT NULL) AND b.hidden_at IS NULL))
       ${searchSql}
     ORDER BY bw.created_at DESC, bw.id
     LIMIT ?`,
    params,
  );
}

async function loadFiles(sql: Sql, query: LibraryListQuery, includeHeld: boolean, search: string, type: LibraryArtifactType | null) {
  if (type && type !== "file") return [];
  const params: unknown[] = [query.workspaceId, includeHeld ? 1 : 0];
  const searchSql = searchClause(["f.relative_path"], search, params);
  params.push(FAMILY_LIMIT);
  return sql.all<{ id: string; workspace_id: string; organization_id: string; relative_path: string; created_at: number }>(
    `SELECT f.id, f.workspace_id, w.organization_id AS organization_id, f.relative_path, f.created_at
     FROM library_file_selections s
     JOIN files f ON f.id = s.file_id
     JOIN workspaces w ON w.id = f.workspace_id
     JOIN batches b ON b.id = f.batch_id
     WHERE s.workspace_id = ? AND s.revoked_at IS NULL AND f.status = 'clean'
       AND b.deleted_at IS NULL AND b.discarded_at IS NULL
       AND (? = 1 OR ((b.held_at IS NULL OR b.released_at IS NOT NULL) AND b.hidden_at IS NULL))
       ${searchSql}
     ORDER BY f.created_at DESC, f.id
     LIMIT ?`,
    params,
  );
}

async function loadTargets(sql: Sql, workspaceId: string): Promise<TargetRow[]> {
  return sql.all<TargetRow>(
    `SELECT p.item_id, p.version, t.platform, t.outcome, t.public_url, t.error AS target_error, p.status AS post_status, p.published_urls, a.display_name
     FROM social_posts p
     JOIN deliverables d ON d.id = p.deliverable_id
     LEFT JOIN social_post_targets t ON t.post_id = p.id
     LEFT JOIN social_accounts a ON a.id = t.account_id
     WHERE d.workspace_id = ?`,
    [workspaceId],
  );
}

async function countFamilies(sql: Sql, query: LibraryListQuery, includeHeld: boolean, search: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = { total: 0 };
  for (const type of LIBRARY_ARTIFACT_TYPES) counts[type] = 0;
  const [items, sites, files] = await Promise.all([
    loadItems(sql, { ...query, type: "all" }, includeHeld, search, null),
    loadSites(sql, query, includeHeld, search, null),
    loadFiles(sql, query, includeHeld, search, null),
  ]);
  for (const row of projectItems(items, [], "client", "delivered", query)) counts[row.artifact.artifactType] = (counts[row.artifact.artifactType] ?? 0) + 1;
  counts.website = sites.length;
  counts.file = files.length;
  counts.total = LIBRARY_ARTIFACT_TYPES.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
  return counts;
}

export async function staffLibrarySummaries(
  sql: Sql,
  caller: Caller,
  spaces: { id: string; slug: string; display_name: string }[],
): Promise<{ workspaceId: string; slug: string; name: string; counts: Record<string, number>; reviewNeeded: number; recent: { title: string; status: string }[]; viewLinks: { live: number; revoked: number } }[]> {
  const summaries = [];
  for (const space of spaces) {
    const [listed, review, links] = await Promise.all([
      listLibraryArtifacts(sql, caller, { workspaceId: space.id, slug: space.slug, includeHeld: true }),
      listLibraryArtifacts(sql, caller, { workspaceId: space.id, slug: space.slug, includeHeld: true, needsAction: true }),
      listViewLinks(sql, caller, space.id),
    ]);
    const artifacts = listed.ok ? listed.page.artifacts : [];
    const shares = links.ok ? links.shares : [];
    summaries.push({
      workspaceId: space.id,
      slug: space.slug,
      name: space.display_name,
      counts: listed.ok ? listed.page.counts : {},
      reviewNeeded: review.ok ? review.page.artifacts.length : 0,
      recent: artifacts.slice(0, 3).map((artifact) => ({ title: artifact.title, status: artifact.primaryStatus })),
      viewLinks: { live: shares.filter((share) => share.revokedAt == null).length, revoked: shares.filter((share) => share.revokedAt != null).length },
    });
  }
  return summaries;
}
