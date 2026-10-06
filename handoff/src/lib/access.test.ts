import { describe, expect, it } from "vitest";
import { explainAccessRequest } from "./access";

describe("explainAccessRequest", () => {
  it("asks for the invite email when the address is not valid", () => {
    expect(explainAccessRequest("not-an-email").message).toBe(
      "Enter the email on your invite.",
    );
  });

  it("does not sign anyone in from a valid address", () => {
    const reply = explainAccessRequest("  client@example.com ");
    expect(reply.message).toBe(
      "If this address can open Handoff, a sign-in link is on its way.",
    );
    expect(reply.message).not.toContain("client@example.com");
  });
});
