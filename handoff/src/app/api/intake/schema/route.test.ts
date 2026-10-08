import { afterEach, describe, expect, it } from "vitest";
import { signIntakeBody } from "@/lib/intake/sign";
import { POST } from "./route";

const SECRET = "intake-test-secret";
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

describe("POST /api/intake/schema", () => {
  it("returns 202 and queues the schema package", async () => {
    const sent: unknown[] = [];
    bind(async (body) => {
      sent.push(body);
    });
    const body = JSON.stringify({
      scan_id: "scan-1",
      domain: "northwind.example",
      origin: "https://northwind.example",
      files: [{ path: "json-ld/home.jsonld", content: "{}" }],
    });
    const response = await POST(
      new Request("https://handoff.example/api/intake/schema", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intake-signature": await signIntakeBody(SECRET, body),
          "x-intake-timestamp": String(Date.now()),
        },
        body,
      }),
    );
    expect(response.status).toBe(202);
    expect(sent).toEqual([
      {
        source: "schema",
        payload: {
          scan_id: "scan-1",
          domain: "northwind.example",
          origin: "https://northwind.example",
          files: [{ path: "json-ld/home.jsonld", content: "{}" }],
        },
      },
    ]);
  });

  it("returns 400 when the package has no files", async () => {
    bind(async () => {
      throw new Error("should not enqueue");
    });
    const body = JSON.stringify({ scan_id: "scan-1", domain: "northwind.example", files: [] });
    const response = await POST(
      new Request("https://handoff.example/api/intake/schema", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intake-signature": await signIntakeBody(SECRET, body),
          "x-intake-timestamp": String(Date.now()),
        },
        body,
      }),
    );
    expect(response.status).toBe(400);
  });
});
