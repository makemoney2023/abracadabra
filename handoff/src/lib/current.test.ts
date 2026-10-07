import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ dbStarted: false, token: "" }));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (gate.dbStarted) throw new Error("cookie store lost");
    return { get: () => ({ value: "session-token" }) };
  },
  headers: async () => ({ get: () => null }),
}));

vi.mock("@/db/open", () => ({
  openHandoffDb: async () => {
    gate.dbStarted = true;
    return {};
  },
}));

vi.mock("@/db/migrate", () => ({
  migrate: async () => {},
}));

vi.mock("@/lib/preview-session", () => ({
  ensureStudioAdmin: async () => {},
}));

vi.mock("@/lib/session", () => ({
  SESSION_COOKIE: "handoff_session",
  getCaller: async (_sql: unknown, token: string) => {
    gate.token = token;
    return {
      userId: token === "session-token" ? "user-1" : null,
      staff: token ? { superAdmin: true } : null,
      operatorOf: [],
      memberships: [],
    };
  },
}));

vi.mock("@/lib/store/staff", () => ({
  isLiveSuperAdmin: async () => false,
}));

import { openSession } from "./current";

beforeEach(() => {
  gate.dbStarted = false;
  gate.token = "";
});

describe("openSession", () => {
  it("keeps the session cookie that was present before the database opens", async () => {
    const session = await openSession();

    expect(gate.token).toBe("session-token");
    expect(session.caller.userId).toBe("user-1");
  });
});
