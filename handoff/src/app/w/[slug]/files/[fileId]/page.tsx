import Link from "next/link";
import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { openSession } from "@/lib/current";
import { previewKind, previewableStatus, readPreviewFile } from "@/lib/preview";

type FileRow = {
  id: string;
  relative_path: string;
  status: string;
  object_deleted_at: number | null;
  discarded_at: number | null;
  deleted_at: number | null;
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
    `SELECT f.id, f.relative_path, f.status, f.object_deleted_at, b.discarded_at, b.deleted_at
     FROM files f
     JOIN batches b ON b.id = f.batch_id AND b.workspace_id = f.workspace_id
     WHERE f.id = ? AND f.workspace_id = ?`,
    [fileId, workspace.id],
  );
  if (!row || row.object_deleted_at !== null || row.discarded_at !== null || row.deleted_at !== null) {
    notFound();
  }
  const kind = previewKind(row.relative_path);
  const name = row.relative_path.split("/").pop() ?? row.relative_path;
  const ready = previewableStatus(row.status) && kind !== "none";
  const shown = ready ? await readPreviewFile({ sql, caller, fileId }) : null;
  const text =
    shown?.ok && shown.file.kind === "text"
      ? new TextDecoder("utf-8", { fatal: false }).decode(shown.file.bytes)
      : "";

  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-1 flex-col gap-6 px-6 py-10">
      <Link href={`/w/${workspace.slug}`} className="text-sm">
        Back to files
      </Link>
      <h1 className="font-heading text-4xl leading-tight">{name}</h1>
      {kind === "none" ? <p>We cannot show this kind of file.</p> : null}
      {kind !== "none" && !previewableStatus(row.status) ? <p>This file is not ready to look at yet.</p> : null}
      {shown?.ok && shown.file.kind === "image" ? (
        // The picture is a same-origin file served only when this caller can see the space.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${fileId}/preview`} alt={name} className="max-h-[70vh] max-w-full rounded-lg border border-border" />
      ) : null}
      {shown?.ok && shown.file.kind === "pdf" ? (
        <iframe
          title={name}
          src={`/api/files/${fileId}/preview`}
          className="h-[70vh] w-full rounded-lg border border-border"
        />
      ) : null}
      {shown?.ok && shown.file.kind === "text" ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-sm">{text}</pre>
      ) : null}
      {ready && !shown?.ok ? <p>This file is not ready to look at yet.</p> : null}
      <p className="text-sm text-muted-foreground">
        You can look at this file here. A download link appears on the file list when the check is done.
      </p>
    </main>
  );
}
