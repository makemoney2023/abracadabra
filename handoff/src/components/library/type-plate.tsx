import type { LibraryArtifact } from "@/lib/library-artifacts";
import { filePlateWord } from "@/lib/file-type";
import { ArtifactThumbnail } from "./artifact-thumbnail";
import { LIBRARY_STATUS_LABEL, libraryDateLabel, libraryStatusClass } from "./library-view";

const PLATE: Record<string, string> = {
  article: "from-optic/25",
  social: "from-primary/30",
  video: "from-phosphor/20",
  image: "from-status-waiting/25",
  website: "from-phosphor/25",
  document: "from-muted",
  file: "from-status-blocked/20",
};

export function TypePlate({ artifact }: { artifact: LibraryArtifact }) {
  const date = libraryDateLabel(artifact.publishedAt ?? artifact.updatedAt);
  const fallback = artifact.artifactType === "file" ? (filePlateWord(artifact.title) ?? "file") : artifact.artifactType;
  return (
    <div className={`relative flex aspect-[4/3] items-end overflow-hidden rounded-xl border border-border bg-gradient-to-br ${PLATE[artifact.artifactType] ?? "from-muted"} to-card p-4`}>
      <ArtifactThumbnail
        src={artifact.previewSrc}
        title={artifact.title}
        fallback={fallback}
      />
      {date ? <time className="relative text-xs text-ink" dateTime={date}>{date}</time> : null}
    </div>
  );
}

export function StatusMark({ status }: { status: LibraryArtifact["primaryStatus"] }) {
  return <span className={`inline-flex min-h-6 items-center rounded-full px-2 text-xs ${libraryStatusClass(status)}`}>{LIBRARY_STATUS_LABEL[status]}</span>;
}
