import { describe, expect, it } from "vitest";
import { hqChatConnectDecision, signHqChatToken, verifyHqChatToken } from "./hq-chat-token";

const SECRET = "test-hq-chat-secret";
const NOW = 1_700_000_000_000;

describe("HQ chat token", () => {
  it("accepts a token for ten minutes and rejects a missing, expired, or tampered one", () => {
    const token = signHqChatToken("staff-1", SECRET, NOW);
    expect(verifyHqChatToken(token, SECRET, NOW)).toEqual({ userId: "staff-1" });
    expect(verifyHqChatToken(token, SECRET, NOW + 10 * 60 * 1000)).toEqual({ userId: "staff-1" });
    expect(verifyHqChatToken("", SECRET, NOW)).toBeNull();
    expect(verifyHqChatToken(token, SECRET, NOW + 10 * 60 * 1000 + 1)).toBeNull();
    expect(verifyHqChatToken(`${token}x`, SECRET, NOW)).toBeNull();
    expect(verifyHqChatToken(token, "other-secret", NOW)).toBeNull();
  });

  it("closes the socket when the token is bad or the staff record is not live", () => {
    const token = signHqChatToken("staff-1", SECRET, NOW);
    expect(
      hqChatConnectDecision({ token: "", name: "staff-1", secret: SECRET, now: NOW, staffLive: true }),
    ).toBe("unauthorized");
    expect(
      hqChatConnectDecision({ token, name: "someone-else", secret: SECRET, now: NOW, staffLive: true }),
    ).toBe("unauthorized");
    expect(
      hqChatConnectDecision({ token, name: "staff-1", secret: SECRET, now: NOW, staffLive: false }),
    ).toBe("forbidden");
    expect(
      hqChatConnectDecision({ token, name: "staff-1", secret: SECRET, now: NOW, staffLive: true }),
    ).toBe("ok");
  });
});
