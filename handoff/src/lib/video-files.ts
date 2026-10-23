/**
 * Video files HQ keeps and plays: MP4, WebM and MOV. Types are decided from the bytes, never from the name or the
 * declared type alone, so a renamed file cannot be served as video. Used by filing (artifact-adapter), preview and
 * the video routes. No server imports: client components may use videoTypeForName.
 */

export type VideoType = { contentType: "video/mp4" | "video/webm" | "video/quicktime"; extension: "mp4" | "webm" | "mov" };

const MP4: VideoType = { contentType: "video/mp4", extension: "mp4" };
const WEBM: VideoType = { contentType: "video/webm", extension: "webm" };
const MOV: VideoType = { contentType: "video/quicktime", extension: "mov" };

/** Declared data-URL types HQ accepts for a clip. Anything else under video/ is refused with a clear message. */
const DECLARED: Record<string, VideoType> = {
  "video/mp4": MP4,
  "video/webm": WEBM,
  "video/quicktime": MOV,
};

const BY_EXTENSION: Record<string, VideoType> = { mp4: MP4, webm: WEBM, mov: MOV };

export const VIDEO_FORMATS_TEXT = "MP4, WebM or MOV";

/** The video type for a file name, by extension only. Serving uses this for stored files whose bytes were checked at filing. */
export function videoTypeForName(name: string): VideoType | null {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return BY_EXTENSION[base.slice(dot + 1).toLowerCase()] ?? null;
}

/** MP4 and MOV start with an "ftyp" box (the brand "qt  " is QuickTime). WebM starts with the EBML magic 1A 45 DF A3. */
export function sniffVideoBytes(bytes: Uint8Array): VideoType | null {
  if (bytes.byteLength >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    return brand === "qt  " ? MOV : MP4;
  }
  if (bytes.byteLength >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return WEBM;
  return null;
}

const DATA_HEAD = /^\s*data:(video\/[a-z0-9.+-]+)((?:;[^;,]*)*);base64,/i;

function headBytes(base64: string): Uint8Array | null {
  const compact = base64.replace(/\s/g, "").slice(0, 64);
  const usable = compact.slice(0, compact.length - (compact.length % 4));
  if (usable.length < 16 || !/^[A-Za-z0-9+/]+$/.test(usable)) return null;
  try {
    const binary = atob(usable);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export type VideoDataUrl =
  | { kind: "not_video" }
  | { kind: "video"; type: VideoType }
  | { kind: "refused"; message: string };

/**
 * Looks at the start of a base64 data URL only (no full decode). A "data:video/..." body is a video, or is refused:
 * an unsupported type, or bytes that are not a real MP4, WebM or MOV. Anything not under video/ is not_video.
 */
export function inspectVideoDataUrl(body: string, name?: string): VideoDataUrl {
  const text = body.trimStart();
  if (!/^data:video\//i.test(text)) return { kind: "not_video" };
  const label = name ? `${name}: ` : "";
  const head = DATA_HEAD.exec(text);
  if (!head) return { kind: "refused", message: `${label}send a video as a base64 data URL like data:video/mp4;base64,... (${VIDEO_FORMATS_TEXT}).` };
  const declared = DECLARED[head[1]!.toLowerCase()];
  if (!declared) return { kind: "refused", message: `${label}${head[1]} is not supported. HQ plays ${VIDEO_FORMATS_TEXT}.` };
  const sniffed = sniffVideoBytes(headBytes(text.slice(head[0].length)) ?? new Uint8Array());
  if (!sniffed) return { kind: "refused", message: `${label}these bytes are not a real ${VIDEO_FORMATS_TEXT} file.` };
  return { kind: "video", type: sniffed };
}
