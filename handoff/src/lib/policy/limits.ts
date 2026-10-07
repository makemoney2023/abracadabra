/** Caps from HND-019, HND-012, HND-025, HND-029, and HND-057. */
export const LIMITS = {
  maxFilesPerBatch: 2_000,
  maxBatchBytes: 10 * 1024 * 1024 * 1024,
  maxFileBytes: 2 * 1024 * 1024 * 1024,
  maxPathLength: 512,
  maxDepth: 16,
  maxSegmentLength: 255,
  batchesPerWorkspacePerHour: 10,
  defaultQuotaBytes: 100 * 1024 * 1024 * 1024,
  maxNoteChars: 2_000,
  maxGuidanceChars: 2_000,
  maxManifestBytes: 1024 * 1024,
  invitesPerInviterPerDay: 30,
  exportsPerOperatorPerHour: 20,
  magicLinksPerEmailPerHour: 5,
  sessionTtlMs: 12 * 60 * 60 * 1000,
  inviteTtlDays: 14,
  activityWindowMs: 6 * 60 * 60 * 1000,
  maxBatchLifeMs: 24 * 60 * 60 * 1000,
  rejectedObjectTtlMs: 14 * 24 * 60 * 60 * 1000,
  defaultRetentionDays: 90,
  purgeReminderLeadMs: 7 * 24 * 60 * 60 * 1000,
  logoMaxBytes: 512 * 1024,
  partSizeBytes: 6 * 1024 * 1024,
  uploadConcurrency: 3,
  downloadTtlSeconds: 5 * 60,
  exportTtlSeconds: 60 * 60,
  workspaceExportTtlSeconds: 24 * 60 * 60,
  maxScanAttempts: 5,
} as const;

export const FILE_TAGS = [
  "brand",
  "photo",
  "copy",
  "data_export",
  "reference",
  "source",
  "other",
] as const;

export type FileTag = (typeof FILE_TAGS)[number];

export function isFileTag(value: string): value is FileTag {
  return (FILE_TAGS as readonly string[]).includes(value);
}
