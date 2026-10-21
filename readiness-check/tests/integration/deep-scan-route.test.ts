import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { memoryCheckDb } from "../helpers/memory-sql";

const holder: { env: CheckBindings } = { env: {} };
const mockSend = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: holder.env }),
}));

const TOKEN = "test-internal-token";

function post(body: unknown, token = TOKEN) {
  return new Request("http://localhost/api/internal/deep-scans", {
    method: "POST",
    headers: { "content-type": "application/json", "x-job-token": token },
    body: JSON.stringify(body),
  });
}

describe("POST /api/internal/deep-scans", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue(undefined);
    holder.env = {
      DB: memoryCheckDb(),
      SCAN_JOBS: { send: (...args: unknown[]) => mockSend(...args) },
      CLOUDFLARE_API_TOKEN: TOKEN,
    };
  });

  it("needs the internal token", async () => {
    const { POST } = await import("@/app/api/internal/deep-scans/route");
    const response = await POST(post({ url: "acme.example", tier: "deep-200" }, "wrong-token-value-xx"));
    expect(response.status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses a deep scan while DEEP_SCAN_ENABLED is off (the default)", async () => {
    const { POST } = await import("@/app/api/internal/deep-scans/route");
    const response = await POST(post({ url: "acme.example", tier: "deep-1000" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "deep_scan_disabled" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("queues a deep scan with its page limit when the flag is on", async () => {
    holder.env.DEEP_SCAN_ENABLED = "1";
    const { POST } = await import("@/app/api/internal/deep-scans/route");
    const response = await POST(post({ url: "https://acme.example", tier: "deep-1000" }));
    expect(response.status).toBe(201);
    const json = (await response.json()) as { id: string; tier: string; pageLimit: number };
    expect(json).toMatchObject({ tier: "deep-1000", pageLimit: 1000 });
    expect(mockSend).toHaveBeenCalledWith({ type: "scan", scanId: json.id });
    const run = await holder.env.DB!.prepare("SELECT tier, page_limit FROM readiness_scan_runs WHERE scan_id = ?")
      .bind(json.id)
      .first();
    expect(run).toEqual({ tier: "deep-1000", page_limit: 1000 });
  });

  it("the public scan endpoint ignores any tier and stays a free scan", async () => {
    holder.env.DEEP_SCAN_ENABLED = "1";
    const { POST } = await import("@/app/api/scans/route");
    const response = await POST(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://acme.example", tier: "deep-1000" }),
      }),
    );
    expect(response.status).toBe(201);
    const json = (await response.json()) as { id: string };
    const run = await holder.env.DB!.prepare("SELECT COUNT(*) AS n FROM readiness_scan_runs WHERE scan_id = ?")
      .bind(json.id)
      .first<{ n: number }>();
    expect(run?.n).toBe(0); // planned as free when the job runs
  });
});
