import Link from "next/link";
import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { FilingSummaryCard } from "@/components/filing-summary-card";
import { parseFilingSummary } from "@/lib/filing-summary";
import { batchVisibleTo, seesHeldWork } from "@/lib/held-work";
import { openSession } from "@/lib/current";
import { VideoPlayer } from "@/components/video-player";
import { previewKind, previewableStatus, readPreviewFile } from "@/lib/preview";
import { fileProvenance, folderBreadcrumbs } from "@/lib/source-provenance";

type FileRow = {
  id: string;
  relative_path: string;
  status: string;
  object_deleted_at: number | null;
  discarded_at: number | null;
  deleted_at: number | null;
  held_at: number | null;
  released_at: number | null;
  hidden_at: number | null;
};

export default async function FilePreviewPage({
  params,
}: {
  params: Promise<{ slug: string; fileId: string }>;
}) {
  const { slug, fileId } = await params;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  if (!can(caller, "file.download", { workspaceId: workspace.id })) notFound();
  const row = await sql.get<FileRow>(
    `SELECT f.id, f.relative_path, f.status, f.object_deleted_at, b.discarded_at, b.deleted_at, b.held_at, b.released_at, b.hidden_at
     FROM files f
     JOIN batches b ON b.id = f.batch_id AND b.workspace_id = f.workspace_id
     WHERE f.id = ? AND f.workspace_id = ?`,
    [fileId, workspace.id],
  );
  if (!row || row.object_deleted_at !== null || row.discarded_at !== null || row.deleted_at !== null) {
    notFound();
  }
  if (!batchVisibleTo(caller, workspace.id, row)) notFound();
  const kind = previewKind(row.relative_path);
  const name = row.relative_path.split("/").pop() ?? row.relative_path;
  const ready = previewableStatus(row.status) && kind !== "none";
  // A clip is streamed by the preview route, so the page does not load its bytes; the access checks already passed above.
  const shown = ready && kind !== "video" ? await readPreviewFile({ sql, caller, fileId }) : null;
  const poster = kind === "video"
    ? await sql.get<{ poster_file_id: string }>("SELECT poster_file_id FROM file_posters WHERE file_id = ?", [fileId])
    : undefined;
  const text =
    shown?.ok && shown.file.kind === "text"
      ? new TextDecoder("utf-8", { fatal: false }).decode(shown.file.bytes)
      : "";
  // An agent filing's summary page reads as the same card as Finished work; clients never see its internal ids.
  const filing = /\.md$/i.test(name) ? parseFilingSummary(text) : null;
  const viewer = seesHeldWork(caller, workspace.id) || caller.staff ? "staff" : "client";
  const provenance = await fileProvenance(sql, workspace.id, fileId, workspace.slug);

  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-1 flex-col gap-6 px-6 py-10">
      <nav aria-label="Folder" className="flex flex-wrap gap-2 text-sm">
        {folderBreadcrumbs(row.relative_path).map((crumb) => (
          <Link key={crumb.path || "root"} className="inline-flex min-h-11 items-center underline" href={crumb.path ? `/w/${slug}?folder=${encodeURIComponent(crumb.path)}` : `/w/${slug}`}>
            {crumb.name}
          </Link>
        ))}
      </nav>
      <Link href={`/w/${workspace.slug}`} className="text-sm">
        Back to files
      </Link>
      {provenance.usedIn.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium">Used in</h2>
          <ul>
            {provenance.usedIn.map((link) => (
              <li key={link.href}><Link className="text-sm underline" href={link.href}>{link.title}</Link></li>
            ))}
          </ul>
        </section>
      ) : null}
      {provenance.deliveredAs.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium">Delivered as</h2>
          <ul>
            {provenance.deliveredAs.map((link) => (
              <li key={`${link.href}-delivered`}><Link className="text-sm underline" href={link.href}>{link.title}</Link></li>
            ))}
          </ul>
        </section>
      ) : null}
      <h1 className="font-heading text-4xl leading-tight">{name}</h1>
      {kind === "none" ? <p>We cannot show this kind of file.</p> : null}
      {kind !== "none" && !previewableStatus(row.status) ? <p>This file is not ready to look at yet.</p> : null}
      {shown?.ok && shown.file.kind === "image" ? (
        // The picture is a same-origin file served only when this caller can see the space.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${fileId}/preview`} alt={name} className="max-h-[70vh] max-w-full rounded-lg border border-border" />
      ) : null}
      {ready && kind === "video" ? (
        <VideoPlayer
          src={`/api/files/${fileId}/preview`}
          poster={poster ? `/api/files/${poster.poster_file_id}/preview` : null}
          title={name}
          name={row.relative_path}
        />
      ) : null}
      {shown?.ok && shown.file.kind === "pdf" ? (
        <iframe
          title={name}
          src={`/api/files/${fileId}/preview`}
          className="h-[70vh] w-full rounded-lg border border-border"
        />
      ) : null}
      {filing ? <FilingSummaryCard summary={filing} viewer={viewer} raw={viewer === "staff" ? text : undefined} /> : null}
      {!filing && shown?.ok && shown.file.kind === "text" ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-sm">{text}</pre>
      ) : null}
      {ready && kind !== "video" && !shown?.ok ? <p>This file is not ready to look at yet.</p> : null}
      <p className="text-sm text-muted-foreground">
        You can look at this file here. A download link appears on the file list when the check is done.
      </p>
    </main>
  );
}
