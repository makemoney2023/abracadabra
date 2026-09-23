import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireOpsSession = vi.fn();
const mockFrom = vi.fn();
const mockInngestSend = vi.fn();

vi.mock("@/lib/ops/auth", () => ({
  requireOpsSession: () => mockRequireOpsSession(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}));

describe("ops queue APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockInngestSend.mockResolvedValue(undefined);
  });

  it("GET /api/ops/queue returns 401 when unauthenticated", async () => {
    mockRequireOpsSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });

    const { GET } = await import("@/app/api/ops/queue/route");
    const res = await GET(new Request("http://localhost/api/ops/queue"));
    expect(res.status).toBe(401);
  });

  it("PATCH /api/ops/queue/[id] updates status and writes audit", async () => {
    mockRequireOpsSession.mockResolvedValue({
      ok: true,
      user: { id: "user-1", email: "ops@example.com" },
      supabase: {},
    });

    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "q1", status: "new" },
      error: null,
    });
    const eqLookup = vi.fn(() => ({ maybeSingle }));
    const selectLookup = vi.fn(() => ({ eq: eqLookup }));

    const singleUpdate = vi.fn().mockResolvedValue({
      data: {
        id: "q1",
        status: "contacted",
        notes: "hi",
        status_changed_at: "2026-08-11T12:00:00Z",
      },
      error: null,
    });
    const selectUpdate = vi.fn(() => ({ single: singleUpdate }));
    const eqUpdate = vi.fn(() => ({ select: selectUpdate }));
    const update = vi.fn(() => ({ eq: eqUpdate }));

    const insertAudit = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "ops_queue") {
        return { select: selectLookup, update };
      }
      if (table === "ops_status_audit") {
        return { insert: insertAudit };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { PATCH } = await import("@/app/api/ops/queue/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/ops/queue/q1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "contacted", notes: "hi" }),
      }),
      { params: Promise.resolve({ id: "q1" }) },
    );

    expect(res.status).toBe(200);
    expect(insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        ops_queue_id: "q1",
        from_status: "new",
        to_status: "contacted",
        changed_by: "user-1",
      }),
    );
  });

  it("POST /api/ops/rescan creates ops scan and enqueues Inngest", async () => {
    mockRequireOpsSession.mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
      supabase: {},
    });

    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        domain: "acme.example",
        website: "https://acme.example",
      },
      error: null,
    });
    const eqLead = vi.fn(() => ({ maybeSingle }));
    const selectLead = vi.fn(() => ({ eq: eqLead }));

    const singleScan = vi.fn().mockResolvedValue({
      data: { id: "scan-1", status: "queued", public_token: "tok123" },
      error: null,
    });
    const selectScan = vi.fn(() => ({ single: singleScan }));
    const insertScan = vi.fn(() => ({ select: selectScan }));

    const eqQueue = vi.fn().mockResolvedValue({ error: null });
    const updateQueue = vi.fn(() => ({ eq: eqQueue }));

    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") return { select: selectLead };
      if (table === "scans") return { insert: insertScan };
      if (table === "ops_queue") return { update: updateQueue };
      throw new Error(`unexpected table ${table}`);
    });

    const { POST } = await import("@/app/api/ops/rescan/route");
    const res = await POST(
      new Request("http://localhost/api/ops/rescan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("scan-1");
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "scan/requested",
      data: { scanId: "scan-1" },
    });
  });
});
