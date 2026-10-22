"use client";

import { useState } from "react";
import type { LibraryArtifact } from "@/lib/library-artifacts";
import { schedulableMedia } from "@/lib/file-type";
import { ArticlePromotionDialog } from "./article-promotion-dialog";
import { ArtifactCard, LibraryEmpty } from "./artifact-card";
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
}: {
  artifacts: LibraryArtifact[];
  empty: string;
  emptyAction?: { label: string; href: string } | null;
  viewLink?: { workspaceId: string; shares: ShareSummary[] } | null;
  promotionAction?: ((previous: PromotionState, formData: FormData) => Promise<PromotionState>) | null;
  promotionTargets?: { id: string; title: string }[];
  initialSharing?: boolean;
  schedule?: { workspaceId: string; platforms: { value: string; label: string }[]; action: (previous: ScheduleState, formData: FormData) => Promise<ScheduleState> } | null;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sharing, setSharing] = useState(initialSharing);
  const chosen = artifacts.filter((artifact) => selected[artifact.artifactKey]);
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
      {viewLink ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm"
            aria-pressed={sharing}
            onClick={() => setSharing((current) => !current)}
          >
            {sharing ? "Done" : "Share"}
          </button>
        </div>
      ) : null}
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
    </div>
  );
}
