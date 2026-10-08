import { createHmac, timingSafeEqual } from "node:crypto";

const LIFE_MS = 10 * 60 * 1000;

export type HqChatIdentity = { userId: string };

export function signHqChatToken(userId: string, secret: string, now: number): string {
  const payload = Buffer.from(JSON.stringify({ userId, exp: now + LIFE_MS })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyHqChatToken(token: string, secret: string, now: number): HqChatIdentity | null {
  const split = token.split(".");
  if (split.length !== 2) return null;
  const [payload, signature] = split;
  if (!payload || !signature || !secret) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.userId !== "string" || !parsed.userId) return null;
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

export function hqChatConnectDecision(input: {
  token: string;
  name: string;
  secret: string;
  now: number;
  staffLive: boolean;
}): "ok" | "unauthorized" | "forbidden" {
  const identity = verifyHqChatToken(input.token, input.secret, input.now);
  if (!identity || identity.userId !== input.name) return "unauthorized";
  if (!input.staffLive) return "forbidden";
  return "ok";
}
