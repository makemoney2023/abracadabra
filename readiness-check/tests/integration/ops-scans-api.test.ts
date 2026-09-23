import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireOpsSession = vi.fn();
const mockLoadScanByPublicToken = vi.fn();

vi.mock("@/lib/ops/auth", () => ({
  requireOpsSession: () => mockRequireOpsSession(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/scan/supabase-repository", () => ({
  loadScanByPublicToken: (...args: unknown[]) =>
    mockLoadScanByPublicToken(...args),
}));

const sampleLoaded = {
  scan: {
    id: "scan-1",
    domain: "acme.example",
    origin: "https://acme.example",
    status: "complete" as const,
    score_total: 55,
    score_breakdown: { structuredData: 10 },
    public_token: "tok1",
  },
  pages: [
    {
      url: "https://acme.example/",
      pageType: "home",
      fetchStatus: "ok",
      hasJsonLd: false,
      schemaTypes: [] as string[],
    },
  ],
  findings: [
    {
      code: "NO_ORG_SCHEMA",
      severity: "critical",
      passed: false,
      message: "Missing Organization",
    },
  ],
};

describe("GET /api/ops/scans/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadScanByPublicToken.mockReset();
    mockLoadScanByPublicToken.mockResolvedValue(sampleLoaded);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireOpsSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });

    const { GET } = await import("@/app/api/ops/scans/[token]/route");
    const res = await GET(new Request("http://localhost/api/ops/scans/tok1"), {
      params: Promise.resolve({ token: "tok1" }),
    });

    expect(res.status).toBe(401);
    expect(mockLoadScanByPublicToken).not.toHaveBeenCalled();
  });

  it("returns full unlocked payload for ops staff", async () => {
    mockRequireOpsSession.mockResolvedValue({
      ok: true,
      user: { id: "user-1", email: "ops@example.com" },
      supabase: {},
    });

    const { GET } = await import("@/app/api/ops/scans/[token]/route");
    const res = await GET(new Request("http://localhost/api/ops/scans/tok1"), {
      params: Promise.resolve({ token: "tok1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unlocked).toBe(true);
    expect(json.pages).toHaveLength(1);
    expect(json.findings).toHaveLength(1);
    expect(json.domain).toBe("acme.example");
  });
});
