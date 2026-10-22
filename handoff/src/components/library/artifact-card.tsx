import type { LibraryArtifact } from "@/lib/library-artifacts";
import { ArticleCard } from "./article-card";
import { StatusMark, TypePlate } from "./type-plate";

const ACTION_LABEL: Record<string, string> = {
  visit_site: "Visit site",
  review: "Approve",
  view_request: "See the changes",
  view_schedule: "On the calendar",
  open_post: "Open post",
  preview: "Preview",
  open_file: "Open file",
  unavailable: "Link unavailable",
};

function externalAction(kind: string): boolean {
  return kind === "visit_site" || kind === "open_post" || kind === "read_article";
}

export function ArtifactCard({ artifact }: { artifact: LibraryArtifact }) {
  if (artifact.artifactType === "article") return <ArticleCard artifact={artifact} />;
  const piece = artifact.actions.find((item) => item.href?.includes("?item="));
  const action = piece ?? artifact.actions[0];
  const href = action?.href ?? null;
  const external = action ? externalAction(action.kind) : false;
  const secondary = artifact.actions.filter((item) => item !== action && item.href);
  const body = (
    <>
      <div className="relative">
        <TypePlate artifact={artifact} />
        <span className="absolute left-3 top-3"><StatusMark status={artifact.primaryStatus} /></span>
      </div>
      <h2 className="line-clamp-1 text-base font-medium">{artifact.title}</h2>
    </>
  );
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-3">
      {href ? (
        <a className="flex flex-col gap-3" href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined}>
          {body}
        </a>
      ) : body}
      {artifact.promotesTitle ? <p className="text-sm">Promotes: {artifact.promotesTitle}</p> : null}
      {artifact.destinations.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs">
          {artifact.destinations.map((destination) => (
            <li key={`${destination.platform}-${destination.state}`} className="rounded-full border border-border px-2 py-1">{destination.label} · {destination.state}</li>
          ))}
        </ul>
      ) : null}
      {secondary.length > 0 ? (
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm underline">More actions</summary>
          <ul className="flex flex-col gap-1">
            {secondary.map((item) => (
              <li key={`${item.kind}-${item.href}`}>
                <a className="inline-flex min-h-11 items-center text-sm underline" href={item.href ?? "#"} target={externalAction(item.kind) ? "_blank" : undefined} rel={externalAction(item.kind) ? "noreferrer noopener" : undefined}>
                  {ACTION_LABEL[item.kind] ?? item.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

export function LibraryEmpty({
  message,
  action,
}: {
  message: string;
  action?: { label: string; href: string } | null;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action ? <a className="inline-flex min-h-11 items-center text-sm underline" href={action.href}>{action.label}</a> : null}
    </div>
  );
}
