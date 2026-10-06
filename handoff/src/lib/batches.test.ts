import { describe, expect, it } from "vitest";
import { deriveBatchStatus, isBatchActive, validateManifest, type FileStatus } from "./batches";
import { LIMITS } from "./policy/limits";

const quota = LIMITS.defaultQuotaBytes;

function file(relativePath: string, sizeBytes = 12, tag?: string) {
  return { relativePath, sizeBytes, contentType: "application/octet-stream", tag };
}

describe("validateManifest", () => {
  it("returns the index of a bad entry", () => {
    const result = validateManifest({
      files: [file("brand/logo.svg"), file("/etc/passwd")],
      profile: "standard",
      workspaceUsedBytes: 0,
      workspaceQuotaBytes: quota,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.index).toBe(1);
  });

  it("refuses two paths that differ only by Unicode composition", () => {
    const composed = "brand/caf\u00e9.svg";
    const decomposed = "brand/cafe\u0301.svg";
    const result = validateManifest({
      files: [file(composed), file(decomposed)],
      profile: "standard",
      workspaceUsedBytes: 0,
      workspaceQuotaBytes: quota,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.index).toBe(1);
      expect(result.reason).toMatch(/same path/i);
    }
  });

  it("refuses an unknown tag, an empty file, too many files, and 10 GB plus one byte", () => {
    const unknown = validateManifest({
      files: [file("notes.txt", 12, "secret")],
      profile: "standard",
      workspaceUsedBytes: 0,
      workspaceQuotaBytes: quota,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.index).toBe(0);

    const empty = validateManifest({
      files: [file("notes.txt", 0)],
      profile: "standard",
      workspaceUsedBytes: 0,
      workspaceQuotaBytes: quota,
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.index).toBe(0);

    const tooMany = validateManifest({
      files: Array.from({ length: 2001 }, (_, index) => file(`notes/file-${index}.txt`)),
      profile: "standard",
      workspaceUsedBytes: 0,
      workspaceQuotaBytes: quota,
    });
    expect(tooMany.ok).toBe(false);

    const oversized = validateManifest({
      files: [
        ...Array.from({ length: 5 }, (_, index) => file(`video/part-${index}.mp4`, LIMITS.maxFileBytes)),
        file("notes/extra.txt", 1),
      ],
      profile: "standard",
      workspaceUsedBytes: 0,
      workspaceQuotaBytes: quota,
    });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.index).toBe(5);
  });

  it("refuses a manifest that would pass the workspace quota", () => {
    const result = validateManifest({
      files: [file("notes.txt", 2)],
      profile: "standard",
      workspaceUsedBytes: quota - 1,
      workspaceQuotaBytes: quota,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/quota/i);
  });
});

describe("isBatchActive", () => {
  const created = new Date("2026-10-06T00:00:00.000Z");

  it("stays active five hours after the last activity", () => {
    const now = new Date(created.getTime() + 5 * 60 * 60 * 1000);
    expect(isBatchActive(created, created, now)).toBe(true);
  });

  it("closes after six hours without activity", () => {
    const last = new Date(created.getTime() + 60 * 1000);
    const now = new Date(last.getTime() + LIMITS.activityWindowMs);
    expect(isBatchActive(created, last, now)).toBe(false);
  });

  it("closes 24 hours after creation even with recent activity", () => {
    const now = new Date(created.getTime() + LIMITS.maxBatchLifeMs);
    expect(isBatchActive(created, now, now)).toBe(false);
  });
});

describe("deriveBatchStatus", () => {
  function status(files: FileStatus[], active: boolean, discarded = false) {
    return deriveBatchStatus({
      files: files.map((fileStatus) => ({ status: fileStatus })),
      active,
      discarded,
    });
  }

  it("follows every HND-048 row", () => {
    expect(status(["clean"], true, true)).toBe("discarded");
    expect(status(["pending", "clean"], true)).toBe("uploading");
    expect(status(["failed"], true)).toBe("uploading");
    expect(status(["uploaded", "scanning"], true)).toBe("scanning");
    expect(status(["held", "clean"], false)).toBe("needs_review");
    expect(status(["clean", "rejected"], false)).toBe("ready");
    expect(status(["rejected", "failed"], false)).toBe("rejected");
  });
});
