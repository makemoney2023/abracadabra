import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONTRACT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
  "RESEND_API_KEY",
  "HANDOFF_FROM_EMAIL",
  "HANDOFF_BUCKET=handoff",
  "HANDOFF_BRANDING_BUCKET=branding",
  "HANDOFF_SUPER_ADMIN_EMAILS",
  "HANDOFF_REGION",
  "CLAMD_HOST=127.0.0.1",
  "CLAMD_PORT=3310",
  "HANDOFF_ALLOW_UNSCANNED",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_ENDPOINT",
];

describe(".env.example", () => {
  const text = readFileSync(
    path.join(process.cwd(), ".env.example"),
    "utf8",
  );

  it("lists the environment contract", () => {
    for (const line of CONTRACT) {
      expect(text).toContain(line);
    }
  });

  it("keeps secrets off NEXT_PUBLIC names", () => {
    const publicNames = text
      .split("\n")
      .map((line) => line.split("=")[0]?.trim() ?? "")
      .filter((name) => name.startsWith("NEXT_PUBLIC_"));
    expect(publicNames).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
    for (const name of publicNames) {
      expect(name).not.toMatch(/SECRET|SERVICE|API_KEY|DATABASE/i);
    }
  });
});
