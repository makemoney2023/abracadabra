"use client";

import { useState } from "react";
import type { PostFrame } from "./platform-post-preview";

export type PreviewMedia = {
  src: string;
  alt: string;
  video: boolean;
};

function Slide({ item, tall }: { item: PreviewMedia; tall: boolean }) {
  const className = tall ? "aspect-[9/16] w-full object-cover" : "aspect-square w-full object-cover";
  if (item.video) return <video controls className={className} src={item.src} />;
  // The picture is served only when this caller can see the space.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={item.alt} className={className} src={item.src} />;
}

function Stage({ frame, media }: { frame: PostFrame; media: PreviewMedia[] }) {
  const slides = media.length > 0 ? media : [];
  const count = Math.max(frame.slides, slides.length, 1);
  const [index, setIndex] = useState(0);
  const current = slides[index] ?? slides[0];
  const carousel = frame.layout === "carousel" && count > 1;
  const picture = current ? <Slide item={current} tall={frame.tall} /> : <div className={frame.tall ? "aspect-[9/16] bg-neutral-900" : "aspect-square bg-neutral-200"} />;
  return (
    <div className="relative bg-black" data-layout={frame.layout}>
      {picture}
      {frame.layout === "story" ? <div className="absolute inset-x-3 top-3 h-1 rounded-full bg-white/70" /> : null}
      {carousel ? (
        <>
          <p className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-1 text-xs text-white">{index + 1} / {count}</p>
          <button
            type="button"
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-lg"
            onClick={() => setIndex((value) => (value - 1 + count) % count)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next slide"
            className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-lg"
            onClick={() => setIndex((value) => (value + 1) % count)}
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1">
            {Array.from({ length: count }, (_, dot) => (
              <span key={dot} data-dot={dot === index ? "current" : "rest"} className={dot === index ? "h-1.5 w-1.5 rounded-full bg-white" : "h-1.5 w-1.5 rounded-full bg-white/50"} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Header({ frame, accountName }: { frame: PostFrame; accountName: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-neutral-200 text-xs font-medium" aria-hidden="true">
        {accountName.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{frame.chrome === "youtube" ? frame.network : accountName}</span>
        <span className="block text-xs text-neutral-500">{frame.network}</span>
      </span>
    </div>
  );
}

function Actions({ actions }: { actions: string[] }) {
  return (
    <div className="grid border-t border-neutral-200 text-xs font-medium" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
      {actions.map((action) => (
        <span key={action} className="px-2 py-3 text-center">{action}</span>
      ))}
    </div>
  );
}

export function PlatformPostPreview({
  frames,
  media,
  accountName,
}: {
  frames: PostFrame[];
  media: PreviewMedia[];
  accountName: string;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {frames.map((frame) => (
        <article
          key={frame.id}
          aria-label={`${frame.network} ${frame.layout}`}
          data-chrome={frame.chrome}
          data-caption-place={frame.captionPlace}
          className={frame.tall ? "w-full max-w-64 overflow-hidden rounded-3xl border border-neutral-300 bg-black text-white" : "w-full max-w-sm overflow-hidden rounded-xl border border-neutral-300 bg-white text-neutral-950"}
        >
          {frame.captionPlace === "overlay" ? null : <Header frame={frame} accountName={accountName} />}
          {frame.captionPlace === "above" && frame.caption ? <p className="px-3 pb-2 text-sm whitespace-pre-wrap">{frame.caption}</p> : null}
          <Stage frame={frame} media={media} />
          {frame.captionPlace === "overlay" && frame.caption ? <p className="px-3 py-2 text-sm">{frame.caption}</p> : null}
          {frame.captionPlace === "below" && frame.caption ? <p className="px-3 py-2 text-sm whitespace-pre-wrap"><span className="font-semibold">{accountName} </span>{frame.caption}</p> : null}
          {frame.tall ? null : <Actions actions={frame.actions} />}
        </article>
      ))}
    </div>
  );
}
