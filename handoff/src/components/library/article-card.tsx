import type { LibraryArtifact } from "@/lib/library-artifacts";
import { CopyLinkButton } from "./copy-link-button";
import { articleCardModel } from "./library-view";

export function ArticleCard({ artifact }: { artifact: LibraryArtifact }) {
  const model = articleCardModel(artifact);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Article</p>
      <h2 className="font-heading text-2xl">{model.title}</h2>
      {model.dek ? <p className="text-sm">{model.dek}</p> : null}
      <p className="break-all text-sm text-muted-foreground">
        {model.hostname ?? "No public link yet"}
        {model.author ? ` · ${model.author}` : ""}
        {artifact.publishedAt ? ` · ${new Date(artifact.publishedAt).toLocaleDateString("en-CA")}` : ""}
      </p>
      <p className="text-sm">{model.status}</p>
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
      <div className="flex flex-wrap gap-2">
        {model.readHref ? (
          <a className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm" href={model.readHref} target="_blank" rel="noreferrer noopener">
            Read article
          </a>
        ) : (
          <p className="text-sm">Link unavailable</p>
        )}
        {model.copyValue ? <CopyLinkButton url={model.copyValue} /> : null}
      </div>
    </article>
  );
}
