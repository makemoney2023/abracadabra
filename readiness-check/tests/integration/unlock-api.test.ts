import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();
const mockCookieSet = vi.fn();
const mockCookieGet = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: mockCookieSet,
    get: mockCookieGet,
  }),
}));

describe("POST /api/scans/[token]/unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCookieSet.mockReset();
    mockCookieGet.mockReset();
  });

  it("returns 400 for invalid email", async () => {
    const { POST } = await import("@/app/api/scans/[token]/unlock/route");
    const res = await POST(
      new Request("http://localhost/api/scans/tok1/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
      { params: Promise.resolve({ token: "tok1" }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("@/app/api/scans/[token]/unlock/route");
    const res = await POST(
      new Request("http://localhost/api/scans/tok1/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ token: "tok1" }) },
    );

    expect(res.status).toBe(400);
  });

  it("inserts unlock, sets cookie, returns unlocked true", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "scan-1", domain: "acme.example" },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const insert = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "scans") return { select };
      if (table === "scan_unlocks") return { insert };
      throw new Error(`unexpected table ${table}`);
    });

    const { POST } = await import("@/app/api/scans/[token]/unlock/route");
    const res = await POST(
      new Request("http://localhost/api/scans/tok1/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ops@acme.example" }),
      }),
      { params: Promise.resolve({ token: "tok1" }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unlocked: true });
    expect(insert).toHaveBeenCalledWith({
      scan_id: "scan-1",
      email: "ops@acme.example",
    });
    expect(mockCookieSet).toHaveBeenCalledWith(
      "scan_unlock_tok1",
      "1",
      expect.objectContaining({
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      }),
    );
  });
});

describe("opt-in lead upsert helper", () => {
  it("upserts lead, creates ops_queue when missing, links scan", async () => {
    const { applyPublicOptIn } = await import("@/lib/scan/opt-in");

    const leadUpsert = vi.fn().mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({ data: { id: "lead-1" }, error: null }),
      }),
    });
    const queueMaybe = vi.fn().mockResolvedValue({ data: null, error: null });
    const queueInsert = vi.fn().mockResolvedValue({ error: null });
    const scanUpdate = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });

    const client = {
      from: (table: string) => {
        if (table === "leads") {
          return { upsert: leadUpsert };
        }
        if (table === "ops_queue") {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: queueMaybe }),
            }),
            insert: queueInsert,
          };
        }
        if (table === "scans") {
          return { update: scanUpdate };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const result = await applyPublicOptIn(client as never, {
      scanId: "scan-1",
      domain: "acme.example",
      origin: "https://acme.example",
      email: "hello@acme.example",
      name: "Ada",
    });

    expect(result).toEqual({ leadId: "lead-1", queueCreated: true });
    expect(leadUpsert).toHaveBeenCalled();
    expect(queueInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: "lead-1",
        latest_scan_id: "scan-1",
        status: "new",
      }),
    );
    expect(scanUpdate).toHaveBeenCalledWith({ lead_id: "lead-1" });
  });
});
