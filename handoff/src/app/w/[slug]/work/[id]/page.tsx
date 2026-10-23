import Link from "next/link";
import { notFound } from "next/navigation";
import { listDeliverableFeedback, openDeliverable } from "@/db/deliverables";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { parseFilingSummary } from "@/lib/filing-summary";
import { seesHeldWork } from "@/lib/held-work";
import { FilingSummaryCard } from "@/components/filing-summary-card";
import { ITEM_FORMATS } from "@/lib/deliverable-manifest";
import { SocialPieceCard } from "@/components/social/social-piece-card";
import { itemDestinationPlatforms, previewPlatforms } from "@/components/social/platform-post-preview";
import { isSocialItemFormat, pieceCardView } from "@/components/social/social-piece-view";
import { pieceSettings } from "@/lib/social";
import { approvalControlLabel, getAutopost } from "@/lib/social-autopost";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DELIVERABLE_STATUS_LABEL, ITEM_FORMAT_LABEL, listedMedia } from "../../../../deliverables/labels";
import { ApproveAllForm, ChangesForm, NoteForm, PieceDecision } from "../forms";
import { sentConfirmation } from "../sent";
import { can } from "@/lib/authz";
import { CollectionIndex } from "@/components/library/collection-index";
import { CollectionItemState, CollectionReviewFooter, CollectionReviewHeader } from "@/components/library/collection-review";
import { ProofSchedule } from "@/components/social/proof-schedule";
import { removalLine } from "@/lib/finished-shelf";
import { isEligibleSocialPlatform, PLATFORM_LABEL } from "@/lib/zernio";
import { ArticleCard } from "@/components/library/article-card";
import { ViewLinkDialog } from "@/components/library/view-link-dialog";
import { libraryViewLinksEnabled, listViewLinks } from "@/lib/library-shares";
import { projectLibraryArtifact } from "@/lib/library-artifacts";
import { isBuildContext, isCaptionSheet } from "@/lib/library-context";

/** The filing's own summary page stored as a file ("summary.md", "<title> - summary.md", "summary (2).md"). */
function isSummaryFile(title: string): boolean {
  return /(^| - )summary( \(\d+\))?\.md$/i.test(title);
}

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
  searchParams: Promise<{ format?: string; sent?: string; item?: string }>;
}) {
  const { slug, id } = await params;
  const { format, sent, item } = await searchParams;
  const confirmation = sentConfirmation(sent);
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const opened = await openDeliverable(sql, caller, id, "published");
  if (!opened || opened.deliverable.workspace_id !== workspace.id) notFound();
  const chosen = ITEM_FORMATS.find((itemFormat) => itemFormat === format) ?? null;
  const brief = opened.deliverable.kind === "brief";
  const finished = opened.items.filter((row) => brief || (
    !isBuildContext({ title: row.title, linkUrl: row.link_url })
    && !isCaptionSheet({ format: row.format, copyText: row.copy_text })
  ));
  const focusId = finished.some((row) => row.id === item) ? item ?? null : null;
  // Only the kinds this piece has (and the one picked), so the filter row stays short.
  const shownFormats = ITEM_FORMATS.filter((itemFormat) => itemFormat === chosen || finished.some((row) => row.format === itemFormat));
  const pool = focusId ? finished.filter((row) => row.id === focusId) : finished;
  const items = !focusId && chosen ? pool.filter((row) => row.format === chosen) : pool;
  const removedAt = new Map(
    (await sql.all<{ id: string; removed_at: number | null }>(
      "SELECT id, removed_at FROM deliverable_items WHERE deliverable_id = ? AND version = ?",
      [opened.deliverable.id, opened.deliverable.published_version ?? opened.deliverable.version],
    )).map((row) => [row.id, row.removed_at] as const),
  );
  const notes = await listDeliverableFeedback(sql, caller, opened.deliverable.id);
  const version = opened.deliverable.published_version ?? opened.deliverable.version;
  const articleMetadata = new Map(
    (await sql.all<{
      item_id: string;
      artifact_type: string;
      dek: string | null;
      canonical_url: string | null;
      author_name: string | null;
      external_published_at: number | null;
      article_status: string | null;
    }>(
      `SELECT item_id, artifact_type, dek, canonical_url, author_name, external_published_at, article_status
       FROM deliverable_artifact_metadata
       WHERE deliverable_id = ? AND version = ?`,
      [opened.deliverable.id, version],
    )).map((row) => [row.item_id, row] as const),
  );
  const briefItem = brief ? items.find((item) => item.title === "brief.md") ?? items[0] : undefined;
  // Agent filings: the summary page renders as a card. Clients never see the agent, card or reference ids.
  const viewer = seesHeldWork(caller, workspace.id) || caller.staff ? "staff" : "client";
  const filings = new Map(
    items.flatMap((item) => {
      const parsed = item.format === "page" ? parseFilingSummary(item.copy_text) : null;
      return parsed ? [[item.id, parsed] as const] : [];
    }),
  );
  const fileLinks = Object.fromEntries(
    items.filter((item) => !filings.has(item.id) && item.format !== "link").map((item) => [item.title.toLowerCase(), `#item-${item.id}`]),
  );
  // A file's section is its filing's title, already the heading of the card above it.
  const autopost = await getAutopost(sql, opened.deliverable.organization_id);
  const approveLabel = approvalControlLabel(autopost);
  const hasSocial = opened.items.some((item) => isSocialItemFormat(item.format));
  const approveAllLabel = autopost.enabled && hasSocial ? approveLabel.replace(/^Approve\b/, "Approve all") : "Approve all";
  const filingTitles = new Set([...filings.values()].map((filing) => filing.title));
  const indexPieces = items.flatMap((item) => {
    if (isSummaryFile(item.title) && item.section && filingTitles.has(item.section)) return [];
    const picture = listedMedia(item.media_json).find((entry) => entry.image || entry.video);
    return [{
      id: item.id,
      title: item.title,
      caption: picture && item.copy_text?.trim() ? item.copy_text.trim() : null,
      status: removedAt.get(item.id) != null ? "removed" : item.status,
      previewSrc: picture ? `/api/deliverables/${opened.deliverable.id}/items/${item.id}/media/${picture.role}` : null,
    }];
  });
  const removal = focusId
    ? await sql.get<{ actor_kind: string; actor_id: string | null; created_at: number }>(
        `SELECT actor_kind, actor_id, created_at FROM activities
         WHERE workspace_id = ? AND kind = 'library_item_removed' AND json_extract(data_json, '$.itemId') = ?
         ORDER BY created_at DESC LIMIT 1`,
        [workspace.id, focusId],
      )
    : undefined;
  const scheduleAccounts = focusId && viewer === "staff"
    ? (await sql.all<{ id: string; platform: string; username: string | null; display_name: string | null }>(
        `SELECT id, platform, username, display_name FROM social_accounts
         WHERE organization_id = ? AND is_active = 1 ORDER BY platform, username`,
        [opened.deliverable.organization_id],
      )).flatMap((account) => (
        isEligibleSocialPlatform(account.platform)
          ? [{
              id: account.id,
              label: `${PLATFORM_LABEL[account.platform] ?? account.platform} · ${account.display_name ?? account.username ?? "Account"}`,
            }]
          : []
      ))
    : [];
  const destinations = await itemDestinationPlatforms(sql, opened.deliverable.id);
  const viewShares = libraryViewLinksEnabled() && can(caller, "view_link.manage", { workspaceId: workspace.id })
    ? await listViewLinks(sql, caller, workspace.id)
    : null;
  const socialSettings = new Map(
    await Promise.all(
      items.filter((item) => isSocialItemFormat(item.format)).map(async (item) => [item.id, await pieceSettings(sql, item.id)] as const),
    ),
  );
  const filingFiles = (summaryItem: (typeof items)[number]) =>
    items.filter((item) => item.id !== summaryItem.id && item.format !== "link" && item.section === summaryItem.section).length;
  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-1 flex-col gap-8 px-6 py-[4rem] pb-28">
      {confirmation ? (
        <div role="status" aria-live="polite" tabIndex={-1} className="flex flex-col gap-1 rounded-2xl border border-border bg-muted/40 px-5 py-4">
          <p className="text-sm font-medium">{confirmation.title}</p>
          <p className="text-sm text-muted-foreground">{confirmation.body}</p>
        </div>
      ) : null}
      <CollectionReviewHeader
        title={opened.deliverable.title}
        status={DELIVERABLE_STATUS_LABEL[opened.deliverable.status]}
        version={version}
        deliveredAt={opened.deliverable.published_at}
        reviewed={items.filter((item) => item.status === "approved" || item.status === "changes_requested").length}
        total={items.length}
        approved={items.filter((item) => item.status === "approved").length}
        changes={items.filter((item) => item.status === "changes_requested").length}
        pending={items.filter((item) => item.status === "pending" && removedAt.get(item.id) == null).length}
      />
      <p className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href={`/w/${slug}/library`}>Back to Library</Link>
        {focusId ? <Link className="underline" href={`/w/${slug}/work/${id}`}>See the whole set</Link> : null}
      </p>
      {focusId ? <p className="text-sm text-muted-foreground">This is the piece. Approve it, ask for a change, or remove it.</p> : null}
      {libraryViewLinksEnabled() && can(caller, "view_link.manage", { workspaceId: workspace.id }) ? (
        <details className="rounded-2xl border border-border bg-card p-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-optic">Share</summary>
          <div className="mt-3">
            <ViewLinkDialog
              workspaceId={workspace.id}
              shares={viewShares?.ok ? viewShares.shares : []}
              items={items.map((item) => ({ resourceKind: "deliverable_item" as const, resourceId: item.id, resourceVersion: version }))}
            />
          </div>
        </details>
      ) : null}
      {brief || shownFormats.length < 2 ? null : (
        <div className="flex flex-wrap gap-2">
          <Button variant={chosen ? "outline" : "default"} size="sm" asChild>
            <Link href={`/w/${slug}/work/${id}`}>All</Link>
          </Button>
          {shownFormats.map((itemFormat) => (
            <Button key={itemFormat} variant={chosen === itemFormat ? "default" : "outline"} size="sm" asChild>
              <Link href={`/w/${slug}/work/${id}?format=${itemFormat}`}>{ITEM_FORMAT_LABEL[itemFormat]}</Link>
            </Button>
          ))}
        </div>
      )}
      {!focusId && !brief ? (
        <CollectionIndex slug={slug} deliverableId={opened.deliverable.id} pieces={indexPieces} />
      ) : (
      <>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to look at yet.</p> : null}
      <ul className="flex flex-col gap-8">
        {items.map((item) => {
          const filing = filings.get(item.id);
          if (filing) {
            return (
              <li key={item.id} id={`item-${item.id}`} className="flex scroll-mt-6 flex-col gap-3">
                <FilingSummaryCard
                  summary={filing}
                  viewer={viewer}
                  raw={viewer === "staff" ? item.copy_text ?? undefined : undefined}
                  fileLinks={fileLinks}
                  fileCount={filingFiles(item)}
                />
                {brief ? null : (
                  <PieceDecision
                    slug={slug}
                    deliverableId={opened.deliverable.id}
                    itemId={item.id}
                    version={version}
                    removed={removedAt.get(item.id) != null}
                    approveLabel="Approve"
                  />
                )}
                {focusId && removedAt.get(item.id) != null && removal ? (
                  <p className="text-sm text-muted-foreground">
                    {removalLine({ viewer, actorKind: removal.actor_kind, actorId: removal.actor_id ?? "Studio", at: removal.created_at })}
                  </p>
                ) : null}
                {focusId && isSocialItemFormat(item.format) ? (
                  <ProofSchedule
                    staff={viewer === "staff"}
                    approved={item.status === "approved" && removedAt.get(item.id) == null}
                    deliverableId={opened.deliverable.id}
                    itemId={item.id}
                    version={version}
                    organizationId={opened.deliverable.organization_id}
                    accounts={scheduleAccounts}
                  />
                ) : null}
              </li>
            );
          }
          if (isSummaryFile(item.title) && item.section && filingTitles.has(item.section)) return null;
          const metadata = articleMetadata.get(item.id);
          const link = safeLink(metadata?.canonical_url ?? item.link_url);
          const article = item.format === "link"
            ? projectLibraryArtifact({
                sourceKind: "deliverable_item",
                sourceId: item.id,
                version,
                workspaceId: workspace.id,
                organizationId: opened.deliverable.organization_id,
                title: item.title,
                format: "link",
                hasArticleMetadata: metadata?.artifact_type === "article" || Boolean(metadata) || item.format === "link",
                canonicalUrl: link,
                dek: metadata?.dek ?? (item.copy_text && item.copy_text.length <= 280 ? item.copy_text : null),
                authorName: metadata?.author_name,
                publishedAt: metadata?.external_published_at ?? opened.deliverable.published_at,
                approval: item.status === "approved" ? "approved" : item.status === "changes_requested" ? "changes_requested" : "needs_review",
                publication: metadata?.article_status === "published" ? "published" : "not_published",
                updatedAt: opened.deliverable.updated_at,
                audience: viewer === "staff" ? "staff" : "client",
                href: `#item-${item.id}`,
              })
            : null;
          const listed = listedMedia(item.media_json);
          const media = listed.filter((entry) => entry.video || entry.image);
          const storedFile = media.length === 0 && listed.length > 0;
          const social = isSocialItemFormat(item.format);
          const settings = socialSettings.get(item.id);
          return (
            <li key={item.id} id={`item-${item.id}`} className="flex scroll-mt-6 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-medium">{item.title}</h2>
                <Badge variant="secondary">{ITEM_FORMAT_LABEL[item.format]}</Badge>
                <CollectionItemState status={item.status} />
              </div>
              {item.section && !filingTitles.has(item.section) ? <p className="text-sm text-muted-foreground">{item.section}</p> : null}
              {item.copy_text && !social && !article && media.length === 0 ? (
                <p className={brief ? "whitespace-pre-wrap text-sm leading-6" : "text-sm"}>{item.copy_text}</p>
              ) : null}
              {article ? <ArticleCard artifact={article} /> : link ? (
                <a className="text-sm underline" href={link}>
                  Open link
                </a>
              ) : null}
              {storedFile ? (
                <p className="text-sm text-muted-foreground">
                  This file is in your{" "}
                  <Link href={`/w/${slug}`} className="underline underline-offset-4">
                    Files
                  </Link>
                  .
                </p>
              ) : null}
              {social ? (
                <SocialPieceCard
                  caption={item.copy_text ?? ""}
                  accountName={workspace.display_name}
                  platforms={previewPlatforms({
                    channel: item.channel,
                    textPlatforms: Object.keys(settings?.texts ?? {}),
                    targetPlatforms: destinations.get(item.id) ?? [],
                  })}
                  captions={settings?.texts}
                  view={pieceCardView({
                    title: item.title,
                    format: item.format,
                    caption: item.copy_text ?? "",
                    mediaJson: item.media_json,
                    status: item.status,
                    targets: (destinations.get(item.id) ?? []).map((platform) => ({ platform, outcome: "unpublished" })),
                  })}
                  media={media.map((entry) => ({
                    role: entry.role,
                    video: entry.video,
                    alt: item.title || "Finished work",
                    src: `/api/deliverables/${opened.deliverable.id}/items/${item.id}/media/${entry.role}`,
                  }))}
                />
              ) : media.length > 0 ? (
                <div className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border p-4">
                  {media.map((entry) =>
                    entry.video ? (
                      <video
                        key={entry.role}
                        controls
                        className="w-full rounded-md"
                        src={`/api/deliverables/${opened.deliverable.id}/items/${item.id}/media/${entry.role}`}
                      />
                    ) : (
                      // The picture is served only when this caller can see the space.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={entry.role}
                        alt={item.title || "Finished work"}
                        className="w-full rounded-md"
                        src={`/api/deliverables/${opened.deliverable.id}/items/${item.id}/media/${entry.role}`}
                      />
                    ),
                  )}
                  {item.copy_text?.trim() ? <p className="whitespace-pre-wrap text-sm">{item.copy_text.trim()}</p> : null}
                </div>
              ) : null}
              {brief ? null : (
                <PieceDecision
                  slug={slug}
                  deliverableId={opened.deliverable.id}
                  itemId={item.id}
                  version={version}
                  removed={removedAt.get(item.id) != null}
                  approveLabel={isSocialItemFormat(item.format) ? approveLabel : "Approve"}
                />
              )}
              {focusId && removedAt.get(item.id) != null && removal ? (
                <p className="text-sm text-muted-foreground">
                  {removalLine({ viewer, actorKind: removal.actor_kind, actorId: removal.actor_id ?? "Studio", at: removal.created_at })}
                </p>
              ) : null}
              {focusId && isSocialItemFormat(item.format) ? (
                <ProofSchedule
                  staff={viewer === "staff"}
                  approved={item.status === "approved" && removedAt.get(item.id) == null}
                  deliverableId={opened.deliverable.id}
                  itemId={item.id}
                  version={version}
                  organizationId={opened.deliverable.organization_id}
                  accounts={scheduleAccounts}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      </>
      )}
      {focusId && !brief ? null : (
      <CollectionReviewFooter
        pending={items.filter((item) => item.status === "pending" && removedAt.get(item.id) == null).length}
        changes={items.filter((item) => item.status === "changes_requested" && removedAt.get(item.id) == null).length}
      >
        {brief && briefItem ? (
          <div className="flex flex-col gap-3">
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
        ) : items.some((item) => item.status === "pending" && removedAt.get(item.id) == null) ? (
            <ApproveAllForm slug={slug} deliverableId={opened.deliverable.id} version={version} label={`${approveAllLabel} (${items.filter((item) => item.status === "pending" && removedAt.get(item.id) == null).length})`} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing is waiting for approval.</p>
        )}
      </CollectionReviewFooter>
      )}
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
