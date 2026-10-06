import { LIMITS } from "./limits";

export type PathResult =
  | { ok: true; path: string }
  | { ok: false; reason: string };

const CONTROL = /[\u0000-\u001F\u007F]/;

/** NFC relative path. Absolute, dot, empty, and hidden segments are refused. */
export function normalizeRelativePath(input: string): PathResult {
  if (input.length === 0) return { ok: false, reason: "The file path is empty." };
  if (CONTROL.test(input)) {
    return { ok: false, reason: "The file path has a hidden character." };
  }
  if (input.includes("\\")) {
    return { ok: false, reason: "The file path has a backslash." };
  }
  if (input.startsWith("/") || /^[A-Za-z]:/.test(input)) {
    return { ok: false, reason: "The file path can't start with a slash." };
  }
  const path = input.normalize("NFC");
  if (path.length > LIMITS.maxPathLength) {
    return { ok: false, reason: "The file path is too long." };
  }
  const segments = path.split("/");
  if (segments.length > LIMITS.maxDepth) {
    return { ok: false, reason: "The file is buried in too many folders." };
  }
  for (const segment of segments) {
    if (segment.length === 0) {
      return { ok: false, reason: "The file path has an empty folder name." };
    }
    if (segment === "." || segment === "..") {
      return { ok: false, reason: "The file path has a dot as a folder name." };
    }
    if (segment.startsWith(".")) {
      return { ok: false, reason: "A folder or file name starts with a dot." };
    }
    if (segment.length > LIMITS.maxSegmentLength) {
      return { ok: false, reason: "A folder or file name is too long." };
    }
  }
  return { ok: true, path };
}
