import Link from "next/link";
import { headers } from "next/headers";
import { listDeals, listOrganizations, todayFor } from "@/db/crm";
import { HqHome } from "./hq-home";
import { SignInForm } from "./sign-in-form";
import { StaffShell } from "./staff-shell";
import { TodayScreen } from "./today-screen";
import { greetingName, todayFeed, type ClientHealth } from "./today-view";
import { workspacesFor } from "@/db/records";
import { clock } from "@/lib/clock";
import { openSession } from "@/lib/current";
import { hqOrigin, isHqHost } from "@/lib/host";
import { renamePreviewLocker } from "@/lib/preview-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CLIENT_HEALTH = `SELECT o.id AS id, o.name AS name, s.health AS health
  FROM organizations o
  JOIN status_updates s ON s.id = (
    SELECT s2.id FROM status_updates s2
    WHERE s2.organization_id = o.id
    ORDER BY s2.created_at DESC, s2.id DESC
    LIMIT 1
  )
  WHERE o.archived_at IS NULL AND o.kind = 'client'
  ORDER BY o.name`;

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const notice = params.notice;
  const linkExpired = notice === "link";
  const openFailed = notice === "open";
  const shareFailed = notice === "share";
  const { sql, caller } = await openSession();
  const host = (await headers()).get("host") ?? "";
  if (isHqHost(host)) {
    if (caller.userId && caller.staff) {
      const now = clock();
      const [board, orgs, deals, health, staff] = await Promise.all([
        todayFor(sql, caller, now),
        listOrganizations(sql, caller),
        listDeals(sql, caller),
        sql.all<ClientHealth>(CLIENT_HEALTH),
        sql.get<{ email: string }>(
          "SELECT email FROM staff WHERE user_id = ? AND revoked_at IS NULL",
          [caller.userId],
        ),
      ]);
      return (
        <StaffShell>
          <TodayScreen
            board={board}
            now={now}
            activeClients={orgs.filter((org) => org.kind === "client").length}
            deals={deals}
            health={health}
            name={greetingName(staff?.email)}
            feed={todayFeed("feed" in params ? params.feed : undefined)}
          />
        </StaffShell>
      );
    }
    return (
      <HqHome
        signedIn={Boolean(caller.userId)}
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
      <main className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col gap-6 px-6 py-[4rem]">
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
    <main className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col justify-center gap-8 px-6 py-[4rem]">
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
