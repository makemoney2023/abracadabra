import { afterEach, describe, expect, it, vi } from "vitest";
import { assessmentIntakeBody, postSignedIntake } from "@/lib/handoff-intake";

async function signIntakeBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const SECRET = "intake-test-secret";
const NOW = 1_700_000_000_000;

const row = {
  id: "asm-1",
  email: "ada@northwind.example",
  name: "Ada North",
  domain: "northwind.example",
  answers: { q1: "yes" },
  scores: { overall: { total: 42 } },
  utm: { source: "site" },
  completedAt: "2023-11-14T22:13:20.000Z",
  publicToken: "tok-1",
};

describe("handoff intake poster", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.INTAKE_SIGNING_SECRET;
    delete process.env.HANDOFF_INTAKE_ORIGIN;
    delete process.env.NEXT_PUBLIC_CHECK_URL;
  });

  it("skips a finished check that has no email yet", () => {
    expect(assessmentIntakeBody({ ...row, email: null }, "https://check.example")).toEqual({
      skip: true,
    });
  });

  it("posts a signed assessment body when the email is present", async () => {
    process.env.INTAKE_SIGNING_SECRET = SECRET;
    process.env.HANDOFF_INTAKE_ORIGIN = "https://handoff.example";
    const built = assessmentIntakeBody(row, "https://check.example");
    expect(built.skip).toBe(false);
    if (built.skip) return;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    });
    const result = await postSignedIntake(
      "https://handoff.example",
      SECRET,
      "/api/intake/assessment",
      built.body,
      NOW,
      fetchImpl,
    );
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("https://handoff.example/api/intake/assessment");
    const raw = String(calls[0]?.init.body);
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("x-intake-timestamp")).toBe(String(NOW));
    expect(headers.get("x-intake-signature")).toBe(await signIntakeBody(SECRET, raw));
    expect(JSON.parse(raw)).toMatchObject({
      assessment_id: "asm-1",
      email: "ada@northwind.example",
      domain: "northwind.example",
      total_score: 42,
      report_url: "https://check.example/r/tok-1",
    });
  });

  it("skips the post when the intake secret is unset", async () => {
    const fetchImpl = vi.fn();
    const result = await postSignedIntake(
      "https://handoff.example",
      "",
      "/api/intake/assessment",
      { assessment_id: "asm-1" },
      NOW,
      fetchImpl,
    );
    expect(result).toEqual({ ok: true, skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
