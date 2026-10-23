import type { ObjectStore } from "@/lib/store/objects";

/**
 * Serves one stored object with HTTP Range support, so a browser can play and seek a clip (Safari and iOS need
 * 206 answers with Content-Range, and refuse a clip served as one plain 200).
 * Supported: bytes=a-b, bytes=a-, bytes=-n. Several ranges or a malformed header are ignored and answered in full (allowed by RFC 9110).
 * A start past the end is 416. The object is streamed (R2 ranged get); a clip is never held whole in Worker memory.
 */

export type ByteRange = { start: number; end: number };

/** end is inclusive. "full" means serve everything; "unsatisfiable" is a 416. */
export function parseByteRange(header: string | null, size: number): ByteRange | "full" | "unsatisfiable" {
  if (!header) return "full";
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return "full";
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return "full";
  if (size <= 0) return "unsatisfiable";
  if (first === "") {
    const suffix = Number(last);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (!Number.isSafeInteger(start) || start >= size) return "unsatisfiable";
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (!Number.isSafeInteger(end) || end < start) return "full";
  return { start, end };
}

/** Headers every clip answer carries. Callers add their own security headers on top. */
export function videoHeaders(contentType: string, base?: HeadersInit): Headers {
  const headers = new Headers(base);
  headers.set("content-type", contentType);
  headers.set("accept-ranges", "bytes");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  // Not "no-store": Safari and iOS read a clip in several ranged requests. Private, and checked again on every use.
  headers.set("cache-control", "private, no-cache");
  return headers;
}

export async function objectResponse(input: {
  store: ObjectStore;
  key: string;
  contentType: string;
  request: Request;
  headers?: HeadersInit;
}): Promise<Response> {
  const headers = videoHeaders(input.contentType, input.headers);
  const stat = await input.store.stat(input.key);
  if (!stat) return new Response(null, { status: 404 });
  const size = stat.sizeBytes;
  const range = parseByteRange(input.request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const head = input.request.method === "HEAD";
  const whole = range === "full";
  const start = whole ? 0 : range.start;
  const end = whole ? size - 1 : range.end;
  const length = size === 0 ? 0 : end - start + 1;
  headers.set("content-length", String(length));
  if (!whole) headers.set("content-range", `bytes ${start}-${end}/${size}`);
  const status = whole ? 200 : 206;
  if (head || length === 0) return new Response(null, { status, headers });

  let body: ReadableStream<Uint8Array> | Uint8Array | null = null;
  if (input.store.readRange) body = await input.store.readRange(input.key, start, length);
  else if (whole && input.store.readStream) body = (await input.store.readStream(input.key))?.body ?? null;
  else {
    const bytes = await input.store.read(input.key);
    body = bytes ? bytes.subarray(start, end + 1) : null;
  }
  if (!body) return new Response(null, { status: 404 });
  return new Response(body as BodyInit, { status, headers });
}
