import Link from "next/link";
import { notFound } from "next/navigation";
import { listDeliverableFeedback, openDeliverable } from "@/db/deliverables";
import { listProjectRepos } from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import { readGithubSecrets } from "@/lib/github/secrets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../../staff-shell";
import { AddItemForm, PublishForm, PullForm } from "../forms";
import { DELIVERABLE_KIND_LABEL, DELIVERABLE_STATUS_LABEL, ITEM_FORMAT_LABEL, listedMedia } from "../labels";

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
  return (
    <StaffShell>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-4xl leading-tight">{deliverable.title}</h1>
          <p className="text-sm text-muted-foreground">
            {DELIVERABLE_KIND_LABEL[deliverable.kind]} · {DELIVERABLE_STATUS_LABEL[deliverable.status]}
          </p>
          {sentBehind ? (
            <p className="text-sm">Clients still see the last round you sent. This one is not sent yet.</p>
          ) : null}
          {deliverable.published_version != null && space ? (
            <Button variant="outline" size="sm" className="w-fit" asChild>
              <Link href={`/w/${space.slug}/work/${deliverable.id}`}>See what the client sees</Link>
            </Button>
          ) : null}
        </div>
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
                          alt=""
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
        {notes.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3 text-sm">
                {notes.map((note) => (
                  <li key={note.id}>
                    <span className="text-muted-foreground">
                      {note.author_id === caller.userId ? "You" : note.author_kind === "staff" ? "Studio" : "Client"}
                    </span>
                    {note.body ? <p>{note.body}</p> : <p>Approved.</p>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </StaffShell>
  );
}
