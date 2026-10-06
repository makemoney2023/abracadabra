import { describe, expect, it } from "vitest";
import { clock } from "./clock";

describe("clock", () => {
  it("returns the current time in milliseconds", () => {
    const before = Date.now();
    const value = clock();
    const after = Date.now();
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  it("moves forward across two reads", () => {
    const first = clock();
    const second = clock();
    expect(second).toBeGreaterThanOrEqual(first);
  });
});
