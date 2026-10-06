import { describe, expect, it } from "vitest";
import { fileStatusLabel, formatFileSize, groupFolderFiles } from "./file-label";

describe("file labels", () => {
  it("says a checked file is ready", () => {
    expect(fileStatusLabel("clean")).toBe("Ready");
    expect(fileStatusLabel("scanning")).toBe("Checking");
  });

  it("uses a plain word for a status it does not know", () => {
    expect(fileStatusLabel("nope")).toBe("Waiting");
  });

  it("shows a file size the way a folder does", () => {
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("shows 0 B when the size is missing", () => {
    expect(formatFileSize(-1)).toBe("0 B");
    expect(formatFileSize(Number.NaN)).toBe("0 B");
  });

  it("puts files that start with a folder name into that folder", () => {
    const groups = groupFolderFiles([
      { name: "notes.txt" },
      { name: "photos/b.txt" },
      { name: "photos/trip/a.txt" },
      { name: "clips/a.mp4" },
    ]);
    expect(groups).toEqual([
      {
        kind: "folder",
        name: "clips",
        files: [{ name: "clips/a.mp4" }],
      },
      {
        kind: "folder",
        name: "photos",
        files: [{ name: "photos/b.txt" }, { name: "photos/trip/a.txt" }],
      },
      { kind: "file", file: { name: "notes.txt" } },
    ]);
  });

  it("keeps a file named with no slash on its own", () => {
    expect(groupFolderFiles([{ name: "readme" }])).toEqual([{ kind: "file", file: { name: "readme" } }]);
  });
});
