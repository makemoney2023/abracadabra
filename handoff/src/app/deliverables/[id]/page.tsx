import Link from "next/link";
import { notFound } from "next/navigation";
import { listDeliverableFeedback, openDeliverable } from "@/db/deliverables";
import { listProjectRepos } from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { readGithubSecrets } from "@/lib/github/secrets";
import { PageFrame } from "@/components/page-frame";
import { Timeline } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../../staff-shell";
import { AddItemForm, PublishForm, PullForm } from "../forms";
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
  const sentBehind = deliverable.published_version != null && deliverable.version > deliverable.published_version;
  const now = clock();
  return (
    <StaffShell>
      <PageFrame
        title={deliverable.title}
        description={`${DELIVERABLE_KIND_LABEL[deliverable.kind]} · ${DELIVERABLE_STATUS_LABEL[deliverable.status]}`}
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
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.title}</p>
                    <Badge variant="secondary">{ITEM_FORMAT_LABEL[item.format]}</Badge>
                  </div>
                  {item.copy_text ? <p className="text-sm">{item.copy_text}</p> : null}
                  <div className="mx-auto w-full max-w-sm rounded-2xl border border-border p-4">
                    {listedMedia(item.media_json).map((media) =>
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
              ))}
            </ul>
            <AddItemForm deliverableId={deliverable.id} />
            {deliverable.status === "draft" && items.length > 0 ? <PublishForm deliverableId={deliverable.id} /> : null}
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
