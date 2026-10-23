import { describe, expect, it } from "vitest";
import { adaptArtifact, itemForPath } from "./artifact-adapter";
import { inspectVideoDataUrl, sniffVideoBytes, videoTypeForName } from "./video-files";
import { isNamedPoster, namedPosterPairs } from "./video-posters";
import { workflowFileExtension } from "./workflow-files";
import { previewContentType, previewKind } from "./preview";
import { fileType, schedulableMedia } from "./file-type";
import { dataUrl, fakeClip } from "./test-clips";

describe("video files", () => {
  it("reads the type from the bytes, not the name", () => {
    expect(sniffVideoBytes(fakeClip("mp4"))).toEqual({ contentType: "video/mp4", extension: "mp4" });
    expect(sniffVideoBytes(fakeClip("mov"))).toEqual({ contentType: "video/quicktime", extension: "mov" });
    expect(sniffVideoBytes(fakeClip("webm"))).toEqual({ contentType: "video/webm", extension: "webm" });
    expect(sniffVideoBytes(new TextEncoder().encode("<html>not a clip</html>"))).toBeNull();
    expect(sniffVideoBytes(new Uint8Array(4))).toBeNull();
  });

  it("knows a clip by its extension for stored files", () => {
    expect(videoTypeForName("Social/schema.MP4")?.contentType).toBe("video/mp4");
    expect(videoTypeForName("a/b.webm")?.contentType).toBe("video/webm");
    expect(videoTypeForName("a/b.mov")?.contentType).toBe("video/quicktime");
    expect(videoTypeForName("a/b.png")).toBeNull();
    expect(videoTypeForName("mp4")).toBeNull();
  });

  it("checks a data URL from its first bytes and refuses a fake or unsupported clip", () => {
    expect(inspectVideoDataUrl(dataUrl("video/mp4", fakeClip("mp4")))).toMatchObject({ kind: "video", type: { extension: "mp4" } });
    expect(inspectVideoDataUrl(dataUrl("video/quicktime", fakeClip("mov")))).toMatchObject({ kind: "video", type: { extension: "mov" } });
    expect(inspectVideoDataUrl(dataUrl("image/png", fakeClip("mp4")))).toEqual({ kind: "not_video" });
    expect(inspectVideoDataUrl("# notes")).toEqual({ kind: "not_video" });
    expect(inspectVideoDataUrl(dataUrl("video/mp4", new TextEncoder().encode("<html>hello this is not a clip</html>")), "x.mp4")).toMatchObject({ kind: "refused", message: expect.stringContaining("not a real MP4, WebM or MOV") });
    expect(inspectVideoDataUrl(dataUrl("video/x-matroska", fakeClip("webm")))).toMatchObject({ kind: "refused", message: expect.stringContaining("not supported") });
    expect(inspectVideoDataUrl("data:video/mp4,AAAA")).toMatchObject({ kind: "refused" });
  });

  it("adapts a real clip data URL into a stored file, named from the bytes", () => {
    const adapted = adaptArtifact(dataUrl("video/mp4", fakeClip("mp4")));
    expect(adapted).toMatchObject({ kind: "video", extension: "mp4", contentType: "video/mp4", format: "file" });
    expect(adapted?.bytes.byteLength).toBe(2048);
    // A webm sent as video/mp4 is stored as what it is.
    expect(adaptArtifact(dataUrl("video/mp4", fakeClip("webm")))).toMatchObject({ kind: "video", extension: "webm", contentType: "video/webm" });
    // Not a real clip, or a type HQ does not play: stays text, as before.
    expect(adaptArtifact(dataUrl("video/mp4", new TextEncoder().encode("plain words here")))?.kind).toBe("markdown");
    expect(adaptArtifact(dataUrl("video/x-matroska", fakeClip("webm")))?.kind).toBe("markdown");
    expect(workflowFileExtension({ body: dataUrl("video/quicktime", fakeClip("mov")) })).toBe("mov");
  });

  it("shapes a stored clip as a file piece with its real content type", () => {
    for (const [path, type] of [["a/clip.mp4", "video/mp4"], ["a/clip.webm", "video/webm"], ["a/clip.mov", "video/quicktime"]] as const) {
      const shaped = itemForPath(path, "key-1");
      expect(shaped.format).toBe("file");
      expect(JSON.parse(shaped.mediaJson)).toEqual([{ r2_key: "key-1", role: "main", content_type: type, size: 0 }]);
    }
  });

  it("pairs a clip with the picture named <clip>-poster in the same folder only", () => {
    const files = [
      { id: "v", relative_path: "Social/schema-video.mp4" },
      { id: "p", relative_path: "Social/schema-video-poster.jpg" },
      { id: "x", relative_path: "Other/schema-video-poster.png" },
      { id: "y", relative_path: "Social/other.png" },
    ];
    expect(namedPosterPairs(files)).toEqual([{ videoId: "v", posterId: "p" }]);
    expect(isNamedPoster(files[1]!, files)).toBe(true);
    expect(isNamedPoster(files[2]!, files)).toBe(false);
    expect(isNamedPoster(files[3]!, files)).toBe(false);
  });

  it("previews a clip like a picture, and leaves the social rules as they were", () => {
    expect(previewKind("Social/clip.mp4")).toBe("video");
    expect(previewKind("clip.webm")).toBe("video");
    expect(previewKind("clip.MOV")).toBe("video");
    expect(previewKind("page.html")).toBe("none");
    expect(previewContentType("clip.mp4")).toBe("video/mp4");
    expect(previewContentType("clip.mov")).toBe("video/quicktime");
    expect(fileType("clip.mp4").kind).toBe("video");
    // Unchanged: a clip and a picture can be scheduled from the Library, a PDF cannot.
    expect(schedulableMedia("clip.mp4")).toBe(true);
    expect(schedulableMedia("brief.pdf")).toBe(false);
  });
});
