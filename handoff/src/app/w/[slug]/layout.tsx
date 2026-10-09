import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { openSession } from "@/lib/current";
import { isHqHost } from "@/lib/host";
import { legacyPreviewPath, renamePreviewLocker } from "@/lib/preview-session";
import { SetContextLabel } from "@/components/context-bar";
import { Button } from "@/components/ui/button";
import { StaffShell } from "../../staff-shell";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { sql, caller } = await openSession();
  await renamePreviewLocker(sql);
  const nextPath = await legacyPreviewPath(sql, slug);
  if (nextPath) redirect(nextPath);
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const host = (await headers()).get("host") ?? "";
  const hq = isHqHost(host);
  const page = (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[48rem] flex-wrap items-center gap-2 px-6 py-4">
          {workspace.logo_object_key ? (
            // The logo is a same-origin file served only when this caller can see the workspace.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/w/${workspace.slug}/logo`}
              alt={workspace.display_name ? `${workspace.display_name} logo` : "Space logo"}
              className="h-10 w-10 rounded-md object-contain"
            />
          ) : null}
          <div className="flex flex-1 flex-col">
            {hq ? null : (
              <Link href="/" className="font-mono text-xs tracking-wide text-optic">
                Handoff
              </Link>
            )}
            <p className="font-heading text-xl">{workspace.display_name}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/w/${workspace.slug}`}>Files</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/w/${workspace.slug}/work`}>Finished work</Link>
          </Button>
          {can(caller, "request.manage", { workspaceId: workspace.id }) ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/w/${workspace.slug}/requests`}>Ask for files</Link>
            </Button>
          ) : null}
          {can(caller, "invite.member", { workspaceId: workspace.id }) ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/w/${workspace.slug}/people`}>People</Link>
            </Button>
          ) : null}
          {can(caller, "workspace.configure", { workspaceId: workspace.id }) ||
          can(caller, "workspace.archive", { workspaceId: workspace.id }) ||
          caller.operatorOf.includes(workspace.id) ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/w/${workspace.slug}/settings`}>Settings</Link>
            </Button>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
  if (hq) {
    return (
      <StaffShell>
        <SetContextLabel path={`/w/${workspace.slug}`} label={workspace.display_name} />
        {page}
      </StaffShell>
    );
  }
  return page;
}
