import type { LibraryArtifact } from "@/lib/library-artifacts";
import { ArticleCard } from "./article-card";
import { LIBRARY_STATUS_LABEL } from "./library-view";

const ACTION_LABEL: Record<string, string> = {
  visit_site: "Visit site",
  review: "Review",
  view_request: "View request",
  view_schedule: "View schedule",
  open_post: "Open post",
  preview: "Preview",
  open_file: "Open file",
  unavailable: "Link unavailable",
};

export function ArtifactCard({ artifact }: { artifact: LibraryArtifact }) {
  if (artifact.artifactType === "article") return <ArticleCard artifact={artifact} />;
  const action = artifact.actions[0];
  const label = action ? ACTION_LABEL[action.kind] ?? action.label : "Open";
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{artifact.artifactType}</p>
      <h2 className="font-heading text-2xl">{artifact.title}</h2>
      <p className="text-sm">{LIBRARY_STATUS_LABEL[artifact.primaryStatus]}</p>
      {artifact.destinations.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs">
          {artifact.destinations.map((destination) => (
            <li key={`${destination.platform}-${destination.state}`}>{destination.label} · {destination.state}</li>
          ))}
        </ul>
      ) : null}
      {action?.href ? (
        <a className="inline-flex min-h-11 items-center text-sm underline" href={action.href} target={action.kind === "visit_site" || action.kind === "open_post" || action.kind === "read_article" ? "_blank" : undefined} rel="noreferrer noopener">
          {label}
        </a>
      ) : (
        <p className="text-sm">{label}</p>
      )}
    </article>
  );
}

export function LibraryEmpty({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}
