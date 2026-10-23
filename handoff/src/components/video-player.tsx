import { videoTypeForName } from "@/lib/video-files";

/**
 * A clip player for Files, finished work and view links. Native controls, playsInline so iPhones play it in the page,
 * preload="metadata" so only the start is fetched until someone presses play. The poster is the frame shown before play;
 * without one, "#t=0.1" asks the browser to paint the first frame instead of a black box.
 */
export function VideoPlayer({
  src,
  poster,
  title,
  type,
  name,
  className,
}: {
  src: string;
  poster?: string | null;
  title: string;
  /** Content type of the stored clip, like video/mp4. When absent it is read from the file name. */
  type?: string | null;
  name?: string;
  className?: string;
}) {
  const contentType = type || (name ? videoTypeForName(name)?.contentType : undefined);
  return (
    <video
      controls
      playsInline
      preload="metadata"
      poster={poster ?? undefined}
      aria-label={title}
      className={className ?? "max-h-[70vh] w-full rounded-lg border border-border bg-black"}
    >
      <source src={poster ? src : `${src}#t=0.1`} type={contentType} />
      <a href={src} className="underline">Open {title}</a>
    </video>
  );
}
