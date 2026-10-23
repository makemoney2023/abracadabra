"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { moveSocialPostAction, placeSocialPieceAction } from "@/app/clients/social-actions";
import { ApproveForm, ChangesForm } from "@/app/w/[slug]/work/forms";
import { pieceOpenHref, shelfNote } from "@/lib/finished-shelf";
import { PLATFORM_LABEL } from "@/lib/zernio";
import type { SocialReviewPiece } from "@/lib/social-review";
import { pictureAddress } from "@/lib/picture-role";
import { libraryHref } from "@/components/library/library-view";
import { clientSocialReview } from "./client-social-review";
import { ReviewList, waitingHeading } from "./social-rail";
import { SocialPieceCard } from "./social-piece-card";
import { pieceCardView } from "./social-piece-view";
import { operationsView, type AttentionRow, type OperationsPost } from "./social-operations";
import { calendarStatusLabel, visibleReview } from "./social-board";
import { SocialCalendarView, type CalendarEvent, type QuickAction } from "./social-calendar-view";
import { fallbackPreview, SocialPostPreview, type PreviewIntent } from "./social-post-preview";
import type { PostPreviewData } from "./post-preview-model";

export type OperationsCard = OperationsPost & {
  deliverableId: string;
  itemId: string;
  accountId: string;
  accountLabel: string;
  collection: string;
  approval?: string;
  cancelled?: boolean;
};

const ATTENTION_LABEL: Record<string, string> = {
  disconnected_account: "Needs sign-in",
  upload_failure: "Upload failed",
  rejected_target: "Rejected",
  missing_requirement: "Missing a requirement",
  stale_plan: "Plan is out of date",
  uncertain_outcome: "Outcome unclear",
};

/** Attention, the pieces waiting for a decision, and one day/week/month calendar. */
export function SocialOperationsPanel({
  attention,
  posts,
  timeZone,
  now,
  waiting,
  ready,
  approveLabel,
  organizationId,
  canReschedule,
  initialPieceId = null,
  initialPostId = null,
  scheduleNotice = null,
  librarySlug = "",
  previews = {},
}: {
  attention: AttentionRow[];
  posts: OperationsCard[];
  timeZone: string;
  now: number;
  waiting: SocialReviewPiece[];
  ready: SocialReviewPiece[];
  approveLabel: string;
  organizationId: string;
  canReschedule: boolean;
  initialPieceId?: string | null;
  initialPostId?: string | null;
  scheduleNotice?: string | null;
  librarySlug?: string;
  /** What each post's preview shows, by post id. A post with no entry opens with what the calendar card knows. */
  previews?: Record<string, PostPreviewData>;
}) {
  const router = useRouter();
  const [account, setAccount] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [collection, setCollection] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(initialPostId || initialPieceId || waiting[0]?.id || null);
  const [armed, setArmed] = React.useState(Boolean(initialPieceId || initialPostId));
  const [moveMessage, setMoveMessage] = React.useState(scheduleNotice ?? "");
  const [open, setOpen] = React.useState<{ id: string; intent: PreviewIntent } | null>(
    initialPostId && posts.some((post) => post.id === initialPostId) ? { id: initialPostId, intent: "view" } : null,
  );
  const choose = (id: string) => {
    setSelectedId(id);
    setArmed(true);
  };
  const opener = React.useRef<HTMLElement | null>(null);
  const openPost = (id: string, intent: PreviewIntent = "view") => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    choose(id);
    if (posts.some((post) => post.id === id)) setOpen({ id, intent });
  };
  const quick = (id: string, action: QuickAction) => openPost(id, action);
  const openPiece = (piece: SocialReviewPiece) => pieceOpenHref(piece.slug, piece.deliverableId, piece.id);
  const filtered = posts.filter((post) => {
    if (account && post.accountId !== account) return false;
    if (platform && post.platform !== platform) return false;
    if (collection && post.collection !== collection) return false;
    if (status && post.state !== status) return false;
    return true;
  });
  const wide = operationsView({ narrow: false, attention, posts: filtered });
  const phone = operationsView({ narrow: true, attention, posts: filtered });
  const accounts = [...new Map(posts.filter((post) => post.accountId).map((post) => [post.accountId, post.accountLabel || post.accountId])).entries()];
  const platforms = [...new Set(posts.map((post) => post.platform).filter(Boolean))];
  const collections = [...new Set(posts.map((post) => post.collection).filter(Boolean))];
  const statuses = [...new Set(posts.map((post) => post.state).filter(Boolean))];
  const review = visibleReview(waiting, platform);
  const approved = visibleReview(ready, platform);
  const shelfSlug = librarySlug || waiting[0]?.slug || ready[0]?.slug || "";
  const selectedPost = posts.find((post) => post.id === selectedId) ?? null;
  const selectedPiece =
    review.find((piece) => piece.id === selectedId) ??
    approved.find((piece) => piece.id === selectedId) ??
    review.find((piece) => piece.id === selectedPost?.itemId) ??
    null;
  const events: CalendarEvent[] = filtered.map((post) => ({
    id: post.id,
    title: post.title,
    platform: post.platform,
    state: post.state,
    at: post.at,
    approval: post.approval,
    cancelled: post.cancelled,
    itemId: post.itemId,
    thumbnailSrc: post.deliverableId && post.itemId && post.thumbnailRole ? pictureAddress(post.deliverableId, post.itemId, post.thumbnailRole) : undefined,
  }));
  const move = async (postId: string, startAt: string) => {
    const body = new FormData();
    body.set("organizationId", organizationId);
    body.set("postId", postId);
    body.set("startAt", startAt);
    body.set("timezone", timeZone);
    const result = await moveSocialPostAction(null, body);
    setMoveMessage(result.ok ? result.message : result.error);
    if (result.ok) router.refresh();
  };
  const place = async (pieceId: string, startAt: string) => {
    const piece = approved.find((row) => row.id === pieceId) ?? review.find((row) => row.id === pieceId);
    if (!piece) return;
    const body = new FormData();
    body.set("organizationId", organizationId);
    body.set("deliverableId", piece.deliverableId);
    body.set("itemId", pieceId);
    body.set("startAt", startAt);
    body.set("timezone", timeZone);
    const result = await placeSocialPieceAction(null, body);
    setMoveMessage(result.ok ? result.message : result.error);
    if (result.ok) router.refresh();
  };
  const openPostCard = open ? posts.find((post) => post.id === open.id) ?? null : null;
  const approveReturn = canReschedule ? `/clients/${organizationId}?tab=social` : selectedPiece ? `/w/${selectedPiece.slug}/social` : "";
  const inWaitingList = selectedPiece ? review.some((piece) => piece.id === selectedPiece.id) : false;
  const wantsApprove = armed && selectedPiece != null && selectedPiece.status !== "approved";
  const approveNode = wantsApprove && inWaitingList && selectedPiece ? (
    <ApproveForm slug={selectedPiece.slug} deliverableId={selectedPiece.deliverableId} itemId={selectedPiece.id} version={selectedPiece.version} label={approveLabel} returnTo={approveReturn} />
  ) : null;
  return (
    <section id="attention" className="flex flex-col gap-4">
      {canReschedule || attention.length > 0 ? (
        <>
          <h3 className="text-sm font-semibold">Needs attention</h3>
          {wide.recoveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {attention.map((item) => {
                const recovery = wide.recoveries.find((row) => row.id === item.id);
                return (
                  <li key={item.id}>
                    {PLATFORM_LABEL[item.platform] ?? item.platform} · {ATTENTION_LABEL[item.kind] ?? "Review"}
                    {recovery?.action === "connect" ? (
                      <>
                        {" "}
                        · <a className="underline" href="#account_health">Sign in again</a>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
      <div className="flex flex-wrap gap-2 text-sm">
        <Choice label="Account" value={account} options={accounts.map(([value, label]) => ({ value, label }))} onChange={setAccount} />
        <Choice label="Platform" value={platform} options={platforms.map((value) => ({ value, label: PLATFORM_LABEL[value] ?? value }))} onChange={setPlatform} />
        <Choice label="Collection" value={collection} options={collections.map((value) => ({ value, label: value }))} onChange={setCollection} />
        <Choice label="Status" value={status} options={statuses.map((value) => ({ value, label: calendarStatusLabel(value) }))} onChange={setStatus} />
      </div>
      <ShelfNotes slug={shelfSlug} waiting={waiting.length} ready={ready.length} />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="flex flex-col gap-4">
          <ReviewList
            title={waitingHeading(review.length)}
            empty="Nothing is waiting for a look."
            pieces={review}
            selectedId={selectedId}
            onSelect={choose}
            showCount={false}
            hrefFor={openPiece}
            approvePieceId={approveNode ? selectedPiece?.id ?? null : null}
            approve={approveNode}
          />
          <ReviewList
            title="Approved, not on the calendar"
            empty="Approved work is on the calendar, or not ready yet."
            pieces={approved}
            selectedId={selectedId}
            onSelect={choose}
            hrefFor={openPiece}
            draggableIds={canReschedule ? approved.map((piece) => piece.id) : []}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="hidden sm:block">
            <SocialCalendarView
              posts={events}
              timeZone={timeZone}
              now={now}
              initialMode={wide.calendar.mode}
              selectedId={selectedId}
              onSelect={openPost}
              canReschedule={canReschedule}
              onMove={canReschedule ? move : undefined}
              onPlace={canReschedule ? place : undefined}
              onQuick={canReschedule ? quick : undefined}
            />
          </div>
          <div className="sm:hidden">
            <SocialCalendarView
              posts={events}
              timeZone={timeZone}
              now={now}
              initialMode={phone.calendar.mode}
              selectedId={selectedId}
              onSelect={openPost}
              canReschedule={canReschedule}
              onMove={canReschedule ? move : undefined}
              onPlace={canReschedule ? place : undefined}
              onQuick={canReschedule ? quick : undefined}
            />
          </div>
          {moveMessage ? <p role="status" className="text-sm text-muted-foreground">{moveMessage}</p> : null}
          {canReschedule ? <p className="text-xs text-muted-foreground">Drag a scheduled post to another day or hour, or drag an approved piece onto a day. The time of day stays unless you drop it on an hour.</p> : null}
        </div>
      </div>
      {selectedPiece ? (
        <PieceDetail piece={selectedPiece} approveLabel={approveLabel} organizationId={organizationId} canReschedule={canReschedule} showApprove={wantsApprove && !inWaitingList} />
      ) : null}
      {openPostCard ? (
        <SocialPostPreview
          data={previews[openPostCard.id] ?? fallbackPreview({ ...openPostCard, accountLabel: openPostCard.accountLabel })}
          others={Object.values(previews)}
          intent={open?.intent ?? "view"}
          canAct={canReschedule}
          organizationId={organizationId}
          librarySlug={librarySlug}
          now={now}
          onClose={() => setOpen(null)}
          onDone={setMoveMessage}
          restoreFocus={() => opener.current?.focus()}
        />
      ) : null}
    </section>
  );
}

function PieceDetail({
  piece,
  approveLabel,
  organizationId,
  canReschedule,
  showApprove,
}: {
  piece: SocialReviewPiece;
  approveLabel: string;
  organizationId: string;
  canReschedule: boolean;
  showApprove: boolean;
}) {
  const returnTo = canReschedule ? `/clients/${organizationId}?tab=social` : `/w/${piece.slug}/social`;
  const network = piece.platforms[0];
  const summary = network
    ? clientSocialReview({
        title: piece.title,
        caption: piece.caption,
        mediaRoles: piece.media.map((item) => item.role),
        platform: network,
        targetState: piece.status,
        cadenceEnabled: approveLabel !== "Approve",
        cadenceLabel: approveLabel,
        previewSlots: [],
        fingerprint: "shown",
        confirmedFingerprint: "shown",
        role: "owner",
      })
    : null;
  const view = pieceCardView({
    title: piece.title,
    format: piece.format,
    caption: piece.caption,
    mediaJson: JSON.stringify(piece.media.map((item) => ({ role: item.role, content_type: item.contentType, r2_key: item.role }))),
    status: piece.status,
    targets: piece.platforms.map((platform) => ({ platform, outcome: "unpublished" })),
  });
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{piece.deliverableTitle}</p>
      {summary ? <p className="text-sm">{summary.platformState}</p> : null}
      <SocialPieceCard
        view={view}
        caption={piece.caption}
        accountName={piece.accountName}
        platforms={piece.platforms}
        media={piece.media.map((item) => ({
          role: item.role,
          video: item.video,
          alt: piece.title,
          src: `/api/deliverables/${piece.deliverableId}/items/${piece.id}/media/${item.role}`,
        }))}
      />
      {piece.status === "approved" ? (
        canReschedule ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/deliverables/${piece.deliverableId}`}>Schedule from finished work</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {approveLabel === "Approve" ? "Approved. The studio still has to put it on a day." : "Approved. It is not on the calendar yet."}
          </p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {showApprove ? <ApproveForm slug={piece.slug} deliverableId={piece.deliverableId} itemId={piece.id} version={piece.version} label={approveLabel} returnTo={returnTo} /> : null}
          <ChangesForm slug={piece.slug} deliverableId={piece.deliverableId} itemId={piece.id} version={piece.version} returnTo={returnTo} />
        </div>
      )}
    </div>
  );
}

function ShelfNotes({ slug, waiting, ready }: { slug: string; waiting: number; ready: number }) {
  const look = shelfNote("waiting", waiting);
  const approved = shelfNote("ready", ready);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        {look.status && slug ? <Link className="underline" href={libraryHref(slug, { status: look.status })}>{look.text}</Link> : look.text}
      </p>
      <p>
        {approved.status && slug ? <Link className="underline" href={libraryHref(slug, { status: approved.status })}>{approved.text}</Link> : approved.text}
      </p>
    </div>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      {label}
      <select className="h-8 rounded-md border border-input bg-transparent px-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
