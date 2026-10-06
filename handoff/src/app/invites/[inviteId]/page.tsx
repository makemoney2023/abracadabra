import { notFound } from "next/navigation";
import { AccessForm } from "@/app/access-form";
import { openSession } from "@/lib/current";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptForm } from "./accept-form";

type InviteRow = {
  id: string;
  email: string;
  role: string;
  display_name: string;
  slug: string;
  live: number;
};

export default async function InvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  const { sql, caller } = await openSession();
  const invite = await sql.get<InviteRow>(
    `SELECT i.id, i.email, i.role, w.display_name, w.slug,
            CASE
              WHEN i.revoked_at IS NULL
               AND i.accepted_at IS NULL
               AND i.expires_at > CAST(unixepoch('subsec') * 1000 AS INTEGER)
               AND w.status = 'active'
              THEN 1 ELSE 0
            END AS live
     FROM invites i
     JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.id = ?`,
    [inviteId],
  );
  if (!invite) notFound();
  const user = caller.userId
    ? await sql.get<{ email: string }>("SELECT email FROM users WHERE id = ?", [caller.userId])
    : undefined;
  const live = invite.live === 1;
  const sameEmail = user?.email === invite.email;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">{invite.display_name}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Accept this invite</CardTitle>
          <CardDescription>
            {live
              ? `This invite is for ${invite.email}.`
              : "That invite is no longer valid."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {live && sameEmail ? <AcceptForm inviteId={invite.id} /> : null}
          {live && caller.userId && !sameEmail ? (
            <p className="text-sm text-muted-foreground">This invite is for a different email.</p>
          ) : null}
          {live && !caller.userId ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Open the link in the invite email. It signs you in and brings you back here.
              </p>
              <AccessForm />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
