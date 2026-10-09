import { describe, expect, it } from "vitest";
import { fail, isOk, ok, type ActionResult } from "./action-result";

describe("action result", () => {
  it("builds a success with a message", () => {
    const result = ok("Saved.");
    expect(result).toEqual({ ok: true, message: "Saved." });
    expect(isOk(result)).toBe(true);
  });

  it("builds a failure with an error and an optional field", () => {
    expect(fail("Name is required.")).toEqual({ ok: false, error: "Name is required." });
    expect(fail("Name is required.", "name")).toEqual({
      ok: false,
      error: "Name is required.",
      field: "name",
    });
  });

  it("narrows the union", () => {
    const result: ActionResult = fail("Nope.");
    if (isOk(result)) {
      throw new Error("should not be ok");
    }
    expect(result.error).toBe("Nope.");
  });
});
