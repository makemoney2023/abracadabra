import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { memoryCheckDb } from "../helpers/memory-sql";

const mockCookieSet = vi.fn();
const mockCookieGet = vi.fn();
const holder: { env: CheckBindings } = { env: {} };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: holder.env }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: mockCookieSet,
    get: mockCookieGet,
  }),
}));

function unlockRequest(body: unknown, token = "tok1") {
  return new Request(`http://localhost/api/scans/${token}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function unlockRows() {
  const res = await holder.env
    .DB!.prepare("SELECT scan_id, email FROM readiness_scan_unlocks WHERE scan_id = ? ORDER BY created_at")
    .bind("scan-1")
    .all<{ scan_id: string; email: string }>();
  return res.results ?? [];
}

describe("POST /api/scans/[token]/unlock (D1)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    holder.env = { DB: memoryCheckDb() };
    await holder.env
      .DB!.prepare(
        `INSERT INTO readiness_scans (id, public_token, domain, origin, source, status, created_at)
         VALUES (?, ?, 'acme.example', 'https://acme.example', 'public', 'complete', 1)`,
      )
      .bind("scan-1", "tok1")
      .run();
  });

  it("returns 400 for invalid email and stores nothing", async () => {
    const { POST } = await import("@/app/api/scans/[token]/unlock/route");
    const res = await POST(unlockRequest({ email: "not-an-email" }), {
      params: Promise.resolve({ token: "tok1" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid/i);
    expect(await unlockRows()).toEqual([]);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("@/app/api/scans/[token]/unlock/route");
    const res = await POST(unlockRequest({}), { params: Promise.resolve({ token: "tok1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown scan", async () => {
    const { POST } = await import("@/app/api/scans/[token]/unlock/route");
    const res = await POST(unlockRequest({ email: "a@acme.example" }, "nope"), {
      params: Promise.resolve({ token: "nope" }),
    });
    expect(res.status).toBe(404);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("returns 503 when the scan store is not bound", async () => {
    holder.env = {};
    const { POST } = await import("@/app/api/scans/[token]/unlock/route");
    const res = await POST(unlockRequest({ email: "a@acme.example" }), {
      params: Promise.resolve({ token: "tok1" }),
    });
    expect(res.status).toBe(503);
  });

  it("records the unlock in D1, sets the cookie, and sends nothing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("@/app/api/scans/[token]/unlock/route");
    const res = await POST(unlockRequest({ email: "Ops@Acme.Example" }), {
      params: Promise.resolve({ token: "tok1" }),
    });
    vi.unstubAllGlobals();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unlocked: true });
    expect(await unlockRows()).toEqual([{ scan_id: "scan-1", email: "ops@acme.example" }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCookieSet).toHaveBeenCalledWith(
      "scan_unlock_tok1",
      "1",
      expect.objectContaining({
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      }),
    );
  });

  it("treats a repeat unlock as success without a duplicate row", async () => {
    const { POST } = await import("@/app/api/scans/[token]/unlock/route");
    for (let i = 0; i < 2; i++) {
      const res = await POST(unlockRequest({ email: "ops@acme.example" }), {
        params: Promise.resolve({ token: "tok1" }),
      });
      expect(res.status).toBe(200);
    }
    expect(await unlockRows()).toHaveLength(1);
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
