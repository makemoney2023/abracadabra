import { describe, expect, it } from "vitest";
import {
  assertProductionEnv,
  missingProductionSecrets,
} from "./production-env";

describe("missingProductionSecrets", () => {
  it("allows a development process to start without server secrets", () => {
    expect(missingProductionSecrets({ NODE_ENV: "development" })).toEqual([]);
  });

  it("treats a blank production from address as missing", () => {
    expect(
      missingProductionSecrets({
        NODE_ENV: "production",
        HANDOFF_FROM_EMAIL: "  ",
      }),
    ).toEqual(["HANDOFF_FROM_EMAIL"]);
  });

  it("accepts production when the from address is set", () => {
    expect(
      missingProductionSecrets({
        NODE_ENV: "production",
        HANDOFF_FROM_EMAIL: "handoff@abra-ca-dabra.app",
      }),
    ).toEqual([]);
  });
});

describe("assertProductionEnv", () => {
  it("names the missing production secret", () => {
    expect(() => assertProductionEnv({ NODE_ENV: "production" })).toThrow(
      /HANDOFF_FROM_EMAIL/,
    );
  });
});
