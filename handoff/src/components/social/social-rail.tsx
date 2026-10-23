"use client";

import Link from "next/link";
import { useState, type DragEvent, type ReactNode } from "react";
import { statusPhrase } from "@/components/library/library-view";
import { pictureAddress, pictureCount, pictureRole } from "@/lib/picture-role";
import type { SocialReviewPiece } from "@/lib/social-review";

export function waitingHeading(count: number): string {
  if (count === 1) return "1 needs a look";
  if (count > 1) return `${count} need a look`;
  return "Waiting for a look";
}

export function ReviewList({
  title,
  empty,
  pieces,
  selectedId,
  onSelect,
  showCount = true,
  draggableIds = [],
  approvePieceId = null,
  approve = null,
  hrefFor,
}: {
  title: string;
  empty: string;
  pieces: SocialReviewPiece[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showCount?: boolean;
  draggableIds?: string[];
  approvePieceId?: string | null;
  approve?: ReactNode;
  /** Where a row goes when it is clicked. Without it a row only selects. */
  hrefFor?: (piece: SocialReviewPiece) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        {title} {showCount ? <span className="text-muted-foreground">({pieces.length})</span> : null}
      </h3>
      {pieces.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      <ul className="flex flex-col gap-2">
        {pieces.map((piece) => {
          const role = pictureRole(piece.media);
          const count = pictureCount(piece.media);
          const videoOnly = !role && piece.media.some((item) => item.video);
          const draggable = draggableIds.includes(piece.id);
          return (
            <li key={piece.id}>
              <Row
                href={hrefFor ? hrefFor(piece) : null}
                selected={selectedId === piece.id}
                onSelect={() => onSelect(piece.id)}
                dragId={draggable ? piece.id : null}
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
              </Row>
              {approve && approvePieceId === piece.id ? approve : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One rail entry: a link to the piece's approval screen, or a plain select button. */
function Row({
  href,
  selected,
  onSelect,
  dragId,
  children,
}: {
  href: string | null;
  selected: boolean;
  onSelect: () => void;
  dragId: string | null;
  children: ReactNode;
}) {
  const className = `flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${selected ? "border-foreground" : "border-border"}`;
  const drag = dragId
    ? {
        draggable: true,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          event.dataTransfer.setData("text/piece-id", dragId);
          event.dataTransfer.effectAllowed = "move";
        },
      }
    : {};
  if (href) {
    return (
      <Link href={href} aria-current={selected ? "true" : undefined} className={className} {...drag}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={className} {...drag}>
      {children}
    </button>
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
