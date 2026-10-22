"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveSocialPostAction } from "@/app/clients/social-actions";
import { CancelSocialPostForm, MoveSocialPostForm } from "@/app/clients/social-forms";
import { shelfNote } from "@/lib/finished-shelf";
import { PLATFORM_LABEL } from "@/lib/zernio";
import type { SocialReviewPiece } from "@/lib/social-review";
import { pictureAddress } from "@/lib/picture-role";
import { libraryHref } from "@/components/library/library-view";
import { operationsView, type AttentionRow, type OperationsPost } from "./social-operations";
import { calendarStatusLabel } from "./social-board";
import { SocialCalendarView, type CalendarEvent } from "./social-calendar-view";

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

/** Attention, a count that links to the Library, and one day/week/month calendar. */
export function SocialOperationsPanel({
  attention,
  posts,
  timeZone,
  now,
  waiting,
  ready,
  organizationId,
  canReschedule,
  librarySlug = "",
}: {
  attention: AttentionRow[];
  posts: OperationsCard[];
  timeZone: string;
  now: number;
  waiting: SocialReviewPiece[];
  ready: SocialReviewPiece[];
  organizationId: string;
  canReschedule: boolean;
  librarySlug?: string;
}) {
  const router = useRouter();
  const [account, setAccount] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [collection, setCollection] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [moveMessage, setMoveMessage] = React.useState("");
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
  const selectedPost = posts.find((post) => post.id === selectedId) ?? null;
  const shelfSlug = librarySlug || waiting[0]?.slug || ready[0]?.slug || "";
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
      <div className="flex flex-col gap-3">
          <div className="hidden sm:block">
            <SocialCalendarView
              posts={events}
              timeZone={timeZone}
              now={now}
              initialMode={wide.calendar.mode}
              selectedId={selectedId}
              onSelect={setSelectedId}
              canReschedule={canReschedule}
              onMove={canReschedule ? move : undefined}
            />
          </div>
          <div className="sm:hidden">
            <SocialCalendarView
              posts={events}
              timeZone={timeZone}
              now={now}
              initialMode={phone.calendar.mode}
              selectedId={selectedId}
              onSelect={setSelectedId}
              canReschedule={canReschedule}
              onMove={canReschedule ? move : undefined}
            />
          </div>
          {moveMessage ? <p role="status" className="text-sm text-muted-foreground">{moveMessage}</p> : null}
          {canReschedule ? <p className="text-xs text-muted-foreground">Drag a scheduled post to another day or hour. The time of day stays unless you drop it on an hour.</p> : null}
      </div>
      {selectedPost ? (
        <PostDetail post={selectedPost} organizationId={organizationId} canReschedule={canReschedule} timeZone={timeZone} />
      ) : null}
    </section>
  );
}

function ShelfNotes({ slug, waiting, ready }: { slug: string; waiting: number; ready: number }) {
  const look = shelfNote("waiting", waiting);
  const approved = shelfNote("ready", ready);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        {look.status && slug ? <Link className="underline" href={libraryHref(slug, { status: look.status })}>{look.text}</Link> : look.text}
        {look.status ? " Open it in the Library." : null}
      </p>
      <p>
        {approved.status && slug ? <Link className="underline" href={libraryHref(slug, { status: approved.status })}>{approved.text}</Link> : approved.text}
      </p>
    </div>
  );
}

function PostDetail({
  post,
  organizationId,
  canReschedule,
  timeZone,
}: {
  post: OperationsCard;
  organizationId: string;
  canReschedule: boolean;
  timeZone: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-4 text-sm">
      <p className="font-medium">{post.title}</p>
      <p className="text-muted-foreground">
        {(PLATFORM_LABEL[post.platform] ?? post.platform) || "Post"} · {calendarStatusLabel(post.state)} · {timeZone}
      </p>
      {post.collection ? (
        <Link className="underline" href={`/deliverables/${post.deliverableId}`}>
          {post.collection}
        </Link>
      ) : null}
      {canReschedule && post.state === "scheduled" ? (
        <div className="flex flex-wrap gap-2">
          <MoveSocialPostForm organizationId={organizationId} postId={post.id} timezone={timeZone} />
          <CancelSocialPostForm organizationId={organizationId} postId={post.id} />
        </div>
      ) : null}
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
