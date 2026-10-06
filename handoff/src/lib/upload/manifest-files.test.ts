import { describe, expect, it } from "vitest";
import { filesFromDrop } from "./manifest-files";

describe("filesFromDrop", () => {
  it("uses webkitRelativePath for a folder and name for a loose file", () => {
    const listed = filesFromDrop([
      {
        name: "logo.png",
        webkitRelativePath: "brand/logo.png",
        size: 12,
        type: "image/png",
      },
      { name: "notes.txt", webkitRelativePath: "", size: 4, type: "" },
    ]);
    expect(listed).toEqual([
      { relativePath: "brand/logo.png", sizeBytes: 12, contentType: "image/png" },
      { relativePath: "notes.txt", sizeBytes: 4, contentType: "application/octet-stream" },
    ]);
  });
});
