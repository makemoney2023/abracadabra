import { describe, expect, it } from "vitest";
import {
  assertProductionEnv,
  missingProductionSecrets,
} from "./production-env";

describe("missingProductionSecrets", () => {
  it("allows a development process to start without server secrets", () => {
    expect(missingProductionSecrets({ NODE_ENV: "development" })).toEqual([]);
  });

  it("treats blank production secrets as missing", () => {
    expect(
      missingProductionSecrets({
        NODE_ENV: "production",
        SUPABASE_SECRET_KEY: "  ",
        DATABASE_URL: "",
        RESEND_API_KEY: undefined,
      }),
    ).toEqual(["SUPABASE_SECRET_KEY", "DATABASE_URL", "RESEND_API_KEY"]);
  });

  it("accepts production when the three server secrets are set", () => {
    expect(
      missingProductionSecrets({
        NODE_ENV: "production",
        SUPABASE_SECRET_KEY: "sb_secret",
        DATABASE_URL: "postgres://local/handoff",
        RESEND_API_KEY: "re_test",
      }),
    ).toEqual([]);
  });
});

describe("assertProductionEnv", () => {
  it("names every missing production secret", () => {
    expect(() => assertProductionEnv({ NODE_ENV: "production" })).toThrow(
      /SUPABASE_SECRET_KEY, DATABASE_URL, RESEND_API_KEY/,
    );
  });
});
