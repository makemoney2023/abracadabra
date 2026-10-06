import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type ObjectStat = { sizeBytes: number };

export type UploadMeta = { key: string; batchId: string; fileId: string };

/** Private object metadata. Completion uses size only; bytes stay in storage. */
export type ObjectStore = {
  stat(key: string): Promise<ObjectStat | null>;
  read(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  beginUpload(key: string, batchId: string, fileId: string): Promise<string>;
  readUpload(uploadId: string): Promise<UploadMeta | null>;
  writePart(uploadId: string, partNumber: number, bytes: Uint8Array): Promise<void>;
  finishUpload(uploadId: string): Promise<void>;
};

const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
const UPLOAD_ID = /^[0-9a-f-]{36}$/;
const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type R2Upload = {
  uploadId: string;
  uploadPart(partNumber: number, value: Uint8Array): Promise<{ partNumber: number; etag: string }>;
  complete(parts: { partNumber: number; etag: string }[]): Promise<void>;
};

export type FilesBucket = {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, body: Uint8Array | string): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  createMultipartUpload(key: string): Promise<R2Upload>;
  resumeMultipartUpload(key: string, uploadId: string): R2Upload;
};

type R2Meta = UploadMeta & { r2UploadId: string };

/** Local disk stands in for R2. Production without an explicit object path does not write the ephemeral disk. */
export function localObjectBytesEnabled(): boolean {
  if (process.env.HANDOFF_OBJECT_PATH) return true;
  return process.env.NODE_ENV !== "production";
}

function boundFilesBucket(): FilesBucket | undefined {
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: { FILES?: FilesBucket } };
  };
  return holder[CLOUDFLARE_CONTEXT]?.env?.FILES;
}

/** True when bytes can be stored: a bound R2 bucket, an object path, or a non-production local disk. */
export function objectStorageEnabled(): boolean {
  if (boundFilesBucket()) return true;
  return localObjectBytesEnabled();
}

function metaKey(uploadId: string): string {
  return `.uploads/${uploadId}/meta.json`;
}

function partKey(uploadId: string, partNumber: number): string {
  return `.uploads/${uploadId}/parts/${partNumber}`;
}

async function listKeys(bucket: FilesBucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    for (const object of page.objects) keys.push(object.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

export function r2ObjectStore(bucket: FilesBucket): ObjectStore {
  async function readMeta(uploadId: string): Promise<R2Meta | null> {
    if (!UPLOAD_ID.test(uploadId)) return null;
    const object = await bucket.get(metaKey(uploadId));
    if (!object) return null;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(await object.arrayBuffer())) as Partial<R2Meta>;
      if (
        typeof parsed.key !== "string" ||
        typeof parsed.batchId !== "string" ||
        typeof parsed.fileId !== "string" ||
        typeof parsed.r2UploadId !== "string"
      ) {
        return null;
      }
      return {
        key: parsed.key,
        batchId: parsed.batchId,
        fileId: parsed.fileId,
        r2UploadId: parsed.r2UploadId,
      };
    } catch {
      return null;
    }
  }

  return {
    async stat(key) {
      if (!KEY.test(key)) return null;
      const head = await bucket.head(key);
      return head ? { sizeBytes: head.size } : null;
    },
    async read(key) {
      if (!KEY.test(key)) return null;
      const object = await bucket.get(key);
      if (!object) return null;
      return new Uint8Array(await object.arrayBuffer());
    },
    async remove(key) {
      if (!KEY.test(key)) return;
      await bucket.delete(key);
    },
    async put(key, bytes) {
      if (!KEY.test(key)) throw new Error("object key is not allowed");
      await bucket.put(key, bytes);
    },
    async beginUpload(key, batchId, fileId) {
      if (!KEY.test(key)) throw new Error("object key is not allowed");
      const uploadId = crypto.randomUUID();
      const created = await bucket.createMultipartUpload(key);
      const meta: R2Meta = { key, batchId, fileId, r2UploadId: created.uploadId };
      await bucket.put(metaKey(uploadId), JSON.stringify(meta));
      return uploadId;
    },
    async readUpload(uploadId) {
      const meta = await readMeta(uploadId);
      if (!meta) return null;
      return { key: meta.key, batchId: meta.batchId, fileId: meta.fileId };
    },
    async writePart(uploadId, partNumber, bytes) {
      if (!Number.isInteger(partNumber) || partNumber < 1) throw new Error("part number is not allowed");
      const meta = await readMeta(uploadId);
      if (!meta) throw new Error("upload is missing");
      const uploaded = await bucket.resumeMultipartUpload(meta.key, meta.r2UploadId).uploadPart(partNumber, bytes);
      await bucket.put(partKey(uploadId, partNumber), uploaded.etag);
    },
    async finishUpload(uploadId) {
      const meta = await readMeta(uploadId);
      if (!meta) throw new Error("upload is missing");
      const prefix = `.uploads/${uploadId}/parts/`;
      const numbers = (await listKeys(bucket, prefix))
        .map((key) => Number(key.slice(prefix.length)))
        .filter((value) => Number.isInteger(value) && value >= 1)
        .sort((left, right) => left - right);
      if (numbers.length === 0 || numbers.some((value, index) => value !== index + 1)) {
        throw new Error("upload is incomplete");
      }
      const parts: { partNumber: number; etag: string }[] = [];
      for (const partNumber of numbers) {
        const object = await bucket.get(partKey(uploadId, partNumber));
        if (!object) throw new Error("upload is incomplete");
        parts.push({ partNumber, etag: new TextDecoder().decode(await object.arrayBuffer()) });
      }
      await bucket.resumeMultipartUpload(meta.key, meta.r2UploadId).complete(parts);
      const sidecars = await listKeys(bucket, `.uploads/${uploadId}/`);
      if (sidecars.length > 0) await bucket.delete(sidecars);
    },
  };
}

function resolveKey(root: string, key: string): string | null {
  if (!KEY.test(key)) return null;
  const full = path.resolve(root, ...key.split("/"));
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function uploadDirectory(root: string, uploadId: string): string | null {
  if (!UPLOAD_ID.test(uploadId)) return null;
  const base = path.resolve(root, ".uploads");
  const full = path.resolve(base, uploadId);
  if (!full.startsWith(base + path.sep)) return null;
  return full;
}

export function localObjectStore(root: string): ObjectStore {
  async function readMeta(uploadId: string): Promise<UploadMeta | null> {
    const dir = uploadDirectory(root, uploadId);
    if (!dir) return null;
    try {
      const raw = await readFile(path.join(dir, "meta.json"), "utf8");
      const parsed = JSON.parse(raw) as Partial<UploadMeta>;
      if (
        typeof parsed.key !== "string" ||
        typeof parsed.batchId !== "string" ||
        typeof parsed.fileId !== "string"
      ) {
        return null;
      }
      return { key: parsed.key, batchId: parsed.batchId, fileId: parsed.fileId };
    } catch {
      return null;
    }
  }

  return {
    async stat(key) {
      const file = resolveKey(root, key);
      if (!file) return null;
      try {
        const info = await stat(file);
        if (!info.isFile()) return null;
        return { sizeBytes: info.size };
      } catch {
        return null;
      }
    },
    async read(key) {
      const file = resolveKey(root, key);
      if (!file) return null;
      try {
        return new Uint8Array(await readFile(file));
      } catch {
        return null;
      }
    },
    async remove(key) {
      const file = resolveKey(root, key);
      if (!file) return;
      await rm(file, { force: true });
    },
    async put(key, bytes) {
      const file = resolveKey(root, key);
      if (!file) throw new Error("object key is not allowed");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    },
    async beginUpload(key, batchId, fileId) {
      if (!resolveKey(root, key)) throw new Error("object key is not allowed");
      const uploadId = crypto.randomUUID();
      const dir = uploadDirectory(root, uploadId);
      if (!dir) throw new Error("upload is not allowed");
      await mkdir(dir, { recursive: true });
      const meta: UploadMeta = { key, batchId, fileId };
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
      return uploadId;
    },
    readUpload: readMeta,
    async writePart(uploadId, partNumber, bytes) {
      if (!Number.isInteger(partNumber) || partNumber < 1) throw new Error("part number is not allowed");
      const dir = uploadDirectory(root, uploadId);
      if (!dir) throw new Error("upload is not allowed");
      await writeFile(path.join(dir, String(partNumber)), bytes);
    },
    async finishUpload(uploadId) {
      const dir = uploadDirectory(root, uploadId);
      if (!dir) throw new Error("upload is not allowed");
      const meta = await readMeta(uploadId);
      if (!meta) throw new Error("upload is missing");
      const names = (await readdir(dir))
        .filter((name) => /^\d+$/.test(name))
        .map((name) => Number(name))
        .sort((left, right) => left - right);
      if (names.length === 0 || names.some((value, index) => value !== index + 1)) {
        throw new Error("upload is incomplete");
      }
      const target = resolveKey(root, meta.key);
      if (!target) throw new Error("object key is not allowed");
      await mkdir(path.dirname(target), { recursive: true });
      const handle = await open(target, "w");
      try {
        for (const partNumber of names) {
          const chunk = await readFile(path.join(dir, String(partNumber)));
          await handle.write(chunk);
        }
      } finally {
        await handle.close();
      }
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function openObjectStore(): ObjectStore {
  const bucket = boundFilesBucket();
  if (bucket) return r2ObjectStore(bucket);
  const root = process.env.HANDOFF_OBJECT_PATH || path.join(process.cwd(), ".data", "objects");
  return localObjectStore(root);
}
