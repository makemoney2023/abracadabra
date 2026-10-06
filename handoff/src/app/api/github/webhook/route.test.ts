import { afterEach, describe, expect, it } from "vitest";
import { githubSignature } from "@/lib/github/sign";
import { POST } from "./route";

const SECRET = "github-webhook-secret";
const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
const HQ = "handoff-hq.abracadabra-ai.workers.dev";

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
  delete process.env.GITHUB_WEBHOOK_SECRET;
});

function bind(send?: (body: unknown) => Promise<void>) {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = {
    env: send ? { GITHUB_EVENTS: { send } } : {},
  };
}

function post(body: string, init: { signature?: string; delivery?: string; event?: string; host?: string }): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json", host: init.host ?? HQ });
  if (init.signature !== undefined) headers.set("x-hub-signature-256", init.signature);
  if (init.delivery !== undefined) headers.set("x-github-delivery", init.delivery);
  if (init.event !== undefined) headers.set("x-github-event", init.event);
  return POST(new Request(`https://${init.host ?? HQ}/api/github/webhook`, { method: "POST", headers, body }));
}

describe("POST /api/github/webhook", () => {
  it("returns 202 and queues the delivery on the staff host", async () => {
    const sent: unknown[] = [];
    bind(async (body) => {
      sent.push(body);
    });
    const body = JSON.stringify({ zen: "ok" });
    const response = await post(body, {
      signature: githubSignature(SECRET, body),
      delivery: "del-1",
      event: "ping",
    });
    expect(response.status).toBe(202);
    expect(sent).toEqual([{ source: "github", deliveryId: "del-1", event: "ping", payload: { zen: "ok" } }]);
  });

  it("returns 401 when the signature or secret is missing", async () => {
    bind(async () => {
      throw new Error("should not enqueue");
    });
    const bad = await post("{}", { signature: "sha256=00", delivery: "del-1", event: "ping" });
    expect(bad.status).toBe(401);
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const body = "{}";
    const missing = await post(body, {
      signature: githubSignature(SECRET, body),
      delivery: "del-1",
      event: "ping",
    });
    expect(missing.status).toBe(401);
  });

  it("returns 400 without a delivery id and 503 without a queue", async () => {
    bind(async () => {
      throw new Error("should not enqueue");
    });
    const body = "{}";
    const signature = githubSignature(SECRET, body);
    const missing = await post(body, { signature, event: "ping" });
    expect(missing.status).toBe(400);
    (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = { env: {} };
    const noQueue = await post(body, { signature, delivery: "del-1", event: "ping" });
    expect(noQueue.status).toBe(503);
  });

  it("returns 404 on the client host", async () => {
    bind(async () => {
      throw new Error("should not enqueue");
    });
    const body = "{}";
    const response = await post(body, {
      signature: githubSignature(SECRET, body),
      delivery: "del-1",
      event: "ping",
      host: "handoff.abracadabra-ai.workers.dev",
    });
    expect(response.status).toBe(404);
  });
});
