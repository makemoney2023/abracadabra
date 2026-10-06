import { afterEach, describe, expect, it } from "vitest";
import { objectStorageEnabled, openObjectStore, r2ObjectStore, type FilesBucket } from "./objects";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
const KEY = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333";

function memoryBucket(): FilesBucket & { keys(prefix: string): Promise<string[]> } {
  const objects = new Map<string, Uint8Array>();
  const uploads = new Map<string, { key: string; parts: Map<number, Uint8Array> }>();
  const bucket: FilesBucket & { keys(prefix: string): Promise<string[]> } = {
    async head(key) {
      const bytes = objects.get(key);
      return bytes ? { size: bytes.byteLength } : null;
    },
    async get(key) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      const copy = new Uint8Array(bytes);
      return { arrayBuffer: async () => copy.buffer };
    },
    async put(key, body) {
      const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
      objects.set(key, new Uint8Array(bytes));
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
    async list(options) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(options.prefix)).sort();
      const start = options.cursor ? Number(options.cursor) : 0;
      const page = keys.slice(start, start + 1);
      const next = start + page.length;
      return {
        objects: page.map((key) => ({ key })),
        truncated: next < keys.length,
        cursor: next < keys.length ? String(next) : undefined,
      };
    },
    async createMultipartUpload(key) {
      const uploadId = `r2-${crypto.randomUUID()}`;
      uploads.set(uploadId, { key, parts: new Map() });
      return bucket.resumeMultipartUpload(key, uploadId);
    },
    resumeMultipartUpload(key, uploadId) {
      return {
        uploadId,
        async uploadPart(partNumber, value) {
          const upload = uploads.get(uploadId);
          if (!upload || upload.key !== key) throw new Error("missing upload");
          upload.parts.set(partNumber, new Uint8Array(value));
          return { partNumber, etag: `etag-${partNumber}` };
        },
        async complete(parts) {
          const upload = uploads.get(uploadId);
          if (!upload || upload.key !== key) throw new Error("missing upload");
          const ordered = [...parts].sort((left, right) => left.partNumber - right.partNumber);
          const chunks = ordered.map((part) => {
            const bytes = upload.parts.get(part.partNumber);
            if (!bytes || part.etag !== `etag-${part.partNumber}`) throw new Error("missing part");
            return bytes;
          });
          const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
          const body = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
          }
          objects.set(key, body);
          uploads.delete(uploadId);
        },
      };
    },
    async keys(prefix) {
      return [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
  return bucket;
}

describe("r2ObjectStore", () => {
  it("keeps a public upload id and joins parts in order", async () => {
    const bucket = memoryBucket();
    const store = r2ObjectStore(bucket);
    const uploadId = await store.beginUpload(KEY, "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333");
    expect(uploadId).toMatch(/^[0-9a-f-]{36}$/);
    const meta = await store.readUpload(uploadId);
    expect(meta).toEqual({
      key: KEY,
      batchId: "22222222-2222-4222-8222-222222222222",
      fileId: "33333333-3333-4333-8333-333333333333",
    });
    await store.writePart(uploadId, 2, new Uint8Array([9]));
    await store.writePart(uploadId, 1, new Uint8Array([7, 8]));
    await store.finishUpload(uploadId);
    expect(await store.stat(KEY)).toEqual({ sizeBytes: 3 });
    expect(await store.read(KEY)).toEqual(new Uint8Array([7, 8, 9]));
    expect(await bucket.keys(".uploads/")).toEqual([]);
    await store.remove(KEY);
    expect(await store.stat(KEY)).toBeNull();
  });

  it("refuses to finish an upload that has no parts", async () => {
    const store = r2ObjectStore(memoryBucket());
    const uploadId = await store.beginUpload(KEY, "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333");
    await expect(store.finishUpload(uploadId)).rejects.toThrow(/incomplete/);
  });

  it("refuses an object key that is not three ids", async () => {
    const store = r2ObjectStore(memoryBucket());
    await expect(store.beginUpload("../secret", "b", "f")).rejects.toThrow(/not allowed/);
    expect(await store.readUpload("not-an-upload")).toBeNull();
  });
});

describe("objectStorageEnabled", () => {
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    const env = process.env as Record<string, string | undefined>;
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    delete process.env.HANDOFF_OBJECT_PATH;
    delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
  });

  it("is off in production until a file bucket or object path exists", () => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    delete process.env.HANDOFF_OBJECT_PATH;
    expect(objectStorageEnabled()).toBe(false);
  });

  it("uses the bound file bucket in production", async () => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    delete process.env.HANDOFF_OBJECT_PATH;
    const bucket = memoryBucket();
    (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = { env: { FILES: bucket } };
    expect(objectStorageEnabled()).toBe(true);
    await openObjectStore().put(KEY, new Uint8Array([4]));
    expect(await openObjectStore().read(KEY)).toEqual(new Uint8Array([4]));
  });
});
