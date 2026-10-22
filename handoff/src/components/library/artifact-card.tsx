import type { LibraryArtifact } from "@/lib/library-artifacts";
import { ArticleCard } from "./article-card";
import { StatusMark, TypePlate } from "./type-plate";

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
  const external = action?.kind === "visit_site" || action?.kind === "open_post" || action?.kind === "read_article";
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-3">
      <TypePlate artifact={artifact} />
      <p className="eyebrow text-muted-foreground">{artifact.artifactType}</p>
      <h2 className="font-heading text-2xl">{artifact.title}</h2>
      <StatusMark status={artifact.primaryStatus} />
      {artifact.promotesTitle ? <p className="text-sm">Promotes: {artifact.promotesTitle}</p> : null}
      {artifact.destinations.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs">
          {artifact.destinations.map((destination) => (
            <li key={`${destination.platform}-${destination.state}`} className="rounded-full border border-border px-2 py-1">{destination.label} · {destination.state}</li>
          ))}
        </ul>
      ) : null}
      {action?.href ? (
        <a className="mt-auto inline-flex min-h-11 items-center text-sm underline" href={action.href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined}>
          {label}
        </a>
      ) : (
        <p className="mt-auto text-sm">{label}</p>
      )}
    </article>
  );
}

export function LibraryEmpty({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}
