import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { clock } from "@/lib/clock";
import { openSession } from "@/lib/current";
import { calendarPosts } from "@/components/social/calendar-posts";
import { calendarTimeZone } from "@/components/social/social-calendar";
import { SocialOperationsPanel } from "@/components/social/social-operations-panel";
import { listSocialAccounts, listSocialPosts, syncSocialAccounts, type SocialAccount, type SocialPost } from "@/lib/social";
import { approvalControlLabel, DEFAULT_AUTOPOST, getAutopost, type Autopost } from "@/lib/social-autopost";
import { listSocialReviewPieces } from "@/lib/social-review";
import { ELIGIBLE_CONNECT_PLATFORMS, PLATFORM_LABEL, openZernio } from "@/lib/zernio";
import { sentConfirmation } from "../work/sent";
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
  searchParams: Promise<{ social?: string; sent?: string; piece?: string; post?: string; schedule?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const notice = NOTICE[query.social ?? ""];
  const confirmation = sentConfirmation(query.sent);
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
  let accounts: SocialAccount[] = [];
  let posts: SocialPost[] = [];
  let cadence: Autopost = DEFAULT_AUTOPOST;
  if (organization) {
    [accounts, posts, cadence] = await Promise.all([
      listSocialAccounts(sql, organization.id),
      listSocialPosts(sql, { organizationId: organization.id }, 200),
      getAutopost(sql, organization.id),
    ]);
  }
  const now = clock();
  const live = new Set(
    posts
      .filter((post) => post.status === "sending" || post.status === "scheduled" || post.status === "published" || post.status === "partial")
      .map((post) => post.item_id),
  );
  const held = new Set(posts.filter((post) => post.status === "failed").map((post) => post.item_id));
  const review = organization
    ? await listSocialReviewPieces(sql, caller, { id: workspace.id, slug, display_name: workspace.display_name }, live, held)
    : { waiting: [], ready: [], catalog: [] };
  const timeZone = calendarTimeZone(cadence, posts.map((post) => post.timezone || ""));
  const cards = calendarPosts(posts, accounts, review.catalog);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-[4rem]">
      <h1 className="font-heading text-4xl leading-tight">Social</h1>
      {confirmation ? (
        <div role="status" aria-live="polite" tabIndex={-1} className="flex flex-col gap-1 rounded-2xl border border-border bg-muted/40 px-5 py-4">
          <p className="text-sm font-medium">{confirmation.title}</p>
          <p className="text-sm text-muted-foreground">{confirmation.body}</p>
        </div>
      ) : null}
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
                {ELIGIBLE_CONNECT_PLATFORMS.map((platform) => (
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
          <CardTitle>Calendar</CardTitle>
          <CardDescription>
            Day, week, or month. Times are in {timeZone}. Open a piece to approve it or ask for a change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SocialOperationsPanel
            attention={[]}
            posts={cards}
            timeZone={timeZone}
            now={now}
            waiting={review.waiting}
            ready={review.ready}
            approveLabel={approvalControlLabel(cadence)}
            organizationId={organization?.id ?? ""}
            canReschedule={false}
            initialPieceId={query.piece || null}
            initialPostId={query.post || null}
            scheduleNotice={query.schedule || null}
          />
        </CardContent>
      </Card>
    </main>
  );
}
