import type { LibraryArtifact } from "@/lib/library-artifacts";
import { CopyLinkButton } from "./copy-link-button";
import { articleCardModel, libraryDateLabel } from "./library-view";
import { StatusMark, TypePlate } from "./type-plate";

export function ArticleCard({ artifact }: { artifact: LibraryArtifact }) {
  const model = articleCardModel(artifact);
  const date = libraryDateLabel(artifact.publishedAt);
  const review = artifact.actions.find((action) => action.kind === "review" || action.kind === "view_request");
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-3">
      <TypePlate artifact={artifact} />
      <p className="eyebrow text-muted-foreground">Article</p>
      <h2 className="font-heading text-2xl">{model.title}</h2>
      {model.dek ? <p className="text-sm">{model.dek}</p> : null}
      <p className="break-all text-sm text-muted-foreground">
        {model.hostname ?? "No public link yet"}
        {model.author ? ` · ${model.author}` : ""}
        {date ? ` · ${date}` : ""}
      </p>
      <StatusMark status={artifact.primaryStatus} />
      {artifact.promotedBy > 0 ? <p className="text-sm">Promoted by {artifact.promotedBy} {artifact.promotedBy === 1 ? "post" : "posts"}</p> : null}
      {artifact.promotionCollections.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {artifact.promotionCollections.map((collection) => (
            <li key={collection.id}>
              <a className="inline-flex min-h-11 items-center underline underline-offset-4" href={collection.href}>
                View promotion collection<span className="sr-only">: {collection.title}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {artifact.destinations.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {artifact.destinations.map((destination) => (
            <li key={`${destination.platform}-${destination.state}`} className="rounded-full border border-border px-2 py-1 text-xs">
              {destination.label} · {destination.state === "published" ? "Published" : destination.state === "failed" ? "Needs attention" : destination.state}
              {destination.url ? (
                <>
                  {" · "}
                  <a href={destination.url} target="_blank" rel="noreferrer noopener">Open</a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2">
        {review?.href ? (
          <a className="inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground" href={review.href}>
            {review.label}
          </a>
        ) : null}
        {model.readHref ? (
          <a className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm" href={model.readHref} target="_blank" rel="noreferrer noopener">
            Read article
          </a>
        ) : !review ? (
          <p className="text-sm">Link unavailable</p>
        ) : null}
        {model.copyValue ? <CopyLinkButton url={model.copyValue} workspaceId={artifact.workspaceId} /> : null}
      </div>
    </article>
  );
}
