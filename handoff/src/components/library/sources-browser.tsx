import Link from "next/link";
import { filterSourceFiles, folderBreadcrumbs, type SourceListFile } from "@/lib/source-provenance";
import { toggleSourceAction } from "@/app/w/[slug]/sources-actions";

export function SourcesBrowser({
  slug,
  files,
  query,
  canSelect,
  listPath,
  persist = {},
}: {
  slug: string;
  files: SourceListFile[];
  query: { search?: string; status?: string; sort?: string; folder?: string };
  canSelect: boolean;
  listPath?: string;
  persist?: Record<string, string | undefined>;
}) {
  const shown = filterSourceFiles(files, query);
  const root = listPath ?? `/w/${slug}`;
  const crumbs = query.folder ? folderBreadcrumbs(`${query.folder}/file`) : [{ name: "Files", path: "" }];
  function hrefFor(folder: string): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(persist)) if (value) params.set(key, value);
    if (folder) params.set("folder", folder);
    const search = params.toString();
    return `${root}${search ? `?${search}` : ""}`;
  }
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <p className="eyebrow text-optic">Sources</p>
        <h2 className="font-heading text-2xl">Choose what belongs in the Library</h2>
      </div>
      <nav aria-label="Folder" className="flex flex-wrap gap-2 text-sm">
        {crumbs.map((crumb, index) => (
          <span key={crumb.path || "root"} className="inline-flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            <Link className="inline-flex min-h-11 items-center underline" href={hrefFor(crumb.path)}>
              {crumb.name}
            </Link>
          </span>
        ))}
      </nav>
      <form className="grid gap-3 sm:grid-cols-3" action={root}>
        {Object.entries(persist).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
        <label className="flex flex-col gap-1 text-sm">
          Search
          <input name={root.includes("/library") ? "search" : "q"} defaultValue={query.search ?? ""} className="min-h-11 rounded-md border border-border bg-background px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select name="scan" defaultValue={query.status ?? ""} className="min-h-11 rounded-md border border-border bg-background px-3">
            <option value="">Any</option>
            <option value="clean">Clean</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="held">Held</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sort
          <select name="fileSort" defaultValue={query.sort ?? "name"} className="min-h-11 rounded-md border border-border bg-background px-3">
            <option value="name">Name</option>
            <option value="date">Date</option>
            <option value="status">Status</option>
          </select>
        </label>
        {query.folder ? <input type="hidden" name="folder" value={query.folder} /> : null}
        <button type="submit" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm">Apply</button>
      </form>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">No files match.</p> : null}
      <ul className="flex flex-col gap-3">
        {shown.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div>
              <Link className="text-sm underline" href={`/w/${slug}/files/${file.id}`}>{file.name}</Link>
              <p className="text-sm text-muted-foreground">{file.status}{file.selected ? " · In the Library" : ""}</p>
            </div>
            {canSelect && file.status === "clean" ? (
              <form action={toggleSourceAction}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="fileId" value={file.id} />
                <input type="hidden" name="selected" value={file.selected ? "1" : "0"} />
                <button type="submit" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm">
                  {file.selected ? "Remove from Library" : "Show in Library"}
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
