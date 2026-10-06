import { describe, expect, it } from "vitest";
import { signIntakeBody, verifyIntakeRequest } from "./sign";

const SECRET = "intake-test-secret";
const NOW = 1_700_000_000_000;
const FIVE_MINUTES = 5 * 60 * 1000;

describe("intake signature", () => {
  it("accepts a fresh body signed with the shared secret", async () => {
    const body = JSON.stringify({ assessment_id: "asm-1" });
    const signature = await signIntakeBody(SECRET, body);
    const result = await verifyIntakeRequest({
      secret: SECRET,
      body,
      signature,
      timestamp: String(NOW),
      now: NOW,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a bad signature", async () => {
    const body = JSON.stringify({ assessment_id: "asm-1" });
    const result = await verifyIntakeRequest({
      secret: SECRET,
      body,
      signature: "00".repeat(32),
      timestamp: String(NOW),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "bad_signature" });
  });

  it("rejects a timestamp older than five minutes", async () => {
    const body = JSON.stringify({ assessment_id: "asm-1" });
    const signature = await signIntakeBody(SECRET, body);
    const result = await verifyIntakeRequest({
      secret: SECRET,
      body,
      signature,
      timestamp: String(NOW - FIVE_MINUTES - 1),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "stale" });
  });

  it("rejects a request when the secret is missing", async () => {
    const body = JSON.stringify({ assessment_id: "asm-1" });
    const result = await verifyIntakeRequest({
      secret: "",
      body,
      signature: "ab",
      timestamp: String(NOW),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "bad_signature" });
  });
});
