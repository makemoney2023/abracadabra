"use client";

import { useState } from "react";
import type { LibraryArtifact } from "@/lib/library-artifacts";
import { ArticlePromotionDialog } from "./article-promotion-dialog";
import { ArtifactCard, LibraryEmpty } from "./artifact-card";
import { ViewLinkDialog } from "./view-link-dialog";

type PromotionState = { message: string; href?: string };
type ShareSummary = { id: string; title: string | null; expiresAt: number | null; revokedAt: number | null };

function exampleOutbound(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("utm_source", "linkedin");
  parsed.searchParams.set("utm_medium", "social");
  parsed.searchParams.set("utm_campaign", "article");
  return parsed.toString();
}

export function LibraryGallery({
  artifacts,
  empty,
  viewLink,
  promotionAction,
}: {
  artifacts: LibraryArtifact[];
  empty: string;
  viewLink?: { workspaceId: string; shares: ShareSummary[] } | null;
  promotionAction?: ((previous: PromotionState, formData: FormData) => Promise<PromotionState>) | null;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const chosen = artifacts.filter((artifact) => selected[artifact.artifactKey]);
  const items = chosen.flatMap((artifact) => {
    if (artifact.sourceKind !== "deliverable_item" && artifact.sourceKind !== "built_work" && artifact.sourceKind !== "file") return [];
    return [{ resourceKind: artifact.sourceKind, resourceId: artifact.sourceId, resourceVersion: artifact.version ?? 0 }];
  });
  return (
    <div className="flex flex-col gap-4">
      {viewLink ? <ViewLinkDialog workspaceId={viewLink.workspaceId} items={items} shares={viewLink.shares} /> : null}
      {artifacts.length === 0 ? <LibraryEmpty message={empty} /> : null}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {artifacts.map((artifact) => {
          const canonical = artifact.canonical && !artifact.canonical.unavailable ? artifact.canonical.url : null;
          return (
            <li key={artifact.artifactKey} className="min-w-0">
              {viewLink ? (
                <label className="mb-2 flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected[artifact.artifactKey] === true}
                    onChange={(event) => setSelected((current) => ({ ...current, [artifact.artifactKey]: event.target.checked }))}
                  />
                  Select
                </label>
              ) : null}
              <ArtifactCard artifact={artifact} />
              {promotionAction && artifact.artifactType === "article" && artifact.version != null && canonical ? (
                <details className="mt-3">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm">Create social promo</summary>
                  <ArticlePromotionDialog
                    sourceItemId={artifact.sourceId}
                    sourceVersion={artifact.version}
                    canonicalUrl={canonical}
                    exampleOutbound={exampleOutbound(canonical)}
                    action={promotionAction}
                  />
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
