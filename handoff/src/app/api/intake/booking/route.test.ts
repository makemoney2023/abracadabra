import { afterEach, describe, expect, it } from "vitest";
import { signIntakeBody } from "@/lib/intake/sign";
import { POST } from "./route";

const SECRET = "intake-test-secret";
const NOW = 1_700_000_000_000;
const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
  delete process.env.INTAKE_SIGNING_SECRET;
});

describe("POST /api/intake/booking", () => {
  it("returns 202 and puts the booking on the lead-intake queue", async () => {
    const sent: unknown[] = [];
    process.env.INTAKE_SIGNING_SECRET = SECRET;
    (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = {
      env: {
        LEAD_INTAKE: {
          send: async (body: unknown) => {
            sent.push(body);
          },
        },
      },
    };
    const body = JSON.stringify({
      external_id: "cal-1",
      email: "ada@northwind.example",
      starts_at: NOW + 1000,
      kind: "created",
    });
    const signature = await signIntakeBody(SECRET, body);
    const response = await POST(
      new Request("https://handoff.example/api/intake/booking", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intake-signature": signature,
          "x-intake-timestamp": String(Date.now()),
        },
        body,
      }),
    );
    expect(response.status).toBe(202);
    expect(sent).toEqual([
      {
        source: "booking",
        payload: {
          external_id: "cal-1",
          email: "ada@northwind.example",
          starts_at: NOW + 1000,
          kind: "created",
        },
      },
    ]);
  });
});
