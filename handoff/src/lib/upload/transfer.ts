export type PartRange = { partNumber: number; start: number; end: number };

/** R2 parts are 6 MiB except the last part, which may be shorter. */
export function partRanges(sizeBytes: number, partSize: number): PartRange[] {
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || !Number.isInteger(partSize) || partSize < 1) {
    return [];
  }
  const ranges: PartRange[] = [];
  let start = 0;
  let partNumber = 1;
  while (start < sizeBytes) {
    const end = Math.min(start + partSize, sizeBytes);
    ranges.push({ partNumber, start, end });
    start = end;
    partNumber += 1;
  }
  return ranges;
}

/** At most `concurrency` workers run. The index increment happens before the first await. */
export async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const width = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) await worker(item);
    }
  }
  await Promise.all(Array.from({ length: width }, () => run()));
}

/** A failed part is sent again. Parts that already succeeded are not sent again. */
export async function sendParts(input: {
  ranges: readonly PartRange[];
  read: (start: number, end: number) => Uint8Array | Promise<Uint8Array>;
  concurrency: number;
  send: (partNumber: number, body: Uint8Array) => Promise<void>;
}): Promise<void> {
  await mapPool(input.ranges, input.concurrency, async (range) => {
    const body = await input.read(range.start, range.end);
    let attempt = 0;
    while (attempt < 3) {
      attempt += 1;
      try {
        await input.send(range.partNumber, body);
        return;
      } catch (error) {
        if (attempt >= 3) throw error;
      }
    }
  });
}
