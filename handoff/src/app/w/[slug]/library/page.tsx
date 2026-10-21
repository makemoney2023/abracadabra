import { notFound } from "next/navigation";
import { LibraryBrowser } from "@/components/library/library-browser";
import { ViewLinkDialog } from "@/components/library/view-link-dialog";
import { can } from "@/lib/authz";
import { libraryViewLinksEnabled } from "@/lib/library-shares";
import { workspacesFor } from "@/db/records";
import { seesHeldWork } from "@/lib/held-work";
import { listLibraryArtifacts, type LibrarySort } from "@/lib/library-queries";
import type { LibraryArtifactType, LibraryStatus } from "@/lib/library-artifacts";
import { openSession } from "@/lib/current";

const TYPES = new Set(["article", "social", "video", "image", "website", "document", "file"]);
const STATUSES = new Set(["changes_requested", "needs_attention", "needs_review", "publishing", "scheduled", "partially_published", "published", "ready", "approved", "draft"]);
const SORTS = new Set(["delivered", "updated", "published", "title", "needs_action"]);

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
  });
  const filters = { type: read("type"), status: read("status"), sort: read("sort"), search: read("search"), platform: read("platform"), project: read("project"), needs: read("needs") };
  const viewItems = result.ok
    ? result.page.artifacts.flatMap((artifact) => {
        if (artifact.sourceKind !== "deliverable_item" && artifact.sourceKind !== "built_work" && artifact.sourceKind !== "file") return [];
        return [{ resourceKind: artifact.sourceKind, resourceId: artifact.sourceId, resourceVersion: artifact.version ?? 0 }];
      })
    : [];
  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-1 flex-col gap-6 px-6 py-[4rem]">
      <h1 className="font-heading text-4xl leading-tight">Library</h1>
      {libraryViewLinksEnabled() && can(caller, "view_link.manage", { workspaceId: workspace.id }) ? (
        <ViewLinkDialog workspaceId={workspace.id} items={viewItems} />
      ) : null}
      <LibraryBrowser slug={slug} page={result.ok ? result.page : null} query={filters} error={result.ok ? null : "Check the search and try again."} />
    </main>
  );
}
