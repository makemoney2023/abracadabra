import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => {} }),
  headers: async () => ({ get: () => "hq.localhost" }),
}));

import { signIn } from "./sign-in-action";

describe("signIn", () => {
  it("rejects an empty username and does not echo the password", async () => {
    const form = new FormData();
    form.set("username", "   ");
    form.set("password", "made-up-secret");
    const result = await signIn(null, form);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("username");
    expect(result.error.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("made-up-secret");
  });
});
