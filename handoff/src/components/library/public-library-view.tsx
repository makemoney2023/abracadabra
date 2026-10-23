import type { LibraryArtifactType } from "@/lib/library-artifacts";
import { filePlateWord } from "@/lib/file-type";
import { VideoPlayer } from "@/components/video-player";

const TYPE_LABEL: Record<LibraryArtifactType, string> = {
  article: "Article",
  social: "Social",
  video: "Video",
  image: "Image",
  website: "Website",
  document: "Document",
  file: "File",
};

const ACTION_LABEL: Partial<Record<LibraryArtifactType, string>> = {
  article: "Read article",
  website: "Visit site",
};

export function PublicLibraryView({
  token,
  result,
}: {
  token: string;
  result:
    | { ok: true; view: { title: string; downloads: boolean; items: { publicId: string; title: string; externalUrl: string | null; kind?: string; artifactType?: LibraryArtifactType; hasPicture?: boolean; hasVideo?: boolean }[] } }
    | { ok: false; error: "unavailable" | "locked" };
}) {
  if (!result.ok && result.error === "locked") {
    return (
      <main className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col gap-6 px-6 py-16">
        <p className="eyebrow text-optic">Share</p>
        <h1 className="font-heading text-4xl">This link is locked</h1>
        <form className="flex flex-col gap-3" method="post" action={`/view/${encodeURIComponent(token)}/unlock`}>
          <label className="flex flex-col gap-1 text-sm">
            Passcode
            <input name="passcode" type="password" autoComplete="off" required className="min-h-11 rounded-md border border-border bg-card px-3" />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-3 text-sm text-primary-foreground">
            Unlock
          </button>
        </form>
      </main>
    );
  }
  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="font-heading text-4xl">This link is not available</h1>
        <p className="text-sm">Ask the studio for a new link.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-[72rem] flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="eyebrow text-optic">Finished work</p>
        <h1 className="font-heading text-4xl">{result.view.title}</h1>
        <p className="max-w-xl text-sm text-muted-foreground">This link is for looking. It does not accept uploads or comments.</p>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {result.view.items.map((item) => (
          <li key={item.publicId} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            {item.hasVideo ? (
              // The clip is served by this share token, and only for an item already on the share. The still is its poster.
              <VideoPlayer
                src={`/view/${encodeURIComponent(token)}/video/${encodeURIComponent(item.publicId)}`}
                poster={item.hasPicture ? `/view/${encodeURIComponent(token)}/media/${encodeURIComponent(item.publicId)}` : null}
                title={item.title}
                name={item.title}
                className="aspect-[4/3] w-full rounded-xl bg-black object-contain"
              />
            ) : item.hasPicture ? (
              // The picture is served by this share token, and only for an item already on the share.
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={`/view/${encodeURIComponent(token)}/media/${encodeURIComponent(item.publicId)}`} className="aspect-[4/3] w-full rounded-xl object-cover" />
            ) : filePlateWord(item.title) === "video" ? (
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-border bg-muted text-sm">Video</div>
            ) : null}
            <p className="eyebrow text-optic">{item.artifactType ? TYPE_LABEL[item.artifactType] : "Finished work"}</p>
            <p className="font-heading text-2xl">{item.title}</p>
            {item.externalUrl ? (
              <a className="break-all text-sm underline" href={item.externalUrl} target="_blank" rel="noreferrer noopener">
                {item.artifactType ? ACTION_LABEL[item.artifactType] ?? "Open" : "Open"}
              </a>
            ) : null}
            {result.view.downloads && item.kind === "file" ? (
              <a className="inline-flex min-h-11 items-center text-sm underline" href={`/view/${encodeURIComponent(token)}/files/${encodeURIComponent(item.publicId)}`}>
                Download
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
