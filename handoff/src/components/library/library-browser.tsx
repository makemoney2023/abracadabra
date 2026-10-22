import Link from "next/link";
import type { LibraryArtifact } from "@/lib/library-artifacts";
import type { LibraryPage } from "@/lib/library-queries";
import { LibraryGallery } from "./library-gallery";
import { LIBRARY_PLATFORMS, LIBRARY_SORTS, LIBRARY_STATUS_LABEL, LIBRARY_TABS, emptyLibraryCopy, libraryHref, nextLibraryHref } from "./library-view";

type PromotionState = { message: string; href?: string };
type ShareSummary = { id: string; title: string | null; expiresAt: number | null; revokedAt: number | null };

export function LibraryTypeTabs({
  slug,
  query,
  counts,
}: {
  slug: string;
  query: Record<string, string | undefined>;
  counts?: Record<string, number> | null;
}) {
  const active = query.type || "all";
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Library types">
      {LIBRARY_TABS.map((tab) => {
        const selected = tab.type === active;
        const count = counts ? (tab.type === "all" ? counts.total : counts[tab.type]) : null;
        return (
          <Link
            key={tab.type}
            aria-current={selected ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${selected ? "border-optic bg-optic/10 text-optic" : "border-border"}`}
            href={libraryHref(slug, { ...query, type: tab.type === "all" ? undefined : tab.type, cursor: undefined })}
          >
            {tab.label}
            {typeof count === "number" ? <span className="tabular-nums">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function LibraryBrowser({
  slug,
  page,
  query,
  error,
  viewLink = null,
  promotionAction = null,
  promotionTargets = [],
  projects = [],
}: {
  slug: string;
  page: Pick<LibraryPage, "artifacts" | "nextCursor" | "counts"> | null;
  query: Record<string, string | undefined>;
  error?: string | null;
  viewLink?: { workspaceId: string; shares: ShareSummary[] } | null;
  promotionAction?: ((previous: PromotionState, formData: FormData) => Promise<PromotionState>) | null;
  promotionTargets?: { id: string; title: string }[];
  projects?: { id: string; name: string }[];
}) {
  const activeFilters = ["search", "status", "platform", "from", "to", "project", "needs"]
    .filter((key) => Boolean(query[key])).length;
  const emptyAction = query.search
    ? {
        label: "Clear search",
        href: libraryHref(slug, { ...query, search: undefined, cursor: undefined }),
      }
    : activeFilters > 0 || query.type
      ? { label: "Clear filters", href: libraryHref(slug, {}) }
      : null;
  return (
    <div className="flex flex-col gap-6">
      <LibraryFinder slug={slug} query={query} />
      <LibraryTypeTabs slug={slug} query={query} counts={page?.counts} />
      <details className="rounded-2xl border border-border bg-card" open={activeFilters > 0}>
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 text-sm font-medium">
          <span>Search and filters</span>
          <span className="text-muted-foreground">{activeFilters > 0 ? `${activeFilters} active` : "Optional"}</span>
        </summary>
        <form className="grid gap-3 border-t border-border p-4 md:grid-cols-4" action={`/w/${slug}/library`}>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Search
            <input name="search" defaultValue={query.search ?? ""} className="min-h-11 rounded-md border border-border bg-background px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Status
            <select name="status" defaultValue={query.status ?? ""} className="min-h-11 rounded-md border border-border bg-background px-3">
              <option value="">Any</option>
              {Object.entries(LIBRARY_STATUS_LABEL).map(([status, label]) => (
                <option key={status} value={status}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Platform
            <select name="platform" defaultValue={query.platform ?? ""} className="min-h-11 rounded-md border border-border bg-background px-3">
              <option value="">Any</option>
              {LIBRARY_PLATFORMS.map((platform) => (
                <option key={platform.id} value={platform.id}>{platform.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Project
            <select name="project" defaultValue={query.project ?? ""} className="min-h-11 rounded-md border border-border bg-background px-3">
              <option value="">Any</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            From
            <input name="from" type="date" defaultValue={query.from ?? ""} className="min-h-11 rounded-md border border-border bg-background px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            To
            <input name="to" type="date" defaultValue={query.to ?? ""} className="min-h-11 rounded-md border border-border bg-background px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Sort
            <select name="sort" defaultValue={query.sort ?? "delivered"} className="min-h-11 rounded-md border border-border bg-background px-3">
              {LIBRARY_SORTS.map((sort) => (
                <option key={sort.sort} value={sort.sort}>{sort.label}</option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input name="needs" type="checkbox" value="1" defaultChecked={query.needs === "1"} />
            Needs action
          </label>
          <input type="hidden" name="type" value={query.type ?? ""} />
          {query.removed ? <input type="hidden" name="removed" value="1" /> : null}
          <button type="submit" className="min-h-11 rounded-md bg-primary px-3 text-sm text-primary-foreground">Show results</button>
          <Link className="inline-flex min-h-11 items-center text-sm underline" href={libraryHref(slug, {})}>Clear filters</Link>
        </form>
      </details>
      {error ? <p role="alert">{error}</p> : null}
      <LibraryGallery
        artifacts={page?.artifacts ?? []}
        empty={emptyLibraryCopy({ search: query.search, type: query.type, removed: query.removed === "1" })}
        emptyAction={emptyAction}
        viewLink={viewLink}
        promotionAction={promotionAction}
        promotionTargets={promotionTargets}
      />
      {page?.nextCursor ? <Link className="inline-flex min-h-11 items-center text-sm underline" href={nextLibraryHref(slug, query, page.nextCursor)}>Next</Link> : null}
    </div>
  );
}

const FINDER_KEYS = ["type", "status", "platform", "project", "from", "to", "sort", "needs", "removed"] as const;

function LibraryFinder({ slug, query }: { slug: string; query: Record<string, string | undefined> }) {
  const looking = query.status === "needs_review" && query.removed !== "1";
  const removed = query.removed === "1";
  const tab = looking ? "border-optic bg-optic/10 text-optic" : "border-border";
  const removedTab = removed ? "border-optic bg-optic/10 text-optic" : "border-border";
  const all = !looking && !removed ? "border-optic bg-optic/10 text-optic" : "border-border";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${all}`} href={libraryHref(slug, { ...query, status: undefined, needs: undefined, removed: undefined, cursor: undefined })}>
        All
      </Link>
      <Link className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${tab}`} href={libraryHref(slug, { ...query, status: "needs_review", needs: undefined, removed: undefined, cursor: undefined })}>
        Needs a look
      </Link>
      <Link className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${removedTab}`} href={libraryHref(slug, { ...query, status: undefined, needs: undefined, removed: "1", cursor: undefined })}>
        Removed
      </Link>
      <form action={`/w/${slug}/library`} className="flex min-w-[12rem] flex-1 items-center gap-2">
        {FINDER_KEYS.map((key) => query[key] ? <input key={key} type="hidden" name={key} value={query[key]} /> : null)}
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          Search
          <input name="search" defaultValue={query.search ?? ""} className="min-h-11 w-full rounded-md border border-border bg-background px-3" />
        </label>
      </form>
    </div>
  );
}

export type { LibraryArtifact };
