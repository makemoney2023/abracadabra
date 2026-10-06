import { afterEach, describe, expect, it } from "vitest";
import { assertTurnstile } from "@/lib/turnstile";

describe("assertTurnstile", () => {
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("passes when no secret is configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    await expect(assertTurnstile(undefined)).resolves.toEqual({ ok: true });
  });

  it("asks for the check when a secret is set and the token is missing", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    await expect(assertTurnstile("  ")).resolves.toEqual({
      ok: false,
      error: "Complete the check",
    });
  });

  it("fails when siteverify says the token is bad", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const fetchImpl = async () =>
      new Response(JSON.stringify({ success: false }), { status: 200 });
    await expect(assertTurnstile("token", fetchImpl)).resolves.toEqual({
      ok: false,
      error: "Check failed",
    });
  });

  it("passes when siteverify accepts the token", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const fetchImpl = async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 });
    await expect(assertTurnstile("token", fetchImpl)).resolves.toEqual({ ok: true });
  });
});
