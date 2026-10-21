import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { clock } from "@/lib/clock";
import { openSession } from "@/lib/current";
import { listSocialAccounts, listSocialPosts, syncSocialAccounts } from "@/lib/social";
import { POST_TYPE_LABEL } from "@/lib/social-plan";
import { CONNECT_PLATFORMS, PLATFORM_LABEL, openZernio } from "@/lib/zernio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connectFromSpaceAction } from "./actions";
import { DisconnectFromSpaceForm } from "./disconnect-form";

const NOTICE: Record<string, string> = {
  connected: "You're back. New accounts show below.",
  failed: "That did not work. Try again, or ask us.",
};

export default async function SpaceSocialPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ social?: string }>;
}) {
  const { slug } = await params;
  const notice = NOTICE[(await searchParams).social ?? ""];
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace || !can(caller, "invite.member", { workspaceId: workspace.id })) notFound();
  const organization = await sql.get<{ id: string; name: string }>(
    "SELECT o.id, o.name FROM workspaces w JOIN organizations o ON o.id = w.organization_id WHERE w.id = ?",
    [workspace.id],
  );
  const zernio = openZernio();
  if (organization && zernio) {
    try {
      await syncSocialAccounts(sql, zernio, organization, clock());
    } catch {
      // The list below is the last copy we have.
    }
  }
  const [accounts, posts] = organization
    ? await Promise.all([listSocialAccounts(sql, organization.id), listSocialPosts(sql, { organizationId: organization.id }, 100)])
    : [[], []];
  const now = clock();
  const upcoming = posts
    .filter((post) => post.status === "scheduled" && (post.scheduled_for ?? 0) >= now)
    .sort((left, right) => (left.scheduled_for ?? 0) - (right.scheduled_for ?? 0));
  return (
    <main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-8 px-6 py-[4rem]">
      <h1 className="font-heading text-4xl leading-tight">Social</h1>
      {notice ? <p role="status" className="text-sm">{notice}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Your accounts</CardTitle>
          <CardDescription>
            Connect the accounts we post to for you. You sign in on the site itself. We never see your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!organization || !zernio ? (
            <p className="text-sm text-muted-foreground">This is not ready yet. We will tell you when it is.</p>
          ) : (
            <>
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accounts yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {accounts.map((account) => (
                    <li key={account.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="secondary">{PLATFORM_LABEL[account.platform] ?? account.platform}</Badge>
                      <span className="font-medium">{account.display_name ?? account.username ?? account.id}</span>
                      {account.is_active ? null : <span className="text-status-late">Sign in again</span>}
                      <DisconnectFromSpaceForm slug={slug} accountId={account.id} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {CONNECT_PLATFORMS.map((platform) => (
                  <form key={platform} action={connectFromSpaceAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="platform" value={platform} />
                    <Button type="submit" variant="outline" size="sm">
                      {PLATFORM_LABEL[platform]}
                    </Button>
                  </form>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Coming up</CardTitle>
          <CardDescription>Posts we have scheduled for you.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled right now.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {upcoming.map((post) => (
                <li key={post.id} className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium">{post.item_title}</span>
                  <span className="text-muted-foreground">
                    {new Date(post.scheduled_for ?? 0).toLocaleString("en-US", {
                      timeZone: post.timezone || "UTC",
                      dateStyle: "full",
                      timeStyle: "short",
                    })}{" "}
                    · {POST_TYPE_LABEL[post.post_type]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
