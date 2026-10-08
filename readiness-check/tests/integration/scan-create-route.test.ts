import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { memoryCheckDb } from "../helpers/memory-sql";

const holder: { env: CheckBindings } = { env: {} };
const mockSend = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: holder.env }),
}));

describe("POST /api/scans", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue(undefined);
    holder.env = {
      DB: memoryCheckDb(),
      SCAN_JOBS: { send: (...args: unknown[]) => mockSend(...args) },
    };
  });

  it("queues a public URL scan in D1 without Supabase", async () => {
    const { POST } = await import("@/app/api/scans/route");
    const response = await POST(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://acme.example" }),
      }),
    );
    expect(response.status).toBe(201);
    const json = (await response.json()) as { token: string; status: string };
    expect(json.status).toBe("queued");
    expect(json.token.length).toBeGreaterThan(8);
    expect(mockSend).toHaveBeenCalledWith({ type: "scan", scanId: expect.any(String) });
    const row = await holder.env.DB!.prepare("SELECT domain, source FROM readiness_scans WHERE public_token = ?")
      .bind(json.token)
      .first<{ domain: string; source: string }>();
    expect(row).toEqual({ domain: "acme.example", source: "public" });
  });
});
