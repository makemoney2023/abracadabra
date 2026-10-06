import { describe, expect, it } from "vitest";
import {
  assertProductionEnv,
  missingProductionSecrets,
} from "./production-env";

describe("missingProductionSecrets", () => {
  it("allows a development process to start without server secrets", () => {
    expect(missingProductionSecrets({ NODE_ENV: "development" })).toEqual([]);
  });

  it("treats a blank production mail key as missing", () => {
    expect(
      missingProductionSecrets({
        NODE_ENV: "production",
        RESEND_API_KEY: "  ",
      }),
    ).toEqual(["RESEND_API_KEY"]);
  });

  it("accepts production when the mail key is set", () => {
    expect(
      missingProductionSecrets({
        NODE_ENV: "production",
        RESEND_API_KEY: "re_test",
      }),
    ).toEqual([]);
  });
});

describe("assertProductionEnv", () => {
  it("names the missing production secret", () => {
    expect(() => assertProductionEnv({ NODE_ENV: "production" })).toThrow(
      /RESEND_API_KEY/,
    );
  });
});
