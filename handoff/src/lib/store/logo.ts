import { decode as decodePng, encode as encodePng } from "fast-png";
import { LIMITS } from "@/lib/policy/limits";

const PNG = [0x89, 0x50, 0x4e, 0x47] as const;

type Decoded = {
  width: number;
  height: number;
  data: Uint8Array;
  channels: 1 | 2 | 3 | 4;
  depth: 8 | 16;
};

type WebpDecode = (buffer: ArrayBuffer) => Promise<ImageData>;

let webpDecode: Promise<WebpDecode> | undefined;

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((value, index) => bytes[index] === value);
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function asChannels(value: number | undefined): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return 4;
}

function encodeClean(image: Decoded): Uint8Array {
  return encodePng({
    width: image.width,
    height: image.height,
    data: image.data,
    channels: image.channels,
    depth: image.depth,
  });
}

function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return copy as ArrayBuffer;
}

async function decodeWebp(bytes: Uint8Array): Promise<Decoded> {
  webpDecode ??= loadWebp().catch((error: unknown): never => {
    webpDecode = undefined;
    throw error;
  });
  const decode = await webpDecode;
  const image = await decode(arrayBufferOf(bytes));
  return {
    width: image.width,
    height: image.height,
    data: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    channels: 4,
    depth: 8,
  };
}

async function loadWebp(): Promise<WebpDecode> {
  const [{ default: decode, init }, { readFile }, path] = await Promise.all([
    import("@jsquash/webp/decode.js"),
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const wasmPath = path.join(process.cwd(), "node_modules/@jsquash/webp/codec/dec/webp_dec.wasm");
  const wasm = await readFile(/*turbopackIgnore: true*/ wasmPath);
  const start = init as (
    module?: WebAssembly.Module,
    options?: { wasmBinary?: ArrayBuffer },
  ) => Promise<void>;
  await start(undefined, { wasmBinary: arrayBufferOf(wasm) });
  return decode;
}

/** Decode a PNG or WebP logo and return a fresh PNG. Extra bytes after the image are dropped. */
export async function reencodeLogo(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (bytes.byteLength === 0 || bytes.byteLength > LIMITS.logoMaxBytes) return undefined;
  try {
    if (startsWith(bytes, PNG)) {
      const image = decodePng(bytes);
      return encodeClean({
        width: image.width,
        height: image.height,
        data: image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data),
        channels: asChannels(image.channels),
        depth: image.depth === 16 ? 16 : 8,
      });
    }
    if (isWebp(bytes)) {
      return encodeClean(await decodeWebp(bytes));
    }
  } catch {
    return undefined;
  }
  return undefined;
}
