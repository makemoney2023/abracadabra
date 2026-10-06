import { notFound } from "next/navigation";
import { DropZone } from "@/components/drop-zone";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { workspaceRequests } from "@/lib/store/requests";

export default async function DropPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ request?: string }>;
}) {
  const { slug } = await params;
  const requestId = (await searchParams).request ?? "";
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const request = (await workspaceRequests(sql, workspace.id)).find((row) => row.id === requestId);
  if (!request) notFound();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
      <p className="font-mono text-xs tracking-wide text-optic">Send files</p>
      <h1 className="font-heading text-4xl leading-tight">{request.title}</h1>
      {request.guidance ? <p className="text-muted-foreground">{request.guidance}</p> : null}
      {request.status === "open" ? (
        <DropZone
          slug={slug}
          requestId={request.id}
          canDrop={
            caller.staff === null && caller.memberships.some((member) => member.workspaceId === workspace.id)
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">This request is closed.</p>
      )}
    </main>
  );
}