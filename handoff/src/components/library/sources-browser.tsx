import Link from "next/link";
import { filterSourceFiles, folderBreadcrumbs, type SourceListFile } from "@/lib/source-provenance";
import { selectSourceAction, revokeSourceAction } from "@/app/w/[slug]/sources-actions";

export function SourcesBrowser({
  slug,
  files,
  query,
  canSelect,
}: {
  slug: string;
  files: SourceListFile[];
  query: { search?: string; status?: string; sort?: string; folder?: string };
  canSelect: boolean;
}) {
  const shown = filterSourceFiles(files, query);
  const crumbs = query.folder ? folderBreadcrumbs(`${query.folder}/file`) : [{ name: "Files", path: "" }];
  return (
    <section className="flex flex-col gap-4">
      <nav aria-label="Folder" className="flex flex-wrap gap-2 text-sm">
        {crumbs.map((crumb) => (
          <Link key={crumb.path || "root"} className="inline-flex min-h-11 items-center underline" href={crumb.path ? `/w/${slug}?folder=${encodeURIComponent(crumb.path)}` : `/w/${slug}`}>
            {crumb.name}
          </Link>
        ))}
      </nav>
      <form className="grid gap-3 sm:grid-cols-3" action={`/w/${slug}`}>
        <label className="flex flex-col gap-1 text-sm">
          Search
          <input name="q" defaultValue={query.search ?? ""} className="min-h-11 rounded-md border border-border px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select name="status" defaultValue={query.status ?? ""} className="min-h-11 rounded-md border border-border px-3">
            <option value="">Any</option>
            <option value="clean">Clean</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="held">Held</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sort
          <select name="sort" defaultValue={query.sort ?? "name"} className="min-h-11 rounded-md border border-border px-3">
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
              <form action={(file.selected ? revokeSourceAction : selectSourceAction) as unknown as (formData: FormData) => Promise<void>}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="fileId" value={file.id} />
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
