import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
  delete process.env.HANDOFF_SQLITE_PATH;
});

describe("GET /api/health", () => {
  it("reports D1 without naming any workspace", async () => {
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      database: "d1",
      ok: true,
      visible: 0,
    });
  });
});
