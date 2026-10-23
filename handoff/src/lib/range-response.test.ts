import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localObjectStore, r2ObjectStore, type FilesBucket, type ObjectStore } from "@/lib/store/objects";
import { objectResponse, parseByteRange } from "./range-response";

const KEY = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333";
const BYTES = new Uint8Array(1000).map((_, index) => index % 256);

let root: string;
let store: ObjectStore;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "range-"));
  store = localObjectStore(root);
  await store.put(KEY, BYTES);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function ask(range?: string, method = "GET", target = store) {
  return objectResponse({
    store: target,
    key: KEY,
    contentType: "video/mp4",
    request: new Request("https://hq.example/clip", { method, headers: range ? { range } : {} }),
    headers: { "content-security-policy": "default-src 'none'; media-src 'self'; sandbox" },
  });
}

async function bytesOf(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

describe("parseByteRange", () => {
  it("handles closed, open and suffix ranges", () => {
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange("bytes=990-5000", 1000)).toEqual({ start: 990, end: 999 });
  });
  it("answers in full for no, several or odd ranges, and 416 past the end", () => {
    expect(parseByteRange(null, 1000)).toBe("full");
    expect(parseByteRange("bytes=0-1,5-9", 1000)).toBe("full");
    expect(parseByteRange("items=0-5", 1000)).toBe("full");
    expect(parseByteRange("bytes=9-3", 1000)).toBe("full");
    expect(parseByteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 1000)).toBe("unsatisfiable");
  });
});

describe("objectResponse", () => {
  it("serves the whole clip as 200 with the headers a browser needs", async () => {
    const response = await ask();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("1000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(response.headers.get("content-security-policy")).toContain("media-src 'self'");
    expect(await bytesOf(response)).toEqual(BYTES);
  });

  it("serves a byte range as 206 with Content-Range", async () => {
    const response = await ask("bytes=100-199");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(response.headers.get("content-length")).toBe("100");
    expect(await bytesOf(response)).toEqual(BYTES.slice(100, 200));
  });

  it("serves open-ended, suffix and first-byte probes (Safari asks for bytes=0-1 first)", async () => {
    const open = await ask("bytes=0-");
    expect(open.status).toBe(206);
    expect(open.headers.get("content-range")).toBe("bytes 0-999/1000");
    expect(await bytesOf(open)).toEqual(BYTES);
    const probe = await ask("bytes=0-1");
    expect(probe.headers.get("content-range")).toBe("bytes 0-1/1000");
    expect((await bytesOf(probe)).byteLength).toBe(2);
    const tail = await ask("bytes=-10");
    expect(tail.headers.get("content-range")).toBe("bytes 990-999/1000");
    expect(await bytesOf(tail)).toEqual(BYTES.slice(990));
  });

  it("answers 416 with the size when the range starts past the end", async () => {
    const response = await ask("bytes=5000-");
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */1000");
  });

  it("answers HEAD with headers and no body, and 404 for a missing object", async () => {
    const head = await ask(undefined, "HEAD");
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("1000");
    expect(head.body).toBeNull();
    const missing = await objectResponse({
      store,
      key: "99999999-9999-4999-8999-999999999999/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333",
      contentType: "video/mp4",
      request: new Request("https://hq.example/clip"),
    });
    expect(missing.status).toBe(404);
  });

  it("asks R2 for just the range (a seek does not load the whole clip)", async () => {
    const calls: unknown[] = [];
    const bucket = {
      async head() { return { size: 1000 }; },
      async get(_key: string, options?: { range?: { offset: number; length: number } }) {
        calls.push(options);
        const range = options?.range ?? { offset: 0, length: 1000 };
        const slice = BYTES.slice(range.offset, range.offset + range.length);
        return { arrayBuffer: async () => slice.buffer, body: new Response(slice).body!, size: 1000 };
      },
    } as unknown as FilesBucket;
    const response = await ask("bytes=200-299", "GET", r2ObjectStore(bucket));
    expect(response.status).toBe(206);
    expect(calls).toEqual([{ range: { offset: 200, length: 100 } }]);
    expect(await bytesOf(response)).toEqual(BYTES.slice(200, 300));
  });
});
