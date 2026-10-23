import { PLATFORM_LABEL } from "@/lib/zernio";
import { platformPostFrames } from "./platform-post-preview";
import { PlatformPostPreview } from "./platform-post-preview-view";
import type { PieceCardView } from "./social-piece-view";

export type PieceCardMedia = {
  role: string;
  src: string;
  video: boolean;
  alt: string;
};

/** The piece is shown as the post it will be: one frame per network, with a carousel staying a carousel. */
export function SocialPieceCard({
  view,
  media,
  caption,
  platforms,
  captions,
  accountName,
  showNextAction = true,
}: {
  view: PieceCardView;
  media: PieceCardMedia[];
  caption: string;
  platforms?: string[];
  captions?: Record<string, string>;
  accountName: string;
  /** Off for a post that already has a time: the next step is not "Schedule". */
  showNextAction?: boolean;
}) {
  const roles = new Set(view.preview.roles);
  const matched = roles.size > 0 ? media.filter((item) => roles.has(item.role)) : media;
  const shown = matched.length > 0 ? matched : media;
  const frames = platformPostFrames({
    postType: view.postType,
    caption,
    slides: shown.length,
    platforms,
    captions,
  });
  return (
    <article className="flex flex-col gap-3" data-publishing={view.publishing}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="font-medium">{view.title}</p>
        <span className="text-muted-foreground">{view.postType}</span>
        {showNextAction ? <span className="text-muted-foreground">{view.nextAction}</span> : null}
      </div>
      <PlatformPostPreview
        frames={frames}
        accountName={accountName}
        media={shown.map((item) => ({ src: item.src, alt: item.alt, video: item.video }))}
      />
      {view.publishing === "partial" ? <p className="text-sm">Some destinations published. Others still need attention.</p> : null}
      {view.publishedLinks.map((link) => (
        <a key={link.url} className="text-sm underline" href={link.url} target="_blank" rel="noreferrer">
          {PLATFORM_LABEL[link.platform] ?? link.platform}
        </a>
      ))}
    </article>
  );
}
