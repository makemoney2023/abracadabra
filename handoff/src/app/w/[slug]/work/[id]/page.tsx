import Link from "next/link";
import { notFound } from "next/navigation";
import { listDeliverableFeedback, openDeliverable } from "@/db/deliverables";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { ITEM_FORMATS } from "@/lib/deliverable-manifest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DELIVERABLE_STATUS_LABEL, ITEM_FORMAT_LABEL, listedMedia } from "../../../../deliverables/labels";
import { ApproveAllForm, ApproveForm, ChangesForm, NoteForm } from "../forms";

function safeLink(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default async function FinishedPiecePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { slug, id } = await params;
  const { format } = await searchParams;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const opened = await openDeliverable(sql, caller, id, "published");
  if (!opened || opened.deliverable.workspace_id !== workspace.id) notFound();
  const chosen = ITEM_FORMATS.find((item) => item === format) ?? null;
  const items = chosen ? opened.items.filter((item) => item.format === chosen) : opened.items;
  const notes = await listDeliverableFeedback(sql, caller, opened.deliverable.id);
  const version = opened.deliverable.published_version ?? opened.deliverable.version;
  const brief = opened.deliverable.kind === "brief";
  const briefItem = brief ? items.find((item) => item.title === "brief.md") ?? items[0] : undefined;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-4xl leading-tight">{opened.deliverable.title}</h1>
        <p className="text-sm text-muted-foreground">{DELIVERABLE_STATUS_LABEL[opened.deliverable.status]}</p>
        {brief && briefItem ? (
          <div className="flex flex-col gap-6">
            <ApproveAllForm slug={slug} deliverableId={opened.deliverable.id} version={version} label="Approve" />
            <ChangesForm
              slug={slug}
              deliverableId={opened.deliverable.id}
              itemId={briefItem.id}
              version={version}
              label="Deny"
              placeholder="Why are you denying this?"
            />
            <NoteForm slug={slug} deliverableId={opened.deliverable.id} version={version} />
          </div>
        ) : (
          <ApproveAllForm slug={slug} deliverableId={opened.deliverable.id} version={version} />
        )}
      </div>
      {brief ? null : (
        <div className="flex flex-wrap gap-2">
          <Button variant={chosen ? "outline" : "default"} size="sm" asChild>
            <Link href={`/w/${slug}/work/${id}`}>All</Link>
          </Button>
          {ITEM_FORMATS.map((itemFormat) => (
            <Button key={itemFormat} variant={chosen === itemFormat ? "default" : "outline"} size="sm" asChild>
              <Link href={`/w/${slug}/work/${id}?format=${itemFormat}`}>{ITEM_FORMAT_LABEL[itemFormat]}</Link>
            </Button>
          ))}
        </div>
      )}
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to look at yet.</p> : null}
      <ul className="flex flex-col gap-8">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium">{item.title}</h2>
              <Badge variant="secondary">{ITEM_FORMAT_LABEL[item.format]}</Badge>
            </div>
            {item.section ? <p className="text-sm text-muted-foreground">{item.section}</p> : null}
            {item.copy_text ? (
              <p className={brief ? "whitespace-pre-wrap text-sm leading-6" : "text-sm"}>{item.copy_text}</p>
            ) : null}
            {safeLink(item.link_url) ? (
              <a className="text-sm underline" href={safeLink(item.link_url) ?? "#"}>
                Open link
              </a>
            ) : null}
            <div className="mx-auto w-full max-w-sm rounded-2xl border border-border p-4">
              {listedMedia(item.media_json).map((media) =>
                media.video ? (
                  <video
                    key={media.role}
                    controls
                    className="w-full rounded-md"
                    src={`/api/deliverables/${opened.deliverable.id}/items/${item.id}/media/${media.role}`}
                  />
                ) : (
                  // The picture is served only when this caller can see the space.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={media.role}
                    alt=""
                    className="w-full rounded-md"
                    src={`/api/deliverables/${opened.deliverable.id}/items/${item.id}/media/${media.role}`}
                  />
                ),
              )}
            </div>
            {brief ? null : (
              <div className="flex flex-col gap-3">
                <ApproveForm
                  slug={slug}
                  deliverableId={opened.deliverable.id}
                  itemId={item.id}
                  version={version}
                  label="Approve"
                />
                <ChangesForm slug={slug} deliverableId={opened.deliverable.id} itemId={item.id} version={version} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {notes.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Notes</h2>
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
        </section>
      ) : null}
    </main>
  );
}
