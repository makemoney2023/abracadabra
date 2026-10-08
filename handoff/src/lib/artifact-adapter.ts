export type ArtifactKind = "markdown" | "json" | "pdf" | "image";

export type ItemFormat = "page" | "file" | "static";

export type AdaptedArtifact = {
  kind: ArtifactKind;
  extension: string;
  contentType: string;
  bytes: Uint8Array;
  format: ItemFormat;
};

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
  md: "text/markdown",
  txt: "text/plain",
};

/** Deliverable row for a stored path. Markdown stays a page. Pictures are static. Other files are files. */
export function itemForPath(path: string, objectKey: string | null): { format: ItemFormat; mediaJson: string } {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const image = extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "webp" || extension === "gif";
  const format: ItemFormat = image ? "static" : extension === "pdf" || extension === "json" ? "file" : "page";
  if (!objectKey) return { format, mediaJson: "[]" };
  return {
    format,
    mediaJson: JSON.stringify([
      { r2_key: objectKey, role: "main", content_type: CONTENT_TYPES[extension] ?? "application/octet-stream", size: 0 },
    ]),
  };
}
