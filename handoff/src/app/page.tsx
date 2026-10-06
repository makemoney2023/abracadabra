import Link from "next/link";
import { EnterForm } from "./enter-form";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { renamePreviewLocker } from "@/lib/preview-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home({ searchParams }: PageProps<"/">) {
  const notice = (await searchParams).notice;
  const linkExpired = notice === "link";
  const openFailed = notice === "open";
  const shareFailed = notice === "share";
  const { sql, caller } = await openSession();
  await renamePreviewLocker(sql);
  const workspaces = await workspacesFor(sql, caller);
  const admin = caller.staff?.superAdmin === true;
  if (caller.userId) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-16">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
          <h1 className="font-heading text-4xl leading-tight">Your folders</h1>
        </div>
        {shareFailed ? (
          <p className="text-sm text-muted-foreground" role="status">
            That share link does not work.
          </p>
        ) : null}
        {workspaces.length === 0 ? (
          <p className="text-muted-foreground">You don&apos;t have a folder yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  href={`/w/${workspace.slug}`}
                  className="flex items-center rounded-lg border border-border px-4 py-4 text-lg"
                >
                  {workspace.display_name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {admin ? (
          <div className="flex gap-4 text-sm">
            <Link href="/admin/workspaces/new">Add a client</Link>
            <Link href="/admin">Staff tools</Link>
          </div>
        ) : null}
        {caller.staff && !admin ? (
          <Link href="/admin/templates" className="text-sm">
            File asks
          </Link>
        ) : null}
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Send files. Get files.</h1>
        <p className="text-muted-foreground">
          A shared folder for your team. Upload files, we check them, then people can download them.
        </p>
      </div>
      <Card id="access">
        <CardHeader>
          <CardTitle>Open Handoff</CardTitle>
          <CardDescription>
            Email sign-in is paused for now. Tap the button to come on in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkExpired ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              That link has run out. Ask for a new one.
            </p>
          ) : null}
          {openFailed ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              We couldn&apos;t open Handoff. Please try again soon.
            </p>
          ) : null}
          {shareFailed ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              That share link does not work.
            </p>
          ) : null}
          <EnterForm />
        </CardContent>
      </Card>
    </main>
  );
}
