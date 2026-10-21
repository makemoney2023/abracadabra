import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SocialOperationsPanel, type OperationsCard } from "@/components/social/social-operations-panel";
import { POST_STATUS_LABEL, type SocialAccount, type SocialPost } from "@/lib/social";
import { CADENCE_SENTENCE, type Autopost } from "@/lib/social-autopost";
import { POST_TYPE_LABEL } from "@/lib/social-plan";
import { ELIGIBLE_CONNECT_PLATFORMS, PLATFORM_LABEL, isBlogPlatform } from "@/lib/zernio";
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
};

const NOTICE: Record<string, string> = {
  connected: "Back from sign-in. New accounts show below.",
  failed: "Zernio did not give us a sign-in link. Try again.",
  setup: "Zernio is not set up yet.",
};

function accountLabel(account: SocialAccount): string {
  return `${PLATFORM_LABEL[account.platform] ?? account.platform} · ${account.display_name ?? account.username ?? account.id}`;
}

function dayKey(at: number, timeZone: string): string {
  return new Date(at).toLocaleDateString("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" });
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

function firstAccount(post: SocialPost): string {
  try {
    const ids = JSON.parse(post.account_ids) as unknown;
    return Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : "";
  } catch {
    return "";
  }
}

function platformOf(post: SocialPost, accounts: SocialAccount[]): string {
  const id = firstAccount(post);
  return accounts.find((account) => account.id === id)?.platform ?? "";
}

function operationCards(social: SocialView): OperationsCard[] {
  return social.posts.map((post) => ({
    id: post.id,
    title: post.item_title ?? "Post",
    platform: platformOf(post, social.accounts),
    state: post.status,
    at: post.scheduled_for ?? post.created_at,
    timezone: post.timezone || "UTC",
    thumbnailRole: "main",
    deliverableId: post.deliverable_id,
    itemId: post.item_id,
    accountId: firstAccount(post),
    collection: post.deliverable_title ?? "",
  }));
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

/** Upcoming posts grouped by day, in each post's own time zone. */
function Calendar({ posts, organizationId }: { posts: SocialPost[]; organizationId: string }) {
  const days = new Map<string, SocialPost[]>();
  for (const post of posts) {
    const key = dayKey(post.scheduled_for ?? post.created_at, post.timezone || "UTC");
    days.set(key, [...(days.get(key) ?? []), post]);
  }
  return (
    <div className="flex flex-col gap-5">
      {[...days.entries()].map(([day, rows]) => (
        <section key={day} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{day}</h3>
          <ul className="flex flex-col gap-3 border-l border-border pl-4">
            {rows.map((post) => (
              <PostLine key={post.id} post={post} organizationId={organizationId} showActions />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function SocialTab({ organizationId, social }: { organizationId: string; social: SocialView }) {
  const notice = NOTICE[social.notice];
  const postable = social.accounts.filter((account) => account.is_active && !isBlogPlatform(account.platform));
  const upcoming = social.posts
    .filter((post) => post.status === "scheduled" && (post.scheduled_for ?? 0) >= social.now - 3_600_000)
    .sort((left, right) => (left.scheduled_for ?? 0) - (right.scheduled_for ?? 0));
  const upcomingIds = new Set(upcoming.map((post) => post.id));
  const history = social.posts.filter((post) => !upcomingIds.has(post.id));
  return (
    <div className="flex flex-col gap-6">
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
          <CardTitle>Operations</CardTitle>
          <CardDescription>Attention comes first. Move and cancel on the calendar still send directly.</CardDescription>
        </CardHeader>
        <CardContent>
          <SocialOperationsPanel attention={social.attention} posts={operationCards(social)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
          <CardDescription>Scheduled posts, by day. Move or cancel one before it goes out.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled. Schedule from a finished-work page.</p>
          ) : (
            <Calendar posts={upcoming} organizationId={organizationId} />
          )}
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
          <CardTitle>Sent and drafts</CardTitle>
          <CardDescription>Everything else sent for this client, newest first.</CardDescription>
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
