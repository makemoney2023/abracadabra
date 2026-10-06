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

function bind(send: (body: unknown) => Promise<void>) {
  process.env.INTAKE_SIGNING_SECRET = SECRET;
  (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = {
    env: { LEAD_INTAKE: { send } },
  };
}

async function post(body: string, signature: string, timestamp: string): Promise<Response> {
  return POST(
    new Request("https://handoff.example/api/intake/assessment", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intake-signature": signature,
        "x-intake-timestamp": timestamp,
      },
      body,
    }),
  );
}

describe("POST /api/intake/assessment", () => {
  it("returns 202 and puts the body on the lead-intake queue", async () => {
    const sent: unknown[] = [];
    bind(async (body) => {
      sent.push(body);
    });
    const body = JSON.stringify({
      assessment_id: "asm-1",
      email: "ada@northwind.example",
      domain: "northwind.example",
    });
    const signature = await signIntakeBody(SECRET, body);
    const response = await post(body, signature, String(Date.now()));
    expect(response.status).toBe(202);
    expect(sent).toEqual([
      {
        source: "assessment",
        payload: {
          assessment_id: "asm-1",
          email: "ada@northwind.example",
          domain: "northwind.example",
        },
      },
    ]);
  });

  it("returns 401 when the signature is wrong", async () => {
    bind(async () => {
      throw new Error("should not enqueue");
    });
    const response = await post("{}", "00", String(NOW));
    expect(response.status).toBe(401);
  });

  it("returns 401 when the timestamp is older than five minutes", async () => {
    const sent: unknown[] = [];
    bind(async (body) => {
      sent.push(body);
    });
    const body = JSON.stringify({ assessment_id: "asm-1", email: "ada@northwind.example" });
    const signature = await signIntakeBody(SECRET, body);
    const response = await post(body, signature, String(NOW - 5 * 60 * 1000 - 1));
    expect(response.status).toBe(401);
    expect(sent).toEqual([]);
  });
});
