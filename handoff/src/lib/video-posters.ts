import { videoTypeForName } from "@/lib/video-files";

const POSTER = /^(.*)-poster\.(png|jpe?g|webp)$/i;

function stemOf(path: string): { dir: string; stem: string } {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash) : "";
  const base = path.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  return { dir, stem: dot > 0 ? base.slice(0, dot) : base };
}

/**
 * Pairs each clip with a picture named "<clip stem>-poster.png|jpg|webp" in the same folder.
 * The picture is the clip's poster; it is not a separate piece of its own.
 */
export function namedPosterPairs(files: { id: string; relative_path: string }[]): { videoId: string; posterId: string }[] {
  const posters = new Map<string, string>();
  for (const file of files) {
    const base = file.relative_path.split("/").pop() ?? "";
    if (!POSTER.test(base)) continue;
    const { dir } = stemOf(file.relative_path);
    const stem = POSTER.exec(base)![1]!;
    posters.set(`${dir}/${stem}`.toLowerCase(), file.id);
  }
  const pairs: { videoId: string; posterId: string }[] = [];
  for (const file of files) {
    if (!videoTypeForName(file.relative_path)) continue;
    const { dir, stem } = stemOf(file.relative_path);
    const posterId = posters.get(`${dir}/${stem}`.toLowerCase());
    if (posterId) pairs.push({ videoId: file.id, posterId });
  }
  return pairs;
}

/** True for a picture that is the named poster of a clip in the same list. */
export function isNamedPoster(file: { relative_path: string }, files: { relative_path: string }[]): boolean {
  const base = file.relative_path.split("/").pop() ?? "";
  const match = POSTER.exec(base);
  if (!match) return false;
  const { dir } = stemOf(file.relative_path);
  const wanted = `${dir}/${match[1]}`.toLowerCase();
  return files.some((other) => {
    if (!videoTypeForName(other.relative_path)) return false;
    const { dir: otherDir, stem } = stemOf(other.relative_path);
    return `${otherDir}/${stem}`.toLowerCase() === wanted;
  });
}
