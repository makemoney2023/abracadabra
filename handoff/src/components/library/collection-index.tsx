import { pieceOpenHref } from "@/lib/finished-shelf";
import { statusPhrase } from "./library-view";

export type IndexPiece = {
  id: string;
  title: string;
  caption?: string | null;
  status: string;
  previewSrc: string | null;
};

/** The set is a list of pictures. The decision stays on the open piece. */
export function CollectionIndex({
  slug,
  deliverableId,
  pieces,
}: {
  slug: string;
  deliverableId: string;
  pieces: IndexPiece[];
}) {
  if (pieces.length === 0) return <p className="text-sm text-muted-foreground">Nothing to look at yet.</p>;
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {pieces.map((piece) => (
        <li key={piece.id}>
          <a className="flex flex-col gap-2" href={pieceOpenHref(slug, deliverableId, piece.id)}>
            <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
              {piece.previewSrc ? (
                // The picture is the same media the proof page shows.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={piece.previewSrc} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-sm text-muted-foreground">Picture</span>
              )}
            </span>
            {piece.caption ? <span className="line-clamp-3 text-sm">{piece.caption}</span> : null}
            <span className="truncate text-sm font-medium">{piece.title}</span>
            <span className="text-xs text-muted-foreground">{statusPhrase(piece.status)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
