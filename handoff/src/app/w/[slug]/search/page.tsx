import { notFound } from "next/navigation";
import { openSearchDb } from "@/db/open-search";
import { workspacesFor } from "@/db/records";
import { clock } from "@/lib/clock";
import { openSession } from "@/lib/current";
import { canSeeSpaceSearch, loadSearchTab } from "@/lib/search/search-tab";
import { SearchReportView } from "@/components/search/search-report-view";

/**
 * The client's own Search page. Every member of the space can see it (canSeeSpaceSearch). The organization comes from
 * the space, never from the URL, so a client only sees their own organization's properties.
 */
export default async function SpaceSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ property?: string; range?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace || !canSeeSpaceSearch(caller, workspace.id)) notFound();
  const organization = await sql.get<{ id: string }>(
    "SELECT o.id FROM workspaces w JOIN organizations o ON o.id = w.organization_id WHERE w.id = ?",
    [workspace.id],
  );
  if (!organization) notFound();
  const search = await loadSearchTab(sql, await openSearchDb(), {
    organizationId: organization.id,
    property: query.property,
    range: query.range,
    sort: query.sort,
    now: clock(),
  });
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-[4rem]">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-4xl leading-tight">Search</h1>
        <p className="text-sm text-muted-foreground">How people find you on Google: clicks, impressions, the terms they searched and the pages they landed on.</p>
      </div>
      <SearchReportView
        audience="client"
        basePath={`/w/${workspace.slug}/search`}
        properties={search.properties}
        property={search.property}
        report={search.report}
        range={search.range}
        sort={search.sort}
      />
    </main>
  );
}
