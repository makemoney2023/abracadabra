import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type ObjectStat = { sizeBytes: number };

/** Private object metadata. Completion uses size only; bytes stay in storage. */
export type ObjectStore = {
  stat(key: string): Promise<ObjectStat | null>;
  remove(key: string): Promise<void>;
  put(key: string, bytes: Uint8Array): Promise<void>;
};

const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

function resolveKey(root: string, key: string): string | null {
  if (!KEY.test(key)) return null;
  const full = path.resolve(root, ...key.split("/"));
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

export function localObjectStore(root: string): ObjectStore {
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
  };
}

export function openObjectStore(): ObjectStore {
  const root = process.env.HANDOFF_OBJECT_PATH || path.join(process.cwd(), ".data", "objects");
  return localObjectStore(root);
}
