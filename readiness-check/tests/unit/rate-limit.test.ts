import { describe, expect, it, vi } from "vitest";
import { countRecentPublicScans } from "@/lib/rate-limit";

type QueryResult = { count: number | null; error: { message: string } | null };

function createMockClient(result: QueryResult) {
  const gte = vi.fn().mockResolvedValue(result);
  const eqSource = vi.fn(() => ({ gte }));
  const eqDomain = vi.fn(() => ({ eq: eqSource }));
  const select = vi.fn(() => ({ eq: eqDomain }));
  const from = vi.fn(() => ({ select }));
  return { from, _chain: { select, eqDomain, eqSource, gte } };
}

describe("countRecentPublicScans", () => {
  it("allows when fewer than 3 public scans in 24h", async () => {
    const client = createMockClient({ count: 2, error: null });
    const result = await countRecentPublicScans("example.com", client as never);
    expect(result).toEqual({ allowed: true, count: 2 });
    expect(client.from).toHaveBeenCalledWith("scans");
  });

  it("blocks when count is 3 or more", async () => {
    const client = createMockClient({ count: 3, error: null });
    const result = await countRecentPublicScans("example.com", client as never);
    expect(result).toEqual({ allowed: false, count: 3 });
  });

  it("treats null count as zero", async () => {
    const client = createMockClient({ count: null, error: null });
    const result = await countRecentPublicScans("example.com", client as never);
    expect(result).toEqual({ allowed: true, count: 0 });
  });

  it("throws when supabase returns an error", async () => {
    const client = createMockClient({ count: null, error: { message: "boom" } });
    await expect(countRecentPublicScans("example.com", client as never)).rejects.toThrow(
      /boom|rate limit/i,
    );
  });
});
