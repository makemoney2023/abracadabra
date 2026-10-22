import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarPosts } from "@/components/social/calendar-posts";
import { calendarTimeZone } from "@/components/social/social-calendar";
import { SocialOperationsPanel } from "@/components/social/social-operations-panel";
import { POST_STATUS_LABEL, type SocialAccount, type SocialPost } from "@/lib/social";
import { approvalControlLabel, CADENCE_SENTENCE, type Autopost } from "@/lib/social-autopost";
import type { SocialReviewPiece } from "@/lib/social-review";
import { POST_TYPE_LABEL } from "@/lib/social-plan";
import { ELIGIBLE_CONNECT_PLATFORMS, PLATFORM_LABEL, isBlogPlatform } from "@/lib/zernio";
import { sentConfirmation } from "@/app/w/[slug]/work/sent";
import { connectSocialAction } from "../social-actions";
import { AgentPublishModeForm, AutopostForm, CancelSocialPostForm, DisconnectSocialForm, MoveSocialPostForm } from "../social-forms";

export type SocialAttentionItem = { id: string; kind: string; platform: string };

export type SocialView = {
  configured: boolean;
  syncError: string | null;
  accounts: SocialAccount[];
  posts: SocialPost[];
  autopost: Autopost;
  attention: SocialAttentionItem[];
  agentMode: string;
  notice: string;
  now: number;
  waiting: SocialReviewPiece[];
  ready: SocialReviewPiece[];
  catalog: SocialReviewPiece[];
  sent: string;
  pieceId: string;
  postId: string;
  scheduleNotice: string;
};

const NOTICE: Record<string, string> = {
  connected: "Back from sign-in. New accounts show below.",
  failed: "Zernio did not give us a sign-in link. Try again.",
  setup: "Zernio is not set up yet.",
};

function accountLabel(account: SocialAccount): string {
  return `${PLATFORM_LABEL[account.platform] ?? account.platform} · ${account.display_name ?? account.username ?? account.id}`;
}

function timeOf(at: number, timeZone: string): string {
  return new Date(at).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

function links(post: SocialPost): string[] {
  try {
    return Object.values(JSON.parse(post.published_urls ?? "{}") as Record<string, string>);
  } catch {
    return [];
  }
}

function accountCount(post: SocialPost): number {
  try {
    return (JSON.parse(post.account_ids) as string[]).length;
  } catch {
    return 0;
  }
}

function PostLine({ post, organizationId, showActions }: { post: SocialPost; organizationId: string; showActions: boolean }) {
  const zone = post.timezone || "UTC";
  const at = post.scheduled_for ?? post.created_at;
  return (
    <li className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground tabular-nums">{timeOf(at, zone)}</span>
        <span className="font-medium">{post.item_title}</span>
        <Badge variant="secondary">{POST_TYPE_LABEL[post.post_type]}</Badge>
        <Badge variant={post.status === "failed" ? "destructive" : "outline"}>
          {post.error === "Cancelled." ? "Cancelled" : POST_STATUS_LABEL[post.status]}
        </Badge>
        {showActions && post.status === "scheduled" ? (
          <>
            <MoveSocialPostForm organizationId={organizationId} postId={post.id} timezone={zone} />
            <CancelSocialPostForm organizationId={organizationId} postId={post.id} />
          </>
        ) : null}
        {showActions && post.status === "draft" ? <CancelSocialPostForm organizationId={organizationId} postId={post.id} /> : null}
      </div>
      <span className="text-muted-foreground">
        {zone} · {accountCount(post)} account(s) ·{" "}
        <Link className="underline" href={`/deliverables/${post.deliverable_id}`}>
          {post.deliverable_title}
        </Link>
      </span>
      {links(post).length > 0 ? (
        <span className="flex flex-wrap gap-3">
          {links(post).map((url) => (
            <a key={url} className="underline" href={url} target="_blank" rel="noreferrer">
              {new URL(url).hostname.replace(/^www\./, "")}
            </a>
          ))}
        </span>
      ) : null}
      {post.error && post.error !== "Cancelled." ? <span className="whitespace-pre-line text-status-late">{post.error}</span> : null}
      {post.skipped ? <span className="whitespace-pre-line text-muted-foreground">Skipped: {post.skipped}</span> : null}
    </li>
  );
}

export function SocialTab({ organizationId, social }: { organizationId: string; social: SocialView }) {
  const notice = NOTICE[social.notice];
  const confirmation = sentConfirmation(social.sent);
  const postable = social.accounts.filter((account) => account.is_active && !isBlogPlatform(account.platform));
  const cards = calendarPosts(social.posts, social.accounts, social.catalog);
  const onCalendar = new Set(cards.map((post) => post.id));
  const history = social.posts.filter((post) => !onCalendar.has(post.id));
  const timeZone = calendarTimeZone(
    social.autopost,
    social.posts.map((post) => post.timezone || ""),
  );
  return (
    <div className="flex flex-col gap-6">
      {confirmation ? (
        <div role="status" aria-live="polite" tabIndex={-1} className="flex flex-col gap-1 rounded-2xl border border-border bg-muted/40 px-5 py-4">
          <p className="text-sm font-medium">{confirmation.title}</p>
          <p className="text-sm text-muted-foreground">{confirmation.body}</p>
        </div>
      ) : null}
      <Card id="account_health">
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Social accounts and blog sites for this client. The client signs in on the network. We never see the password.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {notice ? <p role="status" className="text-sm">{notice}</p> : null}
          {!social.configured ? (
            <p className="text-sm text-muted-foreground">
              Zernio is not set up. Add the ZERNIO_API_KEY secret to the staff app.
            </p>
          ) : null}
          {social.syncError ? <p className="text-sm text-status-late">Zernio did not answer: {social.syncError}</p> : null}
          {social.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No accounts connected yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {social.accounts.map((account) => (
                <li key={account.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">{PLATFORM_LABEL[account.platform] ?? account.platform}</Badge>
                  <span className="font-medium">{account.display_name ?? account.username ?? account.id}</span>
                  {account.username && account.display_name ? (
                    <span className="text-muted-foreground">{account.username}</span>
                  ) : null}
                  {isBlogPlatform(account.platform) ? <span className="text-muted-foreground">Blog</span> : null}
                  {account.is_active ? null : <span className="text-status-late">Needs sign-in again</span>}
                  <DisconnectSocialForm organizationId={organizationId} accountId={account.id} />
                </li>
              ))}
            </ul>
          )}
          {social.configured ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Connect an account</p>
              <div className="flex flex-wrap gap-2">
                {ELIGIBLE_CONNECT_PLATFORMS.map((platform) => (
                  <form key={platform} action={connectSocialAction}>
                    <input type="hidden" name="organizationId" value={organizationId} />
                    <input type="hidden" name="platform" value={platform} />
                    <Button type="submit" variant="outline" size="sm">
                      {PLATFORM_LABEL[platform]}
                    </Button>
                  </form>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
          <CardDescription>
            Day, week, or month in {timeZone}. Pieces that need a look stay in the Library and beside the calendar. Drag a scheduled post to move it, or drag an approved piece onto a day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SocialOperationsPanel
            attention={social.attention}
            posts={cards}
            timeZone={timeZone}
            now={social.now}
            waiting={social.waiting}
            ready={social.ready}
            approveLabel={approvalControlLabel(social.autopost)}
            organizationId={organizationId}
            canReschedule
            initialPieceId={social.pieceId || null}
            initialPostId={social.postId || null}
            scheduleNotice={social.scheduleNotice || null}
            librarySlug={social.waiting[0]?.slug ?? social.ready[0]?.slug ?? social.catalog[0]?.slug ?? ""}
          />
        </CardContent>
      </Card>
      <Card id="cadence">
        <CardHeader>
          <CardTitle>Publishing cadence</CardTitle>
          <CardDescription>{CADENCE_SENTENCE}</CardDescription>
        </CardHeader>
        <CardContent>
          {postable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Connect an account first.</p>
          ) : (
            <AutopostForm
              organizationId={organizationId}
              accounts={postable.map((account) => ({ id: account.id, label: accountLabel(account) }))}
              settings={social.autopost}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Agent publishing</CardTitle>
          <CardDescription>How a connected agent may prepare or schedule posts for this client.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentPublishModeForm organizationId={organizationId} mode={social.agentMode} />
        </CardContent>
      </Card>
      <Card id="history">
        <CardHeader>
          <CardTitle>Cancelled and untimed drafts</CardTitle>
          <CardDescription>Scheduled and posted work is on the calendar, including past days.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {history.map((post) => (
                <PostLine key={post.id} post={post} organizationId={organizationId} showActions />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
