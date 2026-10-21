import Link from "next/link";
import { notFound } from "next/navigation";
import { listDeliverableFeedback, openDeliverable } from "@/db/deliverables";
import { listProjectRepos } from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { readGithubSecrets } from "@/lib/github/secrets";
import { FilingSummaryCard } from "@/components/filing-summary-card";
import { PageFrame } from "@/components/page-frame";
import { parseFilingSummary } from "@/lib/filing-summary";
import { clientServicesReleased } from "@/lib/held-work";
import { Timeline } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../../staff-shell";
import { AddItemForm, PublishForm, PullForm } from "../forms";
import { SendToSocialForm } from "../../clients/social-forms";
import { POST_STATUS_LABEL, listSocialAccounts, listSocialPosts } from "@/lib/social";
import { POST_TYPE_LABEL, defaultPostType, pieceMedia } from "@/lib/social-plan";
import { PLATFORM_LABEL, isBlogPlatform, zernioApiKey } from "@/lib/zernio";
import { DELIVERABLE_KIND_LABEL, DELIVERABLE_STATUS_LABEL, ITEM_FORMAT_LABEL, fileLabel, listedMedia } from "../labels";

export default async function DeliverablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sql, caller } = await requireHqStaffPage();
  const opened = await openDeliverable(sql, caller, id, "working");
  if (!opened) notFound();
  const { deliverable, items } = opened;
  const space = await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [deliverable.workspace_id]);
  const repos = deliverable.project_id ? await listProjectRepos(sql, caller, deliverable.project_id) : [];
  const notes = await listDeliverableFeedback(sql, caller, deliverable.id);
  const githubReady = Boolean(readGithubSecrets()) && repos.some((repo) => repo.installation_id != null);
  const approvedByClientServices = Boolean(
    (await sql.get<{ ok: number }>(`SELECT 1 AS ok FROM deliverables d WHERE d.id = ? AND ${clientServicesReleased("d")}`, [deliverable.id]))?.ok,
  );
  const sentBehind = deliverable.published_version != null && deliverable.version > deliverable.published_version;
  const now = clock();
  const [socialAccounts, socialPosts] = await Promise.all([
    listSocialAccounts(sql, deliverable.organization_id),
    listSocialPosts(sql, { deliverableId: deliverable.id }, 200),
  ]);
  const postable = socialAccounts.filter((account) => account.is_active && !isBlogPlatform(account.platform));
  const pieces = items
    .filter((item) => !(item.format === "page" && parseFilingSummary(item.copy_text)))
    .map((item) => {
      const latest = socialPosts.find((post) => post.item_id === item.id && post.version === item.version);
      return {
        id: item.id,
        title: item.title,
        format: ITEM_FORMAT_LABEL[item.format],
        defaultType: defaultPostType(item.format, pieceMedia(item.media_json)),
        approved: item.status === "approved",
        sent: latest ? `${POST_STATUS_LABEL[latest.status]} as ${POST_TYPE_LABEL[latest.post_type].toLowerCase()}` : null,
      };
    });
  return (
    <StaffShell>
      <PageFrame
        title={deliverable.title}
        description={`${DELIVERABLE_KIND_LABEL[deliverable.kind]} · ${
          approvedByClientServices ? "Approved by Client Services, waiting for the client" : DELIVERABLE_STATUS_LABEL[deliverable.status]
        }`}
        actions={
          deliverable.published_version != null && space ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/w/${space.slug}/work/${deliverable.id}`}>See what the client sees</Link>
            </Button>
          ) : null
        }
      >
        {sentBehind ? (
          <p className="text-sm">Clients still see the last round you sent. This one is not sent yet.</p>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Pieces</CardTitle>
            <CardDescription>What goes in this round.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {items.length === 0 ? <p className="text-sm text-muted-foreground">No pieces yet.</p> : null}
            <ul className="flex flex-col gap-6">
              {items.map((item) => {
                const filing = item.format === "page" ? parseFilingSummary(item.copy_text) : null;
                if (filing) {
                  return (
                    <li key={item.id} className="flex flex-col gap-2">
                      <FilingSummaryCard summary={filing} viewer="staff" raw={item.copy_text ?? undefined} />
                    </li>
                  );
                }
                return (
                  <li key={item.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.title}</p>
                      <Badge variant="secondary">{ITEM_FORMAT_LABEL[item.format]}</Badge>
                    </div>
                    {item.copy_text ? <p className="text-sm">{item.copy_text}</p> : null}
                    <div className="mx-auto w-full max-w-sm rounded-2xl border border-border p-4">
                      {listedMedia(item.media_json).filter((media) => media.video || media.image).map((media) =>
                        media.video ? (
                          <video
                            key={media.role}
                            controls
                            className="w-full rounded-md"
                            src={`/api/deliverables/${deliverable.id}/items/${item.id}/media/${media.role}`}
                          />
                        ) : (
                          // The picture is served only when this caller can see the space.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={media.role}
                            alt={fileLabel({ title: item.title, role: media.role })}
                            className="w-full rounded-md"
                            src={`/api/deliverables/${deliverable.id}/items/${item.id}/media/${media.role}`}
                          />
                        ),
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <AddItemForm deliverableId={deliverable.id} />
            {deliverable.status === "draft" && items.length > 0 ? <PublishForm deliverableId={deliverable.id} /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Post to social</CardTitle>
            <CardDescription>
              Send the caption, pictures, and video of each piece to this client&apos;s accounts. Pick all to schedule the whole round.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!zernioApiKey() ? (
              <p className="text-sm text-muted-foreground">Zernio is not set up. Add the ZERNIO_API_KEY secret to the staff app.</p>
            ) : postable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This client has no social accounts yet.{" "}
                <Link className="underline" href={`/clients/${deliverable.organization_id}?tab=social`}>
                  Connect accounts
                </Link>
              </p>
            ) : pieces.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add pieces before you post.</p>
            ) : (
              <SendToSocialForm
                deliverableId={deliverable.id}
                pieces={pieces}
                accounts={postable.map((account) => ({
                  id: account.id,
                  label: `${PLATFORM_LABEL[account.platform] ?? account.platform} · ${account.display_name ?? account.username ?? account.id}`,
                }))}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pull from a repo</CardTitle>
            <CardDescription>Read a manifest and the pictures it names.</CardDescription>
          </CardHeader>
          <CardContent>
            {repos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Link a repo before you pull finished work.</p>
            ) : !githubReady ? (
              <p className="text-sm text-muted-foreground">GitHub is not connected.</p>
            ) : (
              <PullForm
                deliverableId={deliverable.id}
                repos={repos
                  .filter((repo) => repo.installation_id != null)
                  .map((repo) => ({
                    id: repo.id,
                    fullName: repo.full_name,
                    branch: repo.default_branch || "main",
                  }))}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>The client writes these from their space.</CardDescription>
          </CardHeader>
          <CardContent>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <Timeline
                now={now}
                items={notes.map((note) => ({
                  id: note.id,
                  at: note.created_at,
                  title: note.author_id === caller.userId ? "You" : note.author_kind === "staff" ? "Studio" : "Client",
                  body: note.body ? note.body : "Approved.",
                }))}
              />
            )}
          </CardContent>
        </Card>
      </PageFrame>
    </StaffShell>
  );
}
