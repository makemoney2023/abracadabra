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

/** Local disk stands in for R2. Production without an explicit object path does not write the ephemeral disk. */
export function localObjectBytesEnabled(): boolean {
  if (process.env.HANDOFF_OBJECT_PATH) return true;
  return process.env.NODE_ENV !== "production";
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
  const root = process.env.HANDOFF_OBJECT_PATH || path.join(process.cwd(), ".data", "objects");
  return localObjectStore(root);
}
