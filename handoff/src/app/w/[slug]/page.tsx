import Link from "next/link";
import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { workspaceRequests } from "@/lib/store/requests";

export default async function WorkspaceHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const requests = await workspaceRequests(sql, workspace.id);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="font-heading text-4xl leading-tight">{workspace.display_name}</h1>
      {requests.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing is waiting in {workspace.display_name} yet. Operators add requests when they know
          what to collect.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-col gap-1 border-b border-border pb-4">
              <p className="text-sm font-medium">{request.title}</p>
              <p className="font-mono text-xs text-muted-foreground">{request.status}</p>
              {request.guidance ? <p className="text-sm text-muted-foreground">{request.guidance}</p> : null}
              {request.status === "open" ? (
                <Link href={`/w/${workspace.slug}/drop?request=${request.id}`} className="text-sm">
                  Start a drop
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
