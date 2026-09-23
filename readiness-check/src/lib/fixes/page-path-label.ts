/** Short path for UI labels — avoids full URLs overflowing the fix checklist. */
export function pagePathLabel(url: string): string {
  try {
    const path = new URL(url).pathname || "/";
    return path.length > 1 ? path.replace(/\/$/, "") || "/" : "/";
  } catch {
    return url;
  }
}
