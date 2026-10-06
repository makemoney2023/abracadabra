import Link from "next/link";
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
  const requests = await workspaceRequests(sql, workspace.id);
  const open = requests.filter((request) => request.status === "open");
  const asked = requestId ? requests.find((request) => request.id === requestId) : undefined;
  if (requestId && !asked) notFound();
  const request = asked ?? (open.length === 1 ? open[0] : undefined);
  const canDrop =
    caller.staff === null && caller.memberships.some((member) => member.workspaceId === workspace.id);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-10">
      <Link href={`/w/${workspace.slug}`} className="text-sm">
        Back to files
      </Link>
      <h1 className="font-heading text-4xl leading-tight">Upload</h1>
      {request ? (
        <>
          <p className="text-muted-foreground">These files go in {workspace.display_name}.</p>
          {open.length > 1 ? <p className="text-sm text-muted-foreground">For: {request.title}</p> : null}
          {request.guidance ? <p className="text-sm text-muted-foreground">{request.guidance}</p> : null}
          {request.status === "open" ? (
            <DropZone slug={slug} requestId={request.id} canDrop={canDrop} />
          ) : (
            <p className="text-sm text-muted-foreground">This folder isn&apos;t taking new files.</p>
          )}
        </>
      ) : open.length > 1 ? (
        <>
          <p className="text-muted-foreground">Pick where these files go.</p>
          <ul className="flex flex-col gap-2">
            {open.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/w/${workspace.slug}/drop?request=${item.id}`}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-4"
                >
                  <span>{item.title}</span>
                  <span className="text-sm text-muted-foreground">Upload</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">This folder isn&apos;t taking new files right now.</p>
      )}
    </main>
  );
}
