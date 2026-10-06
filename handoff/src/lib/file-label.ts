/** Plain words for a file row in the folder. */
export function fileStatusLabel(status: string): string {
  switch (status) {
    case "uploaded":
    case "scanning":
      return "Checking";
    case "clean":
      return "Ready";
    case "held":
      return "Needs a look";
    case "rejected":
      return "Blocked";
    case "failed":
      return "Didn't work";
    default:
      return "Waiting";
  }
}

/** A short size, like 2 KB or 1.0 MB. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
