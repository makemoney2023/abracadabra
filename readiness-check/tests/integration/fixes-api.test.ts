import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadScan = vi.fn();

vi.mock("@/lib/scan/supabase-repository", () => ({
  loadScanByPublicToken: (...args: unknown[]) => mockLoadScan(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

const completeScan = {
  scan: {
    id: "s1",
    domain: "cambridgechamber.com",
    origin: "https://cambridgechamber.com",
    status: "complete",
    score_total: 28,
    score_breakdown: {},
    public_token: "tok",
  },
  pages: [
    {
      url: "https://cambridgechamber.com/",
      pageType: "home",
      fetchStatus: "ok",
      hasJsonLd: false,
      schemaTypes: [],
    },
    {
      url: "https://cambridgechamber.com/about",
      pageType: "about",
      fetchStatus: "ok",
      hasJsonLd: false,
      schemaTypes: [],
    },
  ],
  findings: [
    {
      code: "NO_JSON_LD_HOME",
      severity: "critical",
      passed: false,
      message: "Home page is missing JSON-LD structured data.",
    },
    {
      code: "SITEMAP_MISSING",
      severity: "warn",
      passed: false,
      message: "sitemap.xml is missing.",
    },
  ],
};

describe("/api/scans/[token]/fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadScan.mockReset();
  });

  it("GET returns selectable options without unlock cookie", async () => {
    mockLoadScan.mockResolvedValue(completeScan);

    const { GET } = await import("@/app/api/scans/[token]/fixes/route");
    const res = await GET(new Request("http://localhost/api/scans/tok/fixes"), {
      params: Promise.resolve({ token: "tok" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.defaultSelection.sitemapXml).toBe(true);
    expect(json.defaultSelection.pageUrls).toContain("https://cambridgechamber.com/");
    expect(json.defaultSelection.pageUrls).toContain("https://cambridgechamber.com/about");
    expect(json.options.some((o: { id: string }) => o.id === "sitemapXml")).toBe(true);
  });

  it("GET returns 409 when scan is not complete", async () => {
    mockLoadScan.mockResolvedValue({
      ...completeScan,
      scan: { ...completeScan.scan, status: "running" },
    });

    const { GET } = await import("@/app/api/scans/[token]/fixes/route");
    const res = await GET(new Request("http://localhost/api/scans/tok/fixes"), {
      params: Promise.resolve({ token: "tok" }),
    });
    expect(res.status).toBe(409);
  });

  it("POST returns zip for the user's selection without unlock", async () => {
    mockLoadScan.mockResolvedValue(completeScan);

    const { POST } = await import("@/app/api/scans/[token]/fixes/route");
    const res = await POST(
      new Request("http://localhost/api/scans/tok/fixes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sitemapXml: true,
          pageUrls: ["https://cambridgechamber.com/about"],
          format: "zip",
        }),
      }),
      { params: Promise.resolve({ token: "tok" }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("POST returns json for selected files only", async () => {
    mockLoadScan.mockResolvedValue(completeScan);

    const { POST } = await import("@/app/api/scans/[token]/fixes/route");
    const res = await POST(
      new Request("http://localhost/api/scans/tok/fixes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sitemapXml: false,
          pageUrls: ["https://cambridgechamber.com/about"],
          format: "json",
        }),
      }),
      { params: Promise.resolve({ token: "tok" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.files.some((f: { path: string }) => f.path.includes("about"))).toBe(true);
    expect(json.files.some((f: { path: string }) => f.path === "sitemap.xml")).toBe(false);
    expect(json.selection.pageUrls).toEqual(["https://cambridgechamber.com/about"]);
    expect(
      json.files.every((f: { content: string }) => !f.content.includes("TODO_")),
    ).toBe(true);
  });

  it("POST returns 422 when FAQ is selected without Q&A pairs", async () => {
    mockLoadScan.mockResolvedValue({
      ...completeScan,
      findings: [
        ...completeScan.findings,
        {
          code: "MISSING_FAQ_SCHEMA",
          severity: "warn",
          passed: false,
          message: "No FAQ schema",
        },
      ],
    });

    const { POST } = await import("@/app/api/scans/[token]/fixes/route");
    const res = await POST(
      new Request("http://localhost/api/scans/tok/fixes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          faqJsonLd: true,
          pageUrls: [],
          format: "json",
        }),
      }),
      { params: Promise.resolve({ token: "tok" }) },
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.requiredFields.some((f: { id: string }) => f.id === "faqPairs")).toBe(true);
  });
});
