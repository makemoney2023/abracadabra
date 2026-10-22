import { describe, expect, it } from "vitest";
import { buildFolderTree, displayPath } from "./file-label";
import { filePlateWord, filePreviewSrc, fileType, thumbnailable } from "./file-type";
import { cleanFolder, defaultFolder, fileStem } from "./work-folder";

describe("file type badge", () => {
  it.each([
    ["Social/Facebook/schema-1.png", "image", "Image", "PNG"],
    ["brief.PDF", "pdf", "PDF", "PDF"],
    ["Blog/post.md", "markdown", "Doc", "MD"],
    ["preview.html", "html", "HTML", "HTML"],
    ["budget.xlsx", "spreadsheet", "Spreadsheet", "XLSX"],
    ["export.csv", "spreadsheet", "Spreadsheet", "CSV"],
    ["assets.zip", "archive", "Zip", "ZIP"],
    ["logo.svg", "vector", "Vector", "SVG"],
    ["deck.pptx", "slides", "Slides", "PPTX"],
    ["contract.docx", "document", "Document", "DOCX"],
    ["README", "other", "File", ""],
  ])("%s is %s", (name, kind, label, extension) => {
    expect(fileType(name)).toEqual({ kind, label, extension });
  });

  it("only raster images get a thumbnail", () => {
    expect(thumbnailable("a/b.webp")).toBe(true);
    expect(thumbnailable("logo.svg")).toBe(false);
    expect(thumbnailable("brief.pdf")).toBe(false);
    expect(thumbnailable("Social/hero.png")).toBe(true);
    expect(thumbnailable("Social/clip.mp4")).toBe(false);
  });

  it("points a library still at the file preview and names a clip as video", () => {
    expect(filePreviewSrc("file-still", "Finished work/hero.png")).toBe("/api/files/file-still/preview");
    expect(filePreviewSrc("file-clip", "Finished work/clip.mp4")).toBeNull();
    expect(filePlateWord("Finished work/clip.mp4")).toBe("video");
    expect(filePlateWord("Finished work/hero.png")).toBeNull();
  });
});

describe("folder tree", () => {
  const files = [
    { name: "agent/work/2026-10-19-old-run-abc123/summary.md" },
    { name: "Finished work/2026-10-20 Social media/summary.md" },
    { name: "Social/Facebook/post-1.png" },
    { name: "Social/Facebook/post-2.png" },
    { name: "Social/LinkedIn/post-1.png" },
    { name: "logo.png" },
  ];

  it("shows old agent/work runs under Finished work", () => {
    expect(displayPath("agent/work/2026-10-19-old-run-abc123/summary.md")).toBe("Finished work/2026-10-19-old-run-abc123/summary.md");
    expect(displayPath("brand/logo.png")).toBe("brand/logo.png");
  });

  it("nests folders with counts, Finished work first and newest dated runs on top", () => {
    const tree = buildFolderTree(files, (file) => displayPath(file.name));
    expect(tree.count).toBe(6);
    expect(tree.files.map((file) => file.name)).toEqual(["logo.png"]);
    expect(tree.folders.map((folder) => [folder.name, folder.count])).toEqual([
      ["Finished work", 2],
      ["Social", 3],
    ]);
    expect(tree.folders[0].folders.map((folder) => folder.name)).toEqual(["2026-10-20 Social media", "2026-10-19-old-run-abc123"]);
    const social = tree.folders[1];
    expect(social.folders.map((folder) => [folder.path, folder.count])).toEqual([
      ["Social/Facebook", 2],
      ["Social/LinkedIn", 1],
    ]);
  });
});

describe("agent folder field", () => {
  it("cleans what agents send", () => {
    expect(cleanFolder(undefined)).toEqual({ ok: true, folder: null });
    expect(cleanFolder("  Social / Facebook/ ")).toEqual({ ok: true, folder: "Social/Facebook" });
    expect(cleanFolder("Brand\\LinkedIn")).toEqual({ ok: true, folder: "Brand/LinkedIn" });
    expect(cleanFolder("Blog/.hidden")).toEqual({ ok: true, folder: "Blog/hidden" });
    expect(cleanFolder("a/b/c/d/e/f/g").ok).toBe(false);
    expect(cleanFolder("../up").ok).toBe(false);
    expect(cleanFolder(["Blog"]).ok).toBe(false);
  });

  it("defaults to Finished work with the date and title", () => {
    expect(defaultFolder(Date.UTC(2026, 9, 20, 23), "Social media: v2")).toBe("Finished work/2026-10-20 Social media- v2");
  });

  it("keeps readable stems", () => {
    expect(fileStem("check-2.png")).toBe("check-2");
    expect(fileStem("v1.2 notes.md")).toBe("v1-2 notes");
  });
});
