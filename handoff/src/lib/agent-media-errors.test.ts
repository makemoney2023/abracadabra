import { describe, expect, it } from "vitest";
import { classifyMediaError, redactDetail } from "./agent-media-errors";

describe("classifyMediaError", () => {
  it("maps a 402 status to credits_exhausted", () => {
    expect(classifyMediaError(Object.assign(new Error("boom"), { status: 402 }))).toMatchObject({
      status: 402,
      reason: "credits_exhausted",
      message: "Model credits exhausted on the Cloudflare account.",
      upstreamStatus: 402,
    });
  });

  it("finds a 402 on a nested response, a string code, or in the message", () => {
    expect(classifyMediaError({ response: { status: 402 } }).status).toBe(402);
    expect(classifyMediaError(Object.assign(new Error("x"), { code: "402" })).status).toBe(402);
    expect(classifyMediaError(new Error("AiError: 402 Payment Required")).reason).toBe("credits_exhausted");
    expect(classifyMediaError(new Error("Insufficient credits for this model")).reason).toBe("credits_exhausted");
  });

  it("calls a provider 4xx bad_input and keeps it a 502", () => {
    const failure = classifyMediaError(Object.assign(new Error("400: unknown provider"), { status: 400 }));
    expect(failure).toMatchObject({ status: 502, reason: "bad_input", upstreamStatus: 400 });
    expect(failure.message).not.toContain("unknown provider");
  });

  it("calls a 429 rate_limited, an empty answer empty_output, and anything else model_error", () => {
    expect(classifyMediaError(Object.assign(new Error("slow down"), { status: 429 })).reason).toBe("rate_limited");
    expect(classifyMediaError(new Error("empty"))).toMatchObject({ status: 502, reason: "empty_output" });
    expect(classifyMediaError(Object.assign(new Error("upstream broke"), { status: 503 }))).toMatchObject({ status: 502, reason: "model_error" });
    expect(classifyMediaError("weird")).toMatchObject({ status: 502, reason: "model_error", upstreamStatus: null });
  });

  it("never returns the provider's text to the caller", () => {
    const failure = classifyMediaError(new Error("secret prompt text leaked"), "secret prompt text");
    expect(failure.message).not.toContain("secret");
  });
});

describe("redactDetail", () => {
  it("removes the prompt, embedded images and long tokens, and caps the length", () => {
    const text = redactDetail(`bad: A private brief for Acme data:image/png;base64,${"A".repeat(80)} ${"k".repeat(70)} ${"z".repeat(500)}`, "A private brief for Acme");
    expect(text).not.toContain("private brief");
    expect(text).not.toContain("AAAA");
    expect(text).toContain("[prompt]");
    expect(text.length).toBeLessThanOrEqual(200);
  });
});
