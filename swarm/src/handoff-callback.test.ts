import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacHex, notifyHandoffSettled } from "./handoff-callback";

describe("notifyHandoffSettled", () => {
  it("signs the run id for the handoff callback", async () => {
    const calls: { url: string; signature: string; body: string }[] = [];
    await notifyHandoffSettled(
      { HANDOFF_ORIGIN: "https://handoff.example/", SWARM_RUN_SECRET: "run-secret" },
      "exec-1",
      (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          signature: String(new Headers(init?.headers).get("x-handoff-signature")),
          body: String(init?.body ?? ""),
        });
        return new Response("ok");
      }) as typeof fetch,
      1_700_000_000_000,
    );
    const body = JSON.stringify({ runId: "exec-1", sentAt: 1_700_000_000_000 });
    expect(calls).toEqual([
      {
        url: "https://handoff.example/api/swarm-settled",
        body,
        signature: createHmac("sha256", "run-secret").update(body).digest("hex"),
      },
    ]);
    expect(await hmacHex("run-secret", body)).toBe(calls[0]?.signature);
  });

  it("does nothing when the handoff address is unset", async () => {
    let called = false;
    await notifyHandoffSettled({ SWARM_RUN_SECRET: "run-secret" }, "exec-1", (async () => {
      called = true;
      return new Response("ok");
    }) as typeof fetch);
    expect(called).toBe(false);
  });
});
