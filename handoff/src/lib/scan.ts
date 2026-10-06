import { LIMITS } from "./policy/limits";

export type ClamdResult =
  | { kind: "ok" }
  | { kind: "found"; signature: string }
  | { kind: "limit"; detail: string }
  | { kind: "error"; detail: string }
  | { kind: "skipped_dev" };

export type ScanDecision =
  | { status: "clean" }
  | { status: "rejected"; reason: string }
  | { status: "held"; reason: string }
  | { status: "retry"; delaySeconds: number };

const MAGIC: Record<string, (header: Uint8Array) => boolean> = {
  jpg: jpeg,
  jpeg: jpeg,
  png: (header) => startsWith(header, [0x89, 0x50, 0x4e, 0x47]),
  gif: (header) => startsWith(header, [0x47, 0x49, 0x46, 0x38]),
  webp: (header) => startsWith(header, [0x52, 0x49, 0x46, 0x46]) && startsWith(header, [0x57, 0x45, 0x42, 0x50], 8),
  tif: tiff,
  tiff: tiff,
  pdf: (header) => startsWith(header, [0x25, 0x50, 0x44, 0x46]),
  zip: zip,
  docx: zip,
  xlsx: zip,
  pptx: zip,
  doc: ole,
  xls: ole,
  ppt: ole,
  otf: (header) => startsWith(header, [0x4f, 0x54, 0x54, 0x4f]),
  ttf: (header) => startsWith(header, [0x00, 0x01, 0x00, 0x00]),
  woff: (header) => startsWith(header, [0x77, 0x4f, 0x46, 0x46]),
  woff2: (header) => startsWith(header, [0x77, 0x4f, 0x46, 0x32]),
  mp4: ftyp,
  mov: ftyp,
  webm: (header) => startsWith(header, [0x1a, 0x45, 0xdf, 0xa3]),
};

const TEXT = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "xml",
  "svg",
  "html",
  "htm",
  "css",
  "rtf",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "php",
  "java",
  "go",
  "rs",
  "cs",
  "swift",
  "kt",
  "vue",
  "svelte",
  "yaml",
  "yml",
  "toml",
  "ini",
  "sql",
]);

const EXTENSION_ONLY = new Set([
  "ai",
  "eps",
  "psd",
  "indd",
  "fig",
  "sketch",
  "heic",
  "ico",
  "dwg",
  "dxf",
  "tar",
  "gz",
  "tgz",
]);

function startsWith(header: Uint8Array, bytes: number[], offset = 0): boolean {
  if (header.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => header[offset + index] === byte);
}

function jpeg(header: Uint8Array): boolean {
  return startsWith(header, [0xff, 0xd8, 0xff]);
}

function tiff(header: Uint8Array): boolean {
  return startsWith(header, [0x49, 0x49, 0x2a, 0x00]) || startsWith(header, [0x4d, 0x4d, 0x00, 0x2a]);
}

function zip(header: Uint8Array): boolean {
  return (
    startsWith(header, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(header, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(header, [0x50, 0x4b, 0x07, 0x08])
  );
}

function ole(header: Uint8Array): boolean {
  return startsWith(header, [0xd0, 0xcf, 0x11, 0xe0]);
}

function ftyp(header: Uint8Array): boolean {
  return startsWith(header, [0x66, 0x74, 0x79, 0x70], 4);
}

function executable(header: Uint8Array): boolean {
  return (
    startsWith(header, [0x4d, 0x5a]) ||
    startsWith(header, [0x7f, 0x45, 0x4c, 0x46]) ||
    startsWith(header, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(header, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(header, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(header, [0xcf, 0xfa, 0xed, 0xfe])
  );
}

function signatureOk(extension: string, header: Uint8Array): { ok: true } | { ok: false; reason: string } {
  const ext = extension.toLowerCase();
  const magic = MAGIC[ext];
  if (magic) {
    return magic(header)
      ? { ok: true }
      : { ok: false, reason: `The ${ext} header does not match its signature.` };
  }
  if (TEXT.has(ext)) {
    return executable(header)
      ? { ok: false, reason: "Text and code files can't be programs in disguise." }
      : { ok: true };
  }
  if (EXTENSION_ONLY.has(ext)) return { ok: true };
  return { ok: false, reason: `No signature rule exists for .${ext}.` };
}

/** Signature check first. A scanner outage never becomes clean. */
export function decideScan(input: {
  extension: string;
  header: Uint8Array;
  clamd: ClamdResult;
  attempts: number;
  allowUnscanned: boolean;
}): ScanDecision {
  const signature = signatureOk(input.extension, input.header);
  if (!signature.ok) return { status: "rejected", reason: signature.reason };

  switch (input.clamd.kind) {
    case "ok":
      return { status: "clean" };
    case "found":
      return { status: "rejected", reason: input.clamd.signature };
    case "limit":
      return { status: "held", reason: input.clamd.detail };
    case "error":
      if (input.attempts >= LIMITS.maxScanAttempts) {
        return { status: "held", reason: input.clamd.detail };
      }
      return { status: "retry", delaySeconds: 2 ** input.attempts };
    case "skipped_dev":
      if (input.allowUnscanned) return { status: "clean" };
      return { status: "held", reason: "The safety check was skipped." };
    default:
      return { status: "held", reason: "The safety check didn't give an answer." };
  }
}
