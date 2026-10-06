import { LIMITS, isFileTag, type FileTag } from "./policy/limits";
import { normalizeRelativePath } from "./policy/paths";
import { inspectFileName, type PolicyProfile } from "./policy/profiles";

export type FileStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "scanning"
  | "clean"
  | "rejected"
  | "held"
  | "failed";

export type BatchStatus =
  | "discarded"
  | "uploading"
  | "scanning"
  | "needs_review"
  | "ready"
  | "rejected";

export type ValidFile = {
  relativePath: string;
  extension: string;
  sizeBytes: number;
  contentType: string;
  tag?: FileTag;
};

export type ManifestInput = {
  files: {
    relativePath: string;
    sizeBytes: number;
    contentType: string;
    tag?: string;
  }[];
  profile: PolicyProfile;
  workspaceUsedBytes: number;
  workspaceQuotaBytes: number;
};

export type ManifestResult =
  | { ok: true; files: ValidFile[]; totalBytes: number }
  | { ok: false; reason: string; index?: number };

const IN_FLIGHT = new Set<FileStatus>(["pending", "uploading", "uploaded", "scanning"]);

/** Whole-manifest check. The first bad entry keeps its index. */
export function validateManifest(input: ManifestInput): ManifestResult {
  if (input.files.length > LIMITS.maxFilesPerBatch) {
    return { ok: false, reason: "An upload can hold 2,000 files." };
  }
  const files: ValidFile[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const [index, entry] of input.files.entries()) {
    if (!Number.isInteger(entry.sizeBytes) || entry.sizeBytes <= 0) {
      return { ok: false, reason: "We can't take empty files.", index };
    }
    if (entry.sizeBytes > LIMITS.maxFileBytes) {
      return { ok: false, reason: "A file can be 2 GB at most.", index };
    }
    if (entry.tag !== undefined && !isFileTag(entry.tag)) {
      return { ok: false, reason: "That label isn't allowed.", index };
    }
    const path = normalizeRelativePath(entry.relativePath);
    if (!path.ok) return { ok: false, reason: path.reason, index };
    const inspected = inspectFileName(path.path, input.profile);
    if (!inspected.ok) return { ok: false, reason: inspected.reason, index };
    if (seen.has(path.path)) {
      return { ok: false, reason: "Two files have the same name and folder.", index };
    }
    seen.add(path.path);
    totalBytes += entry.sizeBytes;
    files.push({
      relativePath: path.path,
      extension: inspected.extension,
      sizeBytes: entry.sizeBytes,
      contentType: entry.contentType,
      tag: entry.tag,
    });
    if (totalBytes > LIMITS.maxBatchBytes) {
      return { ok: false, reason: "An upload can hold 10 GB.", index };
    }
  }
  if (input.workspaceUsedBytes + totalBytes > input.workspaceQuotaBytes) {
    return { ok: false, reason: "This upload is too big for the space you have left." };
  }
  return { ok: true, files, totalBytes };
}

export function isBatchActive(createdAt: Date, lastActivityAt: Date, now: Date): boolean {
  const age = now.getTime() - createdAt.getTime();
  const idle = now.getTime() - lastActivityAt.getTime();
  if (age >= LIMITS.maxBatchLifeMs) return false;
  if (idle >= LIMITS.activityWindowMs) return false;
  return true;
}

/** HND-048. Discard wins. A failed file keeps an open window in `uploading`. */
export function deriveBatchStatus(input: {
  files: { status: FileStatus }[];
  active: boolean;
  discarded: boolean;
}): BatchStatus {
  if (input.discarded) return "discarded";
  const statuses = input.files.map((file) => file.status);
  const inFlight = statuses.some((status) => IN_FLIGHT.has(status));
  const uploadOpen = statuses.some(
    (status) => status === "pending" || status === "uploading" || status === "failed",
  );
  if (input.active && uploadOpen) return "uploading";
  const pastUpload = statuses.every(
    (status) => status !== "pending" && status !== "uploading" && status !== "failed",
  );
  if (pastUpload && statuses.some((status) => status === "uploaded" || status === "scanning")) {
    return "scanning";
  }
  if (statuses.some((status) => status === "held") && !inFlight) return "needs_review";
  if (statuses.some((status) => status === "clean") && !inFlight && !statuses.includes("held")) {
    return "ready";
  }
  if (
    statuses.length > 0 &&
    statuses.every((status) => status === "rejected" || status === "failed") &&
    !inFlight
  ) {
    return "rejected";
  }
  return "uploading";
}
