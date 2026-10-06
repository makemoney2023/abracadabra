import { describe, expect, it } from "vitest";
import { moveDealMessage } from "./messages";

describe("moveDealMessage", () => {
  it("asks for a reason when a deal is marked lost", () => {
    expect(moveDealMessage("invalid", "lost")).toBe("Say why this deal was lost.");
  });

  it("asks for a real stage when the stage is not one we use", () => {
    expect(moveDealMessage("invalid", "nope")).toBe("Pick a stage.");
  });

  it("keeps the shared sentence for other errors", () => {
    expect(moveDealMessage("forbidden", "won")).toBe("You can't do that.");
    expect(moveDealMessage("missing", "contacted")).toBe("That client or space is not here.");
  });
});
