import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

export type BrandingObject = {
  body: Uint8Array;
  contentType: string;
};

export type BrandingStore = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<BrandingObject | undefined>;
};

type R2Object = {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
};

type R2Bucket = {
  put(key: string, body: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
};

function brandingKey(key: string): string {
  if (!/^branding\/[0-9a-f-]{36}\.png$/.test(key)) {
    throw new Error("branding key refused");
  }
  return key;
}

function boundBucket(): R2Bucket | undefined {
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: { BRANDING?: R2Bucket } };
  };
  return holder[CLOUDFLARE_CONTEXT]?.env?.BRANDING;
}

function r2Store(bucket: R2Bucket): BrandingStore {
  return {
    async put(key, body, contentType) {
      await bucket.put(brandingKey(key), body, { httpMetadata: { contentType } });
    },
    async get(key) {
      const object = await bucket.get(brandingKey(key));
      if (!object) return undefined;
      return {
        body: new Uint8Array(await object.arrayBuffer()),
        contentType: object.httpMetadata?.contentType ?? "image/png",
      };
    },
  };
}

function fileStore(): BrandingStore {
  const root = process.env.HANDOFF_BRANDING_PATH ?? path.join(process.cwd(), ".data", "branding");
  return {
    async put(key, body, contentType) {
      const file = path.join(/*turbopackIgnore: true*/ root, brandingKey(key));
      await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ file, body);
      await writeFile(/*turbopackIgnore: true*/ `${file}.type`, contentType);
    },
    async get(key) {
      const file = path.join(/*turbopackIgnore: true*/ root, brandingKey(key));
      try {
        const [body, contentType] = await Promise.all([
          readFile(/*turbopackIgnore: true*/ file),
          readFile(/*turbopackIgnore: true*/ `${file}.type`, "utf8"),
        ]);
        return { body: new Uint8Array(body), contentType };
      } catch {
        return undefined;
      }
    },
  };
}

/** Prefer an R2 `BRANDING` binding. Local runs keep logos under `.data/branding`. */
export function openBranding(): BrandingStore {
  const bucket = boundBucket();
  if (bucket) return r2Store(bucket);
  return fileStore();
}
