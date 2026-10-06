import { describe, expect, it } from "vitest";
import { passwordsMatch, signOpsCookie, verifyOpsCookie } from "@/lib/ops/session";

const PASSWORD = "ops-secret";
const NOW = Date.parse("2026-10-06T12:00:00.000Z");

describe("ops session cookie", () => {
  it("accepts a cookie signed with the same password", async () => {
    const token = await signOpsCookie(PASSWORD, NOW);
    await expect(verifyOpsCookie(token, PASSWORD, NOW + 1000)).resolves.toBe(true);
  });

  it("rejects an expired cookie", async () => {
    const token = await signOpsCookie(PASSWORD, NOW);
    const later = NOW + 8 * 24 * 60 * 60 * 1000;
    await expect(verifyOpsCookie(token, PASSWORD, later)).resolves.toBe(false);
  });

  it("rejects a cookie signed with a different password", async () => {
    const token = await signOpsCookie(PASSWORD, NOW);
    await expect(verifyOpsCookie(token, "other-secret", NOW + 1000)).resolves.toBe(false);
    await expect(verifyOpsCookie(undefined, PASSWORD, NOW)).resolves.toBe(false);
    await expect(verifyOpsCookie(token, "", NOW)).resolves.toBe(false);
  });

  it("compares passwords without caring which string is longer", async () => {
    await expect(passwordsMatch("short", "short")).resolves.toBe(true);
    await expect(passwordsMatch("short", "much-longer-secret")).resolves.toBe(false);
  });
});
