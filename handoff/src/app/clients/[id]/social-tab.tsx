import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { POST_STATUS_LABEL, type SocialAccount, type SocialPost } from "@/lib/social";
import { POST_TYPE_LABEL } from "@/lib/social-plan";
import { CONNECT_PLATFORMS, PLATFORM_LABEL, isBlogPlatform } from "@/lib/zernio";
import { connectSocialAction } from "../social-actions";
import { DisconnectSocialForm } from "../social-forms";

export type SocialView = {
  configured: boolean;
  syncError: string | null;
  accounts: SocialAccount[];
  posts: SocialPost[];
  notice: string;
};

const NOTICE: Record<string, string> = {
  connected: "Back from sign-in. New accounts show below.",
  failed: "Zernio did not give us a sign-in link. Try again.",
  setup: "Zernio is not set up yet.",
};

function when(post: SocialPost): string {
  const at = post.scheduled_for ?? post.created_at;
  const text = new Date(at).toLocaleString("en-US", {
    timeZone: post.timezone || "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${text} ${post.timezone || "UTC"}`;
}

export function SocialTab({ organizationId, social }: { organizationId: string; social: SocialView }) {
  const notice = NOTICE[social.notice];
  return (
    <div className="flex flex-col gap-6">
      <Card>
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
                {CONNECT_PLATFORMS.map((platform) => (
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
          <CardTitle>Posts</CardTitle>
          <CardDescription>Finished work sent to this client&apos;s accounts. Post from a finished-work page.</CardDescription>
        </CardHeader>
        <CardContent>
          {social.posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {social.posts.map((post) => (
                <li key={post.id} className="flex flex-col gap-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{post.item_title}</span>
                    <Badge variant="secondary">{POST_TYPE_LABEL[post.post_type]}</Badge>
                    <Badge variant={post.status === "failed" ? "destructive" : "outline"}>{POST_STATUS_LABEL[post.status]}</Badge>
                  </div>
                  <span className="text-muted-foreground">
                    {when(post)} · {(JSON.parse(post.account_ids) as string[]).length} account(s) ·{" "}
                    <Link className="underline" href={`/deliverables/${post.deliverable_id}`}>
                      {post.deliverable_title}
                    </Link>
                  </span>
                  {post.error ? <span className="whitespace-pre-line text-status-late">{post.error}</span> : null}
                  {post.skipped ? <span className="whitespace-pre-line text-muted-foreground">Skipped: {post.skipped}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
