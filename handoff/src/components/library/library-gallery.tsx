"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { BulkResult } from "@/lib/library-bulk-shared";
import type { LibraryArtifact } from "@/lib/library-artifacts";
import { schedulableMedia } from "@/lib/file-type";
import { ArticlePromotionDialog } from "./article-promotion-dialog";
import { ArtifactCard, LibraryEmpty } from "./artifact-card";
import { BulkResultNote, LibraryBulkBar, type BulkConfig } from "./library-bulk-bar";
import { bulkSelectable } from "./library-bulk-view";
import { ScheduleThisForm, type ScheduleState } from "./schedule-this-form";
import { ViewLinkDialog } from "./view-link-dialog";

type PromotionState = { message: string; href?: string };
type ShareSummary = { id: string; title: string | null; expiresAt: number | null; revokedAt: number | null };
type ShareItem = { resourceKind: "deliverable_item" | "built_work" | "file"; resourceId: string; resourceVersion: number };

function shareItems(artifacts: LibraryArtifact[]): ShareItem[] {
  return artifacts.flatMap((artifact) => {
    if (artifact.sourceKind !== "deliverable_item" && artifact.sourceKind !== "built_work" && artifact.sourceKind !== "file") return [];
    return [{ resourceKind: artifact.sourceKind, resourceId: artifact.sourceId, resourceVersion: artifact.version ?? 0 }];
  });
}

export function LibraryShareSelection({
  workspaceId,
  items,
  shares,
  chosenCount,
  onClear,
}: {
  workspaceId: string;
  items: ShareItem[];
  shares: ShareSummary[];
  chosenCount: number;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {chosenCount === 0 ? "Select the work to include." : `${chosenCount} selected`}
        </p>
        {chosenCount > 0 ? (
          <button type="button" className="inline-flex min-h-11 items-center text-sm underline" onClick={onClear}>
            Clear selection
          </button>
        ) : null}
      </div>
      <ViewLinkDialog workspaceId={workspaceId} items={items} shares={shares} />
    </div>
  );
}

export function LibraryGallery({
  artifacts,
  empty,
  emptyAction,
  viewLink,
  promotionAction,
  promotionTargets = [],
  initialSharing = false,
  schedule = null,
  bulk = null,
}: {
  artifacts: LibraryArtifact[];
  empty: string;
  emptyAction?: { label: string; href: string } | null;
  viewLink?: { workspaceId: string; shares: ShareSummary[] } | null;
  promotionAction?: ((previous: PromotionState, formData: FormData) => Promise<PromotionState>) | null;
  promotionTargets?: { id: string; title: string }[];
  initialSharing?: boolean;
  schedule?: { workspaceId: string; platforms: { value: string; label: string }[]; action: (previous: ScheduleState, formData: FormData) => Promise<ScheduleState> } | null;
  bulk?: BulkConfig | null;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sharing, setSharing] = useState(initialSharing);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const chosen = artifacts.filter((artifact) => selected[artifact.artifactKey]);
  const selectable = artifacts.filter(bulkSelectable);
  const bulkChosen = selectable.filter((artifact) => picked[artifact.artifactKey]);
  const allPicked = selectable.length > 0 && bulkChosen.length === selectable.length;
  const gallery = (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {artifacts.map((artifact) => {
        const canonical = artifact.canonical && !artifact.canonical.unavailable ? artifact.canonical.url : null;
        return (
          <li key={artifact.artifactKey} className="min-w-0">
            {viewLink && sharing ? (
              <label className="mb-2 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Select ${artifact.title}`}
                  checked={selected[artifact.artifactKey] === true}
                  onChange={(event) => setSelected((current) => ({ ...current, [artifact.artifactKey]: event.target.checked }))}
                />
                Select
              </label>
            ) : null}
            {bulk && selecting ? (
              bulkSelectable(artifact) ? (
                <label className="mb-2 flex min-h-11 items-center gap-2 text-sm">
                  <Checkbox
                    aria-label={`Select ${artifact.title}`}
                    checked={picked[artifact.artifactKey] === true}
                    onCheckedChange={(value) => setPicked((current) => ({ ...current, [artifact.artifactKey]: value === true }))}
                  />
                  Select
                </label>
              ) : (
                <p className="mb-2 flex min-h-11 items-center text-sm text-muted-foreground">Not approved or removed here</p>
              )
            ) : null}
            <ArtifactCard
              artifact={artifact}
              schedule={schedule && artifact.sourceKind === "file" && schedulableMedia(artifact.title) ? (
                <ScheduleThisForm workspaceId={schedule.workspaceId} fileId={artifact.sourceId} platforms={schedule.platforms} action={schedule.action} />
              ) : null}
            />
            {promotionAction
            && artifact.artifactType === "article"
            && (artifact.primaryStatus === "approved" || artifact.primaryStatus === "published")
            && artifact.version != null
            && canonical ? (
              <details className="mt-3 rounded-xl border border-border bg-card p-3">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-optic">Create social promo</summary>
                <div className="mt-3">
                  <ArticlePromotionDialog
                    sourceItemId={artifact.sourceId}
                    sourceVersion={artifact.version}
                    canonicalUrl={canonical}
                    media={artifact.promotionMedia}
                    targets={promotionTargets}
                    action={promotionAction}
                  />
                </div>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className="flex flex-col gap-4">
      {viewLink || bulk ? (
        <div className="flex flex-wrap justify-end gap-2">
          {bulk ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              aria-pressed={selecting}
              onClick={() => {
                setSelecting((current) => !current);
                setSharing(false);
                setPicked({});
              }}
            >
              {selecting ? "Done selecting" : "Select"}
            </Button>
          ) : null}
          {viewLink ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm"
              aria-pressed={sharing}
              onClick={() => {
                setSharing((current) => !current);
                setSelecting(false);
              }}
            >
              {sharing ? "Done" : "Share"}
            </button>
          ) : null}
        </div>
      ) : null}
      {bulk && selecting && selectable.length > 0 ? (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            aria-label={`Select all ${selectable.length} on this page`}
            checked={allPicked ? true : bulkChosen.length > 0 ? "indeterminate" : false}
            onCheckedChange={(value) => setPicked(value === true ? Object.fromEntries(selectable.map((artifact) => [artifact.artifactKey, true])) : {})}
          />
          Select all {selectable.length} on this page
        </label>
      ) : null}
      {bulk && bulkResult ? <BulkResultNote result={bulkResult} onDismiss={() => setBulkResult(null)} /> : null}
      {viewLink && sharing ? (
        <LibraryShareSelection
          workspaceId={viewLink.workspaceId}
          items={shareItems(chosen)}
          shares={viewLink.shares}
          chosenCount={chosen.length}
          onClear={() => setSelected({})}
        />
      ) : null}
      {artifacts.length === 0 ? <LibraryEmpty message={empty} action={emptyAction} /> : null}
      {gallery}
      {bulk && selecting ? (
        <LibraryBulkBar
          config={bulk}
          chosen={bulkChosen}
          onClear={() => setPicked({})}
          onDone={(result) => {
            setBulkResult(result);
            setPicked({});
          }}
        />
      ) : null}
    </div>
  );
}
