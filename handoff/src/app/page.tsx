import Link from "next/link";
import { headers } from "next/headers";
import { HqHome } from "./hq-home";
import { SignInForm } from "./sign-in-form";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { hqOrigin, isHqHost } from "@/lib/host";
import { renamePreviewLocker } from "@/lib/preview-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home({ searchParams }: PageProps<"/">) {
  const notice = (await searchParams).notice;
  const linkExpired = notice === "link";
  const openFailed = notice === "open";
  const shareFailed = notice === "share";
  const { sql, caller } = await openSession();
  const host = (await headers()).get("host") ?? "";
  if (isHqHost(host)) {
    return (
      <HqHome
        signedIn={Boolean(caller.userId)}
        staff={Boolean(caller.staff)}
        linkExpired={linkExpired}
        openFailed={openFailed}
        shareFailed={shareFailed}
      />
    );
  }
  await renamePreviewLocker(sql);
  const staffHome = hqOrigin();
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
            <Link href={`${staffHome}/spaces/new`}>New space</Link>
            <Link href={`${staffHome}/spaces`}>Staff tools</Link>
          </div>
        ) : null}
        {caller.staff && !admin ? (
          <Link href={`${staffHome}/spaces/templates`} className="text-sm">
            File asks
          </Link>
        ) : null}
        {admin ? null : (
          <Link href="/login" className="text-sm">
            Sign in
          </Link>
        )}
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
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your username and password. Email sign-in is paused for now.</CardDescription>
        </CardHeader>
        <CardContent>
          {linkExpired ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              That link has run out. Ask for a new one.
            </p>
          ) : null}
          {openFailed ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              We could not sign you in. Please try again soon.
            </p>
          ) : null}
          {shareFailed ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              That share link does not work.
            </p>
          ) : null}
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  );
}
