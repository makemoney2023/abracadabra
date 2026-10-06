import Link from "next/link";
import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { openSession } from "@/lib/current";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-6 py-4">
          {workspace.logo_object_key ? (
            // The logo is a same-origin file served only when this caller can see the workspace.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/w/${workspace.slug}/logo`}
              alt=""
              className="h-10 w-10 rounded-md object-contain"
            />
          ) : null}
          <div className="flex flex-1 flex-col">
            <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
            <p className="font-heading text-xl">{workspace.display_name}</p>
          </div>
          {can(caller, "invite.member", { workspaceId: workspace.id }) ? (
            <Link href={`/w/${workspace.slug}/people`} className="text-sm">
              People
            </Link>
          ) : null}
          <Link href={`/w/${workspace.slug}/settings`} className="text-sm">
            Settings
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
