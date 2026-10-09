import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { openSession } from "@/lib/current";
import { livePeople } from "@/lib/store/invites";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm, RemoveForm, ResendForm } from "./people-form";

function roleLabel(role: string): string {
  return role === "client_owner" ? "Owner" : "Member";
}

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { slug } = await params;
  const notice = (await searchParams).notice;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const canInviteOwner = can(caller, "invite.owner", { workspaceId: workspace.id });
  const canInviteMember = can(caller, "invite.member", { workspaceId: workspace.id });
  if (!canInviteOwner && !canInviteMember) notFound();
  const people = await livePeople(sql, workspace.id);
  return (
    <main className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col gap-8 px-6 py-[4rem]">
      <h1 className="font-heading text-4xl leading-tight">People</h1>
      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>
            We&apos;ll email them a link to join. It stops working in 14 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm slug={workspace.slug} canInviteOwner={canInviteOwner} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Who is here</CardTitle>
          {notice === "removed" ? (
            <CardDescription>
              <span role="status">Removed.</span>
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {people.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one has joined yet.</p>
          ) : (
            people.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3">
                <div>
                  <p>{member.email}</p>
                  <p className="text-sm text-muted-foreground">{roleLabel(member.role)}</p>
                </div>
                {(member.role === "client_owner" && canInviteOwner) ||
                (member.role === "client_member" && canInviteMember) ? (
                  <RemoveForm slug={workspace.slug} membershipId={member.id} />
                ) : null}
              </div>
            ))
          )}
          {people.invites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between gap-3">
              <div>
                <p>{invite.email}</p>
                <p className="text-sm text-muted-foreground">{roleLabel(invite.role)}, waiting to join</p>
              </div>
              <ResendForm slug={workspace.slug} inviteId={invite.id} />
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
