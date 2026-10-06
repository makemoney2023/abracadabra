import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONTRACT = [
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

  it("keeps the database binding and secrets off NEXT_PUBLIC names", () => {
    expect(text).not.toContain("NEXT_PUBLIC_");
    expect(text).not.toContain("DATABASE_URL");
    expect(text).not.toContain("SUPABASE");
    const publicNames = text
      .split("\n")
      .map((line) => line.split("=")[0]?.trim() ?? "")
      .filter((name) => name.startsWith("NEXT_PUBLIC_"));
    expect(publicNames).toEqual([]);
  });
});
