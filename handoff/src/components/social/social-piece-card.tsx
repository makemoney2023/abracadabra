import type { PieceCardView } from "./social-piece-view";

export type PieceCardMedia = {
  role: string;
  src: string;
  video: boolean;
  alt: string;
};

/** Media and caption stay together. The page still shows the full caption beside this card. */
export function SocialPieceCard({ view, media }: { view: PieceCardView; media: PieceCardMedia[] }) {
  const roles = new Set(view.preview.roles);
  const matched = roles.size > 0 ? media.filter((item) => roles.has(item.role)) : media;
  const shown = matched.length > 0 ? matched : media;
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-border p-4" data-publishing={view.publishing}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="font-medium">{view.title}</p>
        <span className="text-muted-foreground">{view.postType}</span>
        <span className="text-muted-foreground">{view.nextAction}</span>
      </div>
      {view.captionExcerpt ? <p className="text-sm">{view.captionExcerpt}</p> : null}
      {shown.length > 0 ? (
        <div className="mx-auto w-full max-w-sm">
          {shown.map((item) =>
            item.video ? (
              <video key={item.role} controls className="w-full rounded-md" src={item.src} />
            ) : (
              // The picture is served only when this caller can see the space.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={item.role} alt={item.alt} className="w-full rounded-md" src={item.src} />
            ),
          )}
        </div>
      ) : null}
      {view.publishing === "partial" ? <p className="text-sm">Some destinations published. Others still need attention.</p> : null}
      {view.publishedLinks.map((link) => (
        <a key={link.url} className="text-sm underline" href={link.url} target="_blank" rel="noreferrer">
          {link.platform}
        </a>
      ))}
    </article>
  );
}
