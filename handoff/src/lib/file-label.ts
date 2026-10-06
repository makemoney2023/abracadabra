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

export type FolderListFile = {
  name: string;
};

export type FolderGroup<T extends FolderListFile> =
  | { kind: "folder"; name: string; files: T[] }
  | { kind: "file"; file: T };

/** Group `photos/a.txt` under `photos`. A name with no slash stays a file. */
export function groupFolderFiles<T extends FolderListFile>(files: T[]): FolderGroup<T>[] {
  const folders = new Map<string, T[]>();
  const roots: T[] = [];
  for (const file of files) {
    const slash = file.name.indexOf("/");
    if (slash <= 0) {
      roots.push(file);
      continue;
    }
    const folder = file.name.slice(0, slash);
    const list = folders.get(folder);
    if (list) list.push(file);
    else folders.set(folder, [file]);
  }
  const groups: FolderGroup<T>[] = [];
  for (const name of [...folders.keys()].toSorted((a, b) => a.localeCompare(b))) {
    const nested = folders.get(name);
    if (nested) groups.push({ kind: "folder", name, files: nested });
  }
  for (const file of roots) groups.push({ kind: "file", file });
  return groups;
}

/** A short size, like 2 KB or 1.0 MB. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
