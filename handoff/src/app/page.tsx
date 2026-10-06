import Link from "next/link";
import { AccessForm } from "./access-form";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home({ searchParams }: PageProps<"/">) {
  const notice = (await searchParams).notice;
  const linkExpired = notice === "link";
  const { sql, caller } = await openSession();
  const workspaces = await workspacesFor(sql, caller);
  const admin = caller.staff?.superAdmin === true;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      {admin || workspaces.length > 0 ? (
        <nav className="flex flex-col gap-2 text-sm">
          {admin ? <Link href="/admin">Staff tools</Link> : null}
          {caller.staff ? <Link href="/admin/templates">Request templates</Link> : null}
          {workspaces.map((workspace) => (
            <Link key={workspace.id} href={`/w/${workspace.slug}`}>
              {workspace.display_name}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">A locker for one client.</h1>
        <p className="text-muted-foreground">
          Invited people drop brand, photo, copy, and reference files. Operators verify them
          after a malware scan. Handoff is not part of any client&apos;s product.
        </p>
      </div>
      <Card id="access">
        <CardHeader>
          <CardTitle>Open an invite</CardTitle>
          <CardDescription>
            Use the email on your invite. Handoff emails a sign-in link and does not say whether
            that address is on file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkExpired ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              That sign-in link is no longer valid. Ask for another.
            </p>
          ) : null}
          <AccessForm />
        </CardContent>
      </Card>
    </main>
  );
}
