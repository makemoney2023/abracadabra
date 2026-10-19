import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/booking/route";

const CAL = "cal-test-secret";

function calRequest(body: unknown, secret = CAL) {
  const raw = JSON.stringify(body);
  return new Request("https://check.example/api/webhooks/booking", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cal-signature-256": createHmac("sha256", secret).update(raw).digest("hex") },
    body: raw,
  });
}

const booking = {
  triggerEvent: "BOOKING_CREATED",
  payload: { uid: "bk-1", startTime: "2026-11-02T15:00:00Z", endTime: "2026-11-02T15:30:00Z", attendees: [{ email: "ada@acme.example", name: "Ada" }] },
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ["CAL_WEBHOOK_SECRET", "HANDOFF_INTAKE_ORIGIN", "INTAKE_SIGNING_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    delete process.env[key];
  }
});

describe("Cal.com booking webhook on Cloudflare (no Supabase)", () => {
  it("rejects a bad signature and answers a PING without storing anything", async () => {
    process.env.CAL_WEBHOOK_SECRET = CAL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(calRequest(booking, "wrong"))).status).toBe(401);
    const ping = await POST(calRequest({ triggerEvent: "PING", payload: {} }));
    expect(ping.status).toBe(200);
    expect(await ping.json()).toEqual({ ok: true, ignored: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a booking to HQ's signed booking intake", async () => {
    process.env.CAL_WEBHOOK_SECRET = CAL;
    process.env.HANDOFF_INTAKE_ORIGIN = "https://handoff.example";
    process.env.INTAKE_SIGNING_SECRET = "intake-secret";
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(calRequest(booking));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, forwarded: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://handoff.example/api/intake/booking");
    expect(JSON.parse(String(init.body))).toMatchObject({ external_id: "bk-1", email: "ada@acme.example", kind: "created" });
    const headers = init.headers as Record<string, string>;
    expect(headers["x-intake-signature"]).toBe(createHmac("sha256", "intake-secret").update(String(init.body)).digest("hex"));
  });

  it("asks Cal.com to retry when nothing can store the booking", async () => {
    process.env.CAL_WEBHOOK_SECRET = CAL;
    expect((await POST(calRequest(booking))).status).toBe(503);
  });

  it("returns 500 when HQ refuses, so Cal.com retries", async () => {
    process.env.CAL_WEBHOOK_SECRET = CAL;
    process.env.HANDOFF_INTAKE_ORIGIN = "https://handoff.example";
    process.env.INTAKE_SIGNING_SECRET = "intake-secret";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    expect((await POST(calRequest(booking))).status).toBe(500);
  });
});
