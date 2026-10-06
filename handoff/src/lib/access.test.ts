import { describe, expect, it } from "vitest";
import { explainAccessRequest } from "./access";

describe("explainAccessRequest", () => {
  it("asks for the invite email when the address is not valid", () => {
    expect(explainAccessRequest("not-an-email").message).toBe(
      "Type the email your invite was sent to.",
    );
  });

  it("does not sign anyone in from a valid address", () => {
    const reply = explainAccessRequest("  client@example.com ");
    expect(reply.message).toBe(
      "If we know this email, we sent you a link to sign in.",
    );
    expect(reply.message).not.toContain("client@example.com");
  });
});
