import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();
const mockCookieGet = vi.fn();
const mockCookieSet = vi.fn();
const mockLoadScanByPublicToken = vi.fn();
const mockRenderToBuffer = vi.fn();
const mockBuildReportProps = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockCookieGet,
    set: mockCookieSet,
  }),
}));

vi.mock("@/lib/scan/supabase-repository", () => ({
  loadScanByPublicToken: (...args: unknown[]) =>
    mockLoadScanByPublicToken(...args),
}));

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: (...args: unknown[]) => mockRenderToBuffer(...args),
}));

vi.mock("@/lib/pdf/report", () => ({
  buildReportProps: (...args: unknown[]) => mockBuildReportProps(...args),
  ScanReportDocument: () => null,
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

describe("public soft-gate bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCookieGet.mockReset();
    mockCookieSet.mockReset();
    mockLoadScanByPublicToken.mockReset();
    mockRenderToBuffer.mockReset();
    mockLoadScanByPublicToken.mockResolvedValue(sampleLoaded);
    mockRenderToBuffer.mockResolvedValue(Buffer.from("%PDF-1.4"));
    mockBuildReportProps.mockReturnValue({
      domain: "acme.example",
      scoreTotal: 55,
      scoreBreakdown: {},
      pages: [],
      findings: [],
    });
  });

  it("GET /api/scans/[token] ignores ?unlocked=1 without cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const { GET } = await import("@/app/api/scans/[token]/route");
    const res = await GET(
      new Request("http://localhost/api/scans/tok1?unlocked=1"),
      { params: Promise.resolve({ token: "tok1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unlocked).toBe(false);
    expect(json).not.toHaveProperty("pages");
    expect(json).not.toHaveProperty("findings");
  });

  it("GET /api/scans/[token] unlocks when httpOnly cookie is set", async () => {
    mockCookieGet.mockImplementation((name: string) =>
      name === "scan_unlock_tok1" ? { value: "1" } : undefined,
    );

    const { GET } = await import("@/app/api/scans/[token]/route");
    const res = await GET(new Request("http://localhost/api/scans/tok1"), {
      params: Promise.resolve({ token: "tok1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unlocked).toBe(true);
    expect(json.pages).toHaveLength(1);
    expect(json.findings).toHaveLength(1);
  });

  it("GET PDF rejects ?unlocked=1 without cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const { GET } = await import("@/app/api/scans/[token]/pdf/route");
    const res = await GET(
      new Request("http://localhost/api/scans/tok1/pdf?unlocked=1"),
      { params: Promise.resolve({ token: "tok1" }) },
    );

    expect(res.status).toBe(401);
    expect(mockRenderToBuffer).not.toHaveBeenCalled();
  });

  it("GET PDF succeeds with unlock cookie", async () => {
    mockCookieGet.mockImplementation((name: string) =>
      name === "scan_unlock_tok1" ? { value: "1" } : undefined,
    );

    const { GET } = await import("@/app/api/scans/[token]/pdf/route");
    const res = await GET(
      new Request("http://localhost/api/scans/tok1/pdf"),
      { params: Promise.resolve({ token: "tok1" }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(mockRenderToBuffer).toHaveBeenCalled();
  });
});
