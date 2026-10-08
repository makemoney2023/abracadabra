import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSend = vi.fn();

vi.mock("@/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => mockSend(...args) },
}));

describe("POST /api/ops/prospect", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue(undefined);
  });

  it("starts prospecting without a login", async () => {
    const { POST } = await import("@/app/api/ops/prospect/route");
    const response = await POST(
      new Request("http://localhost/api/ops/prospect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: "Check https://acme.example today." }),
      }),
    );
    expect(response.status).toBe(202);
    expect(mockSend).toHaveBeenCalledWith({
      name: "prospect/requested",
      data: { objective: "Check https://acme.example today." },
    });
  });
});
