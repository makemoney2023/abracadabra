"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, Trash2Icon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelSocialPostAction, moveSocialPostAction } from "@/app/clients/social-actions";
import { RetrySocialPostForm } from "@/app/clients/social-forms";
import { pieceOpenHref } from "@/lib/finished-shelf";
import { pictureAddress } from "@/lib/picture-role";
import { postActionState } from "@/lib/social-post-guard";
import { PLATFORM_LABEL } from "@/lib/zernio";
import { accountsLine, rescheduleCheck, whenLabel, type PostPreviewData } from "./post-preview-model";
import { calendarStatusLabel } from "./social-board";
import { zonedInputValue } from "./social-calendar";
import { SocialPieceCard } from "./social-piece-card";
import { pieceCardView } from "./social-piece-view";

export type PreviewIntent = "view" | "reschedule" | "remove";

export type PreviewPostSummary = { id: string; title: string; state: string; at: number; timezone: string; accountLabel: string };

/** A post the loader could not read still opens, with what the calendar card knows. */
export function fallbackPreview(post: PreviewPostSummary & { deliverableId: string; itemId: string; collection: string }): PostPreviewData {
  return {
    postId: post.id,
    itemId: post.itemId,
    deliverableId: post.deliverableId,
    deliverableTitle: post.collection,
    title: post.title,
    status: post.state,
    postType: "image",
    format: "static",
    scheduledFor: post.at,
    timezone: post.timezone || "UTC",
    accounts: post.accountLabel ? [{ id: "", platform: "", name: post.accountLabel, label: post.accountLabel }] : [],
    caption: "",
    captions: {},
    media: [],
    pieceStatus: null,
    hasScheduledCopy: true,
    error: null,
    skipped: null,
    publishedLinks: [],
  };
}

/** What a click on a scheduled post opens: the post as it will appear, with Reschedule and Remove for staff. */
export function SocialPostPreview({
  data,
  others,
  intent,
  canAct,
  organizationId,
  librarySlug,
  now,
  onClose,
  onDone,
  restoreFocus,
}: {
  data: PostPreviewData;
  others: PostPreviewData[];
  intent: PreviewIntent;
  canAct: boolean;
  organizationId: string;
  librarySlug: string;
  now: number;
  onClose: () => void;
  onDone: (message: string) => void;
  /** Puts focus back on the chip that opened this, since nothing here is a Radix trigger. */
  restoreFocus?: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto bg-card sm:max-w-4xl"
        data-testid="post-preview"
        onCloseAutoFocus={(event) => {
          if (!restoreFocus) return;
          event.preventDefault();
          restoreFocus();
        }}
      >
        <PreviewBody
          key={data.postId}
          data={data}
          others={others}
          intent={intent}
          canAct={canAct}
          organizationId={organizationId}
          librarySlug={librarySlug}
          now={now}
          onClose={onClose}
          onDone={onDone}
        />
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  data,
  others,
  intent,
  canAct,
  organizationId,
  librarySlug,
  now,
  onClose,
  onDone,
}: {
  data: PostPreviewData;
  others: PostPreviewData[];
  intent: PreviewIntent;
  canAct: boolean;
  organizationId: string;
  librarySlug: string;
  now: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const guard = postActionState({ status: data.status, hasScheduledCopy: data.hasScheduledCopy });
  const [editing, setEditing] = React.useState(intent === "reschedule" && guard.canReschedule);
  const [confirmRemove, setConfirmRemove] = React.useState(intent === "remove" && guard.canRemove);
  const [local, setLocal] = React.useState(() => (data.scheduledFor == null ? "" : zonedInputValue(data.scheduledFor, data.timezone)));
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const check = rescheduleCheck({ local, timeZone: data.timezone, now, current: data, others });
  const platforms = [...new Set(data.accounts.map((account) => account.platform).filter(Boolean))];
  const live = data.status === "scheduled" || data.status === "draft";
  const view = pieceCardView({
    title: data.title,
    format: data.format,
    caption: data.caption,
    mediaJson: JSON.stringify(data.media.map((item) => ({ role: item.role, content_type: item.contentType, r2_key: item.role }))),
    status: data.pieceStatus ?? "approved",
    targets: data.publishedLinks.map((link) => ({ platform: link.platform, outcome: "succeeded", url: link.url })),
    postType: data.postType,
  });
  const hasText = Boolean(data.caption) || Object.keys(data.captions).length > 0;

  const reschedule = async () => {
    setTouched(true);
    // The page may have been open a while, so check against the clock now.
    const fresh = rescheduleCheck({ local, timeZone: data.timezone, now: Math.max(now, Date.now()), current: data, others });
    if (!fresh.ok) {
      setProblem(fresh.error);
      return;
    }
    setBusy(true);
    setProblem("");
    const body = new FormData();
    body.set("organizationId", organizationId);
    body.set("postId", data.postId);
    body.set("startAt", local);
    body.set("timezone", data.timezone);
    const result = await moveSocialPostAction(null, body);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    onDone(`Moved “${data.title}” to ${whenLabel(fresh.at, data.timezone)}.`);
    router.refresh();
    onClose();
  };

  const remove = async () => {
    setBusy(true);
    setProblem("");
    const body = new FormData();
    body.set("organizationId", organizationId);
    body.set("postId", data.postId);
    const result = await cancelSocialPostAction(null, body);
    setBusy(false);
    if (!result.ok) {
      setConfirmRemove(false);
      setProblem(result.error);
      return;
    }
    onDone(`Removed “${data.title}”. It will not post.`);
    router.refresh();
    onClose();
  };

  const actions = canAct ? (
    <div className="flex flex-wrap gap-2">
      {guard.canReschedule ? (
        <Button type="button" variant="outline" disabled={busy || editing} onClick={() => setEditing(true)}>
          <CalendarClockIcon className="mr-1.5 size-4" aria-hidden="true" />
          Reschedule
        </Button>
      ) : null}
      {guard.canRemove ? (
        <Button type="button" variant="destructive" disabled={busy} onClick={() => setConfirmRemove(true)}>
          <Trash2Icon className="mr-1.5 size-4" aria-hidden="true" />
          Remove
        </Button>
      ) : null}
      {data.status === "failed" ? <RetrySocialPostForm organizationId={organizationId} postId={data.postId} /> : null}
    </div>
  ) : null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{data.title}</DialogTitle>
        <DialogDescription>{accountsLine(data.accounts)}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 sm:order-2">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge variant={data.status === "failed" ? "destructive" : "outline"}>{calendarStatusLabel(data.status)}</Badge>
            </dd>
            <dt className="text-muted-foreground">{data.status === "published" || data.status === "partial" ? "Posted" : data.status === "failed" ? "Was set for" : "Goes out"}</dt>
            <dd className="tabular-nums" data-testid="post-when">{whenLabel(data.scheduledFor, data.timezone)}</dd>
            {data.deliverableTitle ? (
              <>
                <dt className="text-muted-foreground">Collection</dt>
                <dd>{data.deliverableTitle}</dd>
              </>
            ) : null}
          </dl>
          {canAct && guard.reason ? <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{guard.reason}</p> : null}
          {data.error ? <p role="alert" className="whitespace-pre-line rounded-lg border border-status-late px-3 py-2 text-sm text-status-late">{data.error}</p> : null}
          {data.skipped ? <p className="whitespace-pre-line text-sm text-muted-foreground">Skipped: {data.skipped}</p> : null}
          {!canAct && data.status === "failed" ? <p className="text-sm text-muted-foreground">This post did not go out. We are looking at it.</p> : null}
          {data.publishedLinks.length > 0 ? (
            <p className="flex flex-wrap gap-3 text-sm">
              {data.publishedLinks.map((link) => (
                <a key={link.url} className="underline" href={link.url} target="_blank" rel="noreferrer">
                  View on {PLATFORM_LABEL[link.platform] ?? new URL(link.url).hostname.replace(/^www\./, "")}
                </a>
              ))}
            </p>
          ) : null}
          {actions}
          {editing && canAct && guard.canReschedule ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <Label htmlFor="reschedule-at">New time</Label>
              <Input
                id="reschedule-at"
                type="datetime-local"
                value={local}
                required
                aria-invalid={touched && !check.ok}
                aria-describedby="reschedule-help"
                onChange={(event) => {
                  setLocal(event.target.value);
                  setTouched(true);
                }}
              />
              <p id="reschedule-help" className="text-xs text-muted-foreground">Time zone: {data.timezone}. The post goes out then, to {accountsLine(data.accounts)}.</p>
              {touched && !check.ok ? <p role="alert" className="text-sm text-status-late">{check.error}</p> : null}
              {check.ok && check.warnings.length > 0 ? (
                <ul role="status" className="list-disc pl-5 text-sm text-muted-foreground" data-testid="slot-warnings">
                  {check.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  <li>You can still move it here.</li>
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy || !check.ok} onClick={reschedule}>
                  {busy ? "Moving" : "Move post"}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setProblem(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {problem ? <p role="alert" className="text-sm text-status-late">{problem}</p> : null}
          <p className="flex flex-wrap gap-4 text-sm">
            {librarySlug ? <Link className="underline" href={pieceOpenHref(librarySlug, data.deliverableId, data.itemId)}>Open the piece in the Library</Link> : null}
            {canAct ? <Link className="underline" href={`/deliverables/${data.deliverableId}`}>Open finished work</Link> : null}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:order-1">
          <SocialPieceCard
            view={view}
            caption={data.caption}
            captions={data.captions}
            accountName={data.accounts[0]?.name || "Account"}
            platforms={platforms}
            showNextAction={false}
            media={data.media.map((item) => ({
              role: item.role,
              video: item.video,
              alt: data.title,
              src: pictureAddress(data.deliverableId, data.itemId, item.role),
            }))}
          />
          {!hasText && data.media.length === 0 ? <p className="text-sm text-muted-foreground">The text and pictures for this post are not available here. Open the piece to see them.</p> : null}
          {live ? <p className="text-xs text-muted-foreground">Text and pictures are read from the piece as it is now. If the piece changed after this was scheduled, remove the post and schedule it again.</p> : null}
        </div>
      </div>
      <AlertDialog open={confirmRemove} onOpenChange={(open) => { if (!busy) setConfirmRemove(open); }}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this post?</AlertDialogTitle>
            <AlertDialogDescription>
              {data.status === "draft"
                ? `“${data.title}” will be deleted as a draft and will not go out.`
                : `“${data.title}” will come off the schedule for ${accountsLine(data.accounts)}. It will not go out on ${whenLabel(data.scheduledFor, data.timezone)}.`}
              {" "}The piece stays in the Library and can be scheduled again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={busy} onClick={remove}>
              {busy ? "Removing" : "Remove post"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
