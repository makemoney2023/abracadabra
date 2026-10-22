import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { LibraryBrowser } from "@/components/library/library-browser";
import { SourcesBrowser } from "@/components/library/sources-browser";
import { can } from "@/lib/authz";
import { articleSocialPromoEnabled } from "@/lib/article-promotions";
import { libraryViewLinksEnabled, listViewLinks } from "@/lib/library-shares";
import { workspacesFor } from "@/db/records";
import { listFolderFiles } from "@/lib/downloads";
import { seesHeldWork } from "@/lib/held-work";
import { isHqHost } from "@/lib/host";
import { listLibraryArtifacts, type LibrarySort } from "@/lib/library-queries";
import type { LibraryArtifactType, LibraryStatus } from "@/lib/library-artifacts";
import { openSession } from "@/lib/current";
import { createArticlePromotionAction } from "@/app/deliverables/[id]/article-promotion-actions";
import { recordLibraryMetric } from "@/lib/library-metrics";

const TYPES = new Set(["article", "social", "video", "image", "website", "document", "file"]);
const STATUSES = new Set(["changes_requested", "needs_attention", "needs_review", "publishing", "scheduled", "partially_published", "published", "ready", "approved", "draft"]);
const SORTS = new Set(["delivered", "updated", "published", "title", "needs_action"]);

function utcDay(value: string | undefined, end: boolean): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(time) ? undefined : time;
}

export default async function LibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const read = (key: string) => {
    const value = query[key];
    return typeof value === "string" ? value : undefined;
  };
  const type = read("type");
  const status = read("status");
  const sort = read("sort");
  const result = await listLibraryArtifacts(sql, caller, {
    workspaceId: workspace.id,
    slug,
    type: type && TYPES.has(type) ? type as LibraryArtifactType : "all",
    status: status && STATUSES.has(status) ? status as LibraryStatus : undefined,
    sort: sort && SORTS.has(sort) ? sort as LibrarySort : "delivered",
    search: read("search"),
    platform: read("platform"),
    projectId: read("project"),
    cursor: read("cursor"),
    needsAction: read("needs") === "1",
    includeHeld: seesHeldWork(caller, workspace.id),
    deliveredFrom: utcDay(read("from"), false),
    deliveredTo: utcDay(read("to"), true),
  });
  const filters = {
    type: read("type"),
    status: read("status"),
    sort: read("sort"),
    search: read("search"),
    platform: read("platform"),
    project: read("project"),
    needs: read("needs"),
    from: read("from"),
    to: read("to"),
  };
  const host = (await headers()).get("host") ?? "";
  const canManageLinks = libraryViewLinksEnabled() && can(caller, "view_link.manage", { workspaceId: workspace.id });
  const shares = canManageLinks ? await listViewLinks(sql, caller, workspace.id) : null;
  const canPromote = isHqHost(host) && articleSocialPromoEnabled() && can(caller, "article_promotion.create", { workspaceId: workspace.id });
  const canSelect = type === "file" && can(caller, "library_file.select", { workspaceId: workspace.id });
  const sourceFiles = canSelect ? await listFolderFiles(sql, caller, workspace.id) : [];
  const selected = canSelect
    ? await sql.all<{ file_id: string }>("SELECT file_id FROM library_file_selections WHERE workspace_id = ? AND revoked_at IS NULL", [workspace.id])
    : [];
  const selectedIds = new Set(selected.map((row) => row.file_id));
  const organization = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM workspaces WHERE id = ?", [workspace.id]);
  if (result.ok && !read("cursor") && organization?.organization_id) {
    await recordLibraryMetric(sql, {
      name: "library_listed",
      organizationId: organization.organization_id,
      workspaceId: workspace.id,
      actorId: caller.userId,
      count: result.page.counts.total,
    });
    if (read("search") && result.page.counts.total === 0) {
      await recordLibraryMetric(sql, {
        name: "library_search_empty",
        organizationId: organization.organization_id,
        workspaceId: workspace.id,
        actorId: caller.userId,
        count: 0,
      });
    }
  }
  return (
    <main className="mx-auto flex w-full max-w-[76rem] flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow text-optic">Finished work</p>
        <h1 className="font-heading text-4xl leading-tight">Library</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Articles, social posts, pictures, video, websites, and the source files the studio has put in front of you.</p>
      </div>
      {canSelect ? (
        <SourcesBrowser
          slug={slug}
          canSelect
          listPath={`/w/${slug}/library`}
          persist={{ type: "file" }}
          query={{ search: read("search"), status: read("scan"), sort: read("fileSort"), folder: read("folder") }}
          files={sourceFiles.map((file) => ({
            id: file.id,
            name: file.name,
            status: file.status,
            updatedAt: file.createdAt,
            selected: selectedIds.has(file.id),
          }))}
        />
      ) : null}
      <LibraryBrowser
        slug={slug}
        page={result.ok ? result.page : null}
        query={filters}
        error={result.ok ? null : "Check the search and try again."}
        viewLink={canManageLinks && shares?.ok ? { workspaceId: workspace.id, shares: shares.shares } : null}
        promotionAction={canPromote ? createArticlePromotionAction : null}
      />
    </main>
  );
}
