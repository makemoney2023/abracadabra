/** Small stand-ins for clips in tests: the first bytes of a real MP4, MOV or WebM, then a repeating pattern. Not for production code. */
export function fakeClip(kind: "mp4" | "mov" | "webm", size = 2048): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
  if (kind === "webm") bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  else bytes.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, ...(kind === "mov" ? [0x71, 0x74, 0x20, 0x20] : [0x69, 0x73, 0x6f, 0x6d])], 0);
  return bytes;
}

export function dataUrl(type: string, bytes: Uint8Array): string {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}
