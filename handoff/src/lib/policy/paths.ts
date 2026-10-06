import { LIMITS } from "./limits";

export type PathResult =
  | { ok: true; path: string }
  | { ok: false; reason: string };

const CONTROL = /[\u0000-\u001F\u007F]/;

/** NFC relative path. Absolute, dot, empty, and hidden segments are refused. */
export function normalizeRelativePath(input: string): PathResult {
  if (input.length === 0) return { ok: false, reason: "Path is empty." };
  if (CONTROL.test(input)) {
    return { ok: false, reason: "Path contains a control character." };
  }
  if (input.includes("\\")) {
    return { ok: false, reason: "Path contains a backslash." };
  }
  if (input.startsWith("/") || /^[A-Za-z]:/.test(input)) {
    return { ok: false, reason: "Path is absolute." };
  }
  const path = input.normalize("NFC");
  if (path.length > LIMITS.maxPathLength) {
    return { ok: false, reason: "Path is longer than 512 characters." };
  }
  const segments = path.split("/");
  if (segments.length > LIMITS.maxDepth) {
    return { ok: false, reason: "Path is deeper than 16 segments." };
  }
  for (const segment of segments) {
    if (segment.length === 0) {
      return { ok: false, reason: "Path contains an empty segment." };
    }
    if (segment === "." || segment === "..") {
      return { ok: false, reason: "Path contains a dot segment." };
    }
    if (segment.startsWith(".")) {
      return { ok: false, reason: "Path segment starts with a dot." };
    }
    if (segment.length > LIMITS.maxSegmentLength) {
      return { ok: false, reason: "Path segment is longer than 255 characters." };
    }
  }
  return { ok: true, path };
}
