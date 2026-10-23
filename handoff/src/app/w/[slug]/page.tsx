import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuiltWorkCards } from "@/components/built-work-cards";
import { FolderFiles } from "@/components/folder-files";
import { ShareLink } from "@/components/share-link";
import { Button } from "@/components/ui/button";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { listBuiltWork } from "@/lib/built-work";
import { RetiredFilter } from "@/components/files/retired-filter";
import { showRetired } from "@/lib/retired-param";
import { listFolderFiles, retiredFileCount } from "@/lib/downloads";
import { listFileReads } from "@/lib/knowledge";
import { seesHeldWork } from "@/lib/held-work";
import { openSession } from "@/lib/current";
import { previewKind, previewableStatus } from "@/lib/preview";
import { ensureUploadShare, sharePageUrl } from "@/lib/share-link";
import { workspaceRequests } from "@/lib/store/requests";
import { KnowledgeTools } from "./knowledge-tools";

export default async function WorkspaceHome({
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
  const requests = await workspaceRequests(sql, workspace.id);
  const open = requests.filter((request) => request.status === "open");
  const everyFile = await listFolderFiles(sql, caller, workspace.id, { includeRetired: true });
  const retiredShown = showRetired(query.retired);
  const retiredCount = retiredFileCount(everyFile);
  const files = retiredShown ? everyFile : everyFile.filter((file) => file.hold !== "hidden");
  const staffView = seesHeldWork(caller, workspace.id);
  const built = await listBuiltWork(sql, { workspaceId: workspace.id, clientView: !staffView });
  const canDrop = can(caller, "batch.create", { workspaceId: workspace.id });
  const staffDrop = can(caller, "request.manage", { workspaceId: workspace.id });
  const showUpload = canDrop && (open.length > 0 || staffDrop);
  const canShare = can(caller, "share.copy", { workspaceId: workspace.id });
  const canRead = can(caller, "knowledge.manage", { workspaceId: workspace.id });
  const reads = canRead ? await listFileReads(sql, workspace.id, undefined, { clientView: !seesHeldWork(caller, workspace.id) }) : [];
  const uploadHref =
    open.length === 1 ? `/w/${workspace.slug}/drop?request=${open[0].id}` : `/w/${workspace.slug}/drop`;
  const headerList = await headers();
  const shareUrl = canShare
    ? sharePageUrl(await ensureUploadShare(sql, workspace.id), {
        origin: process.env.HANDOFF_APP_ORIGIN,
        host: headerList.get("x-forwarded-host") ?? headerList.get("host"),
        proto: headerList.get("x-forwarded-proto"),
      })
    : "";
  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-4xl leading-tight">{workspace.display_name}</h1>
        </div>
        {showUpload ? (
          <Button asChild>
            <Link href={uploadHref}>Upload</Link>
          </Button>
        ) : null}
      </div>
      <BuiltWorkCards
        cards={built}
        viewer={staffView ? "staff" : "client"}
        intro={staffView ? "Clients see a card once Client Services approves it." : "Websites and other work we built for you. Open any of them in a new tab."}
      />
      {canShare ? <ShareLink url={shareUrl} /> : null}
      {canRead ? <KnowledgeTools slug={workspace.slug} reads={reads} /> : null}
      {staffView && (retiredCount > 0 || retiredShown) ? <RetiredFilter count={retiredCount} checked={retiredShown} /> : null}
      {built.length > 0 && files.length > 0 ? <h2 className="font-heading text-2xl leading-tight">Files</h2> : null}
      {files.length === 0 && built.length > 0 ? null : files.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border px-6 py-12">
          <p className="text-lg">This folder is empty.</p>
          {showUpload ? (
            <>
              <p className="text-sm text-muted-foreground">
                Add files with Upload. People can look at a picture, a PDF, or a text file before the check is done.
                A download opens after the check.
              </p>
              <Button asChild>
                <Link href={uploadHref}>Upload files</Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              People in this folder can add files. You can look at a picture, a PDF, or a text file here. A download
              opens once the check is done.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Look at a picture, a PDF, or a text file here. A download opens after the check is done.
          </p>
          <FolderFiles
            slug={workspace.slug}
            files={files.map((file) => ({
              id: file.id,
              batchId: file.batchId,
              name: file.name,
              sizeBytes: file.sizeBytes,
              status: file.status,
              deletable: file.createdBy === caller.userId,
              heldNote: file.hold === "held" ? "Held for Client Services review" : file.hold === "hidden" ? "Retired: hidden from client" : null,
              previewHref:
                previewableStatus(file.status) && previewKind(file.name) !== "none"
                  ? `/w/${workspace.slug}/files/${file.id}`
                  : null,
              moreHref: can(caller, "file.tag", { workspaceId: workspace.id })
                ? `/w/${workspace.slug}/batches/${file.batchId}`
                : null,
            }))}
          />
        </>
      )}
    </main>
  );
}
