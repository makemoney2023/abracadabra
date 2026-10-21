import Link from "next/link";
import type { LibraryArtifact } from "@/lib/library-artifacts";
import type { LibraryPage } from "@/lib/library-queries";
import { ArtifactCard, LibraryEmpty } from "./artifact-card";
import { LIBRARY_SORTS, LIBRARY_TABS, emptyLibraryCopy, libraryHref, nextLibraryHref } from "./library-view";

export function LibraryBrowser({
  slug,
  page,
  query,
  error,
}: {
  slug: string;
  page: LibraryPage | null;
  query: Record<string, string | undefined>;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-2" aria-label="Library types">
        {LIBRARY_TABS.map((tab) => (
          <Link key={tab.type} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm" href={libraryHref(slug, { ...query, type: tab.type === "all" ? undefined : tab.type, cursor: undefined })}>
            {tab.label}
          </Link>
        ))}
      </nav>
      <form className="grid gap-3 sm:grid-cols-2" action={`/w/${slug}/library`}>
        <label className="flex flex-col gap-1 text-sm">
          Search
          <input name="search" defaultValue={query.search ?? ""} className="min-h-11 rounded-md border border-border px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <input name="status" defaultValue={query.status ?? ""} className="min-h-11 rounded-md border border-border px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sort
          <select name="sort" defaultValue={query.sort ?? "delivered"} className="min-h-11 rounded-md border border-border px-3">
            {LIBRARY_SORTS.map((sort) => (
              <option key={sort.sort} value={sort.sort}>{sort.label}</option>
            ))}
          </select>
        </label>
        <input type="hidden" name="type" value={query.type ?? ""} />
        <button type="submit" className="min-h-11 rounded-md border border-border px-3 text-sm">Apply</button>
        <Link className="inline-flex min-h-11 items-center text-sm underline" href={libraryHref(slug, {})}>Clear filters</Link>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      <ul className="grid grid-cols-1 gap-4">
        {!page || page.artifacts.length === 0 ? <li><LibraryEmpty message={emptyLibraryCopy({ search: query.search, type: query.type })} /></li> : page.artifacts.map((artifact: LibraryArtifact) => (
          <li key={artifact.artifactKey}><ArtifactCard artifact={artifact} /></li>
        ))}
      </ul>
      {page?.nextCursor ? <Link className="inline-flex min-h-11 items-center text-sm underline" href={nextLibraryHref(slug, query, page.nextCursor)}>Next</Link> : null}
    </div>
  );
}
