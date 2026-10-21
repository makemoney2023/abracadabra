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

/** Older agent filings were stored under agent/work/<run>/. They show under Finished work, like new ones. */
const LEGACY_FINISHED = "agent/work/";
export const FINISHED_WORK_FOLDER = "Finished work";

/** The path a person sees. Only the display changes; the stored path stays as it is. */
export function displayPath(relativePath: string): string {
  if (relativePath.startsWith(LEGACY_FINISHED) && relativePath.length > LEGACY_FINISHED.length) {
    return `${FINISHED_WORK_FOLDER}/${relativePath.slice(LEGACY_FINISHED.length)}`;
  }
  return relativePath;
}

export type FolderNode<T extends FolderListFile> = {
  /** Last segment, like Facebook. Empty for the root. */
  name: string;
  /** Display path from the root, like Social/Facebook. Empty for the root. */
  path: string;
  folders: FolderNode<T>[];
  /** Files directly in this folder. */
  files: T[];
  /** Every file in this folder and below. */
  count: number;
};

const DATED = /^\d{4}-\d{2}-\d{2}/;

/** Dated folders (Finished work runs) newest first, everything else A to Z. */
function compareFolders(a: string, b: string): number {
  if (DATED.test(a) && DATED.test(b)) return b.localeCompare(a);
  if (a === FINISHED_WORK_FOLDER) return -1;
  if (b === FINISHED_WORK_FOLDER) return 1;
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

/**
 * Nests files by every folder in their display path: `Social/Facebook/a.png` sits in Social > Facebook.
 * `label` picks the path to group by (defaults to the file name). Counts include every file below a folder.
 */
export function buildFolderTree<T extends FolderListFile>(files: T[], label: (file: T) => string = (file) => file.name): FolderNode<T> {
  const root: FolderNode<T> = { name: "", path: "", folders: [], files: [], count: 0 };
  for (const file of files) {
    const segments = label(file).split("/").filter((segment) => segment.length > 0);
    segments.pop();
    let node = root;
    node.count += 1;
    for (const segment of segments) {
      let next = node.folders.find((folder) => folder.name === segment);
      if (!next) {
        next = { name: segment, path: node.path ? `${node.path}/${segment}` : segment, folders: [], files: [], count: 0 };
        node.folders.push(next);
      }
      next.count += 1;
      node = next;
    }
    node.files.push(file);
  }
  const sort = (node: FolderNode<T>) => {
    node.folders.sort((a, b) => compareFolders(a.name, b.name));
    node.files.sort((a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: "base", numeric: true }));
    node.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** The file's own name, without its folders. */
export function baseName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
