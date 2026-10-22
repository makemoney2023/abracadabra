"use client";

import { useState } from "react";
import type { LibraryArtifact } from "@/lib/library-artifacts";
import { ArticlePromotionDialog } from "./article-promotion-dialog";
import { ArtifactCard, LibraryEmpty } from "./artifact-card";
import { ViewLinkDialog } from "./view-link-dialog";

type PromotionState = { message: string; href?: string };
type ShareSummary = { id: string; title: string | null; expiresAt: number | null; revokedAt: number | null };

export function LibraryGallery({
  artifacts,
  empty,
  viewLink,
  promotionAction,
  promotionTargets = [],
}: {
  artifacts: LibraryArtifact[];
  empty: string;
  viewLink?: { workspaceId: string; shares: ShareSummary[] } | null;
  promotionAction?: ((previous: PromotionState, formData: FormData) => Promise<PromotionState>) | null;
  promotionTargets?: { id: string; title: string }[];
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const chosen = artifacts.filter((artifact) => selected[artifact.artifactKey]);
  const items = chosen.flatMap((artifact) => {
    if (artifact.sourceKind !== "deliverable_item" && artifact.sourceKind !== "built_work" && artifact.sourceKind !== "file") return [];
    return [{ resourceKind: artifact.sourceKind, resourceId: artifact.sourceId, resourceVersion: artifact.version ?? 0 }];
  });
  const gallery = (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {artifacts.map((artifact) => {
        const canonical = artifact.canonical && !artifact.canonical.unavailable ? artifact.canonical.url : null;
        return (
          <li key={artifact.artifactKey} className="min-w-0">
            {viewLink ? (
              <label className="mb-2 flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected[artifact.artifactKey] === true}
                  onChange={(event) => setSelected((current) => ({ ...current, [artifact.artifactKey]: event.target.checked }))}
                />
                Add to view link
              </label>
            ) : null}
            <ArtifactCard artifact={artifact} />
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
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Share finished work</p>
              <p className="text-sm text-muted-foreground">
                {chosen.length === 0 ? "Select cards below, then create a read-only view link." : `${chosen.length} selected`}
              </p>
            </div>
            {chosen.length > 0 ? (
              <button type="button" className="inline-flex min-h-11 items-center text-sm underline" onClick={() => setSelected({})}>
                Clear selection
              </button>
            ) : null}
          </div>
          <ViewLinkDialog workspaceId={viewLink.workspaceId} items={items} shares={viewLink.shares} />
        </div>
      ) : null}
      {artifacts.length === 0 ? <LibraryEmpty message={empty} /> : null}
      {viewLink ? (
        <fieldset className="min-w-0">
          <legend className="mb-3 text-sm font-medium">Select finished work</legend>
          {gallery}
        </fieldset>
      ) : gallery}
    </div>
  );
}
