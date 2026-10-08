import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSend = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: { SCAN_JOBS: { send: (...args: unknown[]) => mockSend(...args) } },
  }),
}));

describe("POST /api/ops/prospect", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue(undefined);
  });

  it("starts prospecting on the Cloudflare queue without a login", async () => {
    const { POST } = await import("@/app/api/ops/prospect/route");
    const response = await POST(
      new Request("http://localhost/api/ops/prospect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: "Check https://acme.example today." }),
      }),
    );
    expect(response.status).toBe(202);
    const json = (await response.json()) as { accepted?: boolean; error?: string };
    expect(json.accepted).toBe(true);
    expect(mockSend).toHaveBeenCalledWith({
      type: "prospect",
      objective: "Check https://acme.example today.",
    });
  });
});
