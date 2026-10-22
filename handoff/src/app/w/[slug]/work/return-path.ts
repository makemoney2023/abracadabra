/** Where an approval may return. Anything else stays on the finished-work page. */
export function feedbackReturnPath(slug: string, raw: string, staff: boolean): string | null {
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(value, "https://handoff.local");
  } catch {
    return null;
  }
  if (url.origin !== "https://handoff.local") return null;
  const path = url.pathname;
  if (path === `/w/${slug}/social` && url.search === "") return path;
  if (path.startsWith(`/w/${slug}/work/`) && path.length > `/w/${slug}/work/`.length && url.search === "") return path;
  if (!staff || !/^\/clients\/[^/]+$/.test(path)) return null;
  if (url.searchParams.get("tab") !== "social" || [...url.searchParams.keys()].some((key) => key !== "tab")) return null;
  return `${path}?tab=social`;
}

export function appendSent(path: string, sent: string): string {
  return appendQuery(path, "sent", sent);
}

export function appendQuery(path: string, key: string, value: string): string {
  const url = new URL(path, "https://handoff.local");
  url.searchParams.set(key, value.slice(0, 300));
  return `${url.pathname}${url.search}`;
}
