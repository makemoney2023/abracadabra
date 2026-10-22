"use client";

import { useState } from "react";
import { statusPhrase } from "@/components/library/library-view";
import { pictureAddress, pictureCount, pictureRole } from "@/lib/picture-role";
import type { SocialReviewPiece } from "@/lib/social-review";

export function ReviewList({
  title,
  empty,
  pieces,
  selectedId,
  onSelect,
}: {
  title: string;
  empty: string;
  pieces: SocialReviewPiece[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        {title} <span className="text-muted-foreground">({pieces.length})</span>
      </h3>
      {pieces.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      <ul className="flex flex-col gap-2">
        {pieces.map((piece) => {
          const role = pictureRole(piece.media);
          const count = pictureCount(piece.media);
          const videoOnly = !role && piece.media.some((item) => item.video);
          return (
            <li key={piece.id}>
              <button
                type="button"
                onClick={() => onSelect(piece.id)}
                aria-pressed={selectedId === piece.id}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${selectedId === piece.id ? "border-foreground" : "border-border"}`}
              >
                <RailThumb
                  src={role ? pictureAddress(piece.deliverableId, piece.id, role) : null}
                  videoOnly={videoOnly}
                  count={count}
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">{piece.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {statusPhrase(piece.status)} · {piece.deliverableTitle}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RailThumb({ src, videoOnly, count }: { src: string | null; videoOnly: boolean; count: number }) {
  const [failed, setFailed] = useState(false);
  const show = Boolean(src) && !failed;
  return (
    <span className="relative flex size-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      {show ? (
        // The still is the same media the detail pane already shows. A broken response leaves the tile.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={src ?? ""} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="text-xs text-muted-foreground">{videoOnly ? "Video" : ""}</span>
      )}
      {show && count > 1 ? (
        <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1 text-[10px] tabular-nums">{count}</span>
      ) : null}
    </span>
  );
}
