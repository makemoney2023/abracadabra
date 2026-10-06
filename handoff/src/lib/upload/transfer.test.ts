import { describe, expect, it } from "vitest";
import { mapPool, partRanges, sendParts } from "./transfer";

describe("partRanges", () => {
  it("splits a file into 6 MiB parts and keeps a short last part", () => {
    const partSize = 6;
    expect(partRanges(13, partSize)).toEqual([
      { partNumber: 1, start: 0, end: 6 },
      { partNumber: 2, start: 6, end: 12 },
      { partNumber: 3, start: 12, end: 13 },
    ]);
    expect(partRanges(12, partSize)).toEqual([
      { partNumber: 1, start: 0, end: 6 },
      { partNumber: 2, start: 6, end: 12 },
    ]);
  });
});

describe("sendParts", () => {
  it("sends at most three parts at once and retries only the failed part", async () => {
    const ranges = partRanges(9, 1);
    let inFlight = 0;
    let maxInFlight = 0;
    const attempts = new Map<number, number>();
    await sendParts({
      ranges,
      read: (start, end) => Uint8Array.from({ length: end - start }, (_, index) => start + index),
      concurrency: 3,
      send: async (partNumber) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        const count = (attempts.get(partNumber) ?? 0) + 1;
        attempts.set(partNumber, count);
        if (partNumber === 2 && count === 1) throw new Error("part failed");
      },
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBe(3);
    expect(attempts.get(1)).toBe(1);
    expect(attempts.get(2)).toBe(2);
    expect(attempts.get(9)).toBe(1);
  });
});

describe("mapPool", () => {
  it("runs at most three files at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapPool([1, 2, 3, 4, 5], 3, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });
    expect(maxInFlight).toBe(3);
  });
});
