import { sniffVideoBytes } from "./video-files";

export type ArtifactKind = "markdown" | "json" | "pdf" | "image" | "video";

export type ItemFormat = "page" | "file" | "static" | "video";

export type AdaptedArtifact = {
  kind: ArtifactKind;
  extension: string;
  contentType: string;
  bytes: Uint8Array;
  format: ItemFormat;
};

const VIDEO_DECLARED = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const IMAGES: Record<string, { extension: string; contentType: string }> = {
  "image/png": { extension: "png", contentType: "image/png" },
  "image/jpeg": { extension: "jpg", contentType: "image/jpeg" },
  "image/jpg": { extension: "jpg", contentType: "image/jpeg" },
  "image/webp": { extension: "webp", contentType: "image/webp" },
  "image/gif": { extension: "gif", contentType: "image/gif" },
};

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function markdown(body: string): AdaptedArtifact {
  return { kind: "markdown", extension: "md", contentType: "text/markdown", bytes: utf8(body), format: "page" };
}

function decodeBase64(value: string): Uint8Array | null {
  const compact = value.replace(/\s/g, "");
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  try {
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Classifies a swarm string. Prose stays markdown. A data URL that is not a real PDF or image stays markdown. */
export function adaptArtifact(body: string): AdaptedArtifact | null {
  if (body.trim().length === 0) return null;
  const trimmed = body.trim();
  const data = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(trimmed);
  if (data) {
    const type = data[1]?.toLowerCase() ?? "";
    const bytes = decodeBase64(data[2] ?? "");
    const image = IMAGES[type];
    if (bytes && image) {
      return { kind: "image", extension: image.extension, contentType: image.contentType, bytes, format: "static" };
    }
    if (bytes && type === "application/pdf" && isPdf(bytes)) {
      return { kind: "pdf", extension: "pdf", contentType: "application/pdf", bytes, format: "file" };
    }
    if (bytes && type.startsWith("video/")) {
      // A clip: the bytes must really be MP4, WebM or MOV (decided from the bytes, not the declared type).
      const video = sniffVideoBytes(bytes);
      if (video && VIDEO_DECLARED.has(type)) {
        return { kind: "video", extension: video.extension, contentType: video.contentType, bytes, format: "file" };
      }
    }
    return markdown(body);
  }
  if (trimmed.startsWith("%PDF") && isPdf(utf8(trimmed))) {
    return { kind: "pdf", extension: "pdf", contentType: "application/pdf", bytes: utf8(trimmed), format: "file" };
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed !== null && typeof parsed === "object") {
        return {
          kind: "json",
          extension: "json",
          contentType: "application/json",
          bytes: utf8(JSON.stringify(parsed)),
          format: "file",
        };
      }
    } catch {
      // A sentence that only looks like JSON stays markdown.
    }
  }
  return markdown(body);
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  md: "text/markdown",
  txt: "text/plain",
};

const CLIP_EXTENSIONS = new Set(["mp4", "webm", "mov"]);

/**
 * Deliverable row for a stored path. Markdown stays a page. Pictures are static. Other files are files.
 * A clip is a `file` piece, like a PDF, except in a social pack: there it is a `video` piece, the same format a clip
 * scheduled from the Library gets, so the Social tab, scheduling, auto-post and chat tools can see it.
 * Only a social pack opts in (`socialPack`). A clip in a report, design system or website stays a file, so it never
 * becomes postable by accident.
 */
export function itemForPath(
  path: string,
  objectKey: string | null,
  options: { socialPack?: boolean } = {},
): { format: ItemFormat; mediaJson: string } {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const image = extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "webp" || extension === "gif";
  const clip = CLIP_EXTENSIONS.has(extension);
  const format: ItemFormat = image
    ? "static"
    : clip && options.socialPack
      ? "video"
      : extension === "pdf" || extension === "json" || clip
        ? "file"
        : "page";
  if (!objectKey) return { format, mediaJson: "[]" };
  return {
    format,
    mediaJson: JSON.stringify([
      { r2_key: objectKey, role: "main", content_type: CONTENT_TYPES[extension] ?? "application/octet-stream", size: 0 },
    ]),
  };
}
