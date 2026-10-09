import { describe, expect, it } from "vitest";
import { fileLabel } from "./labels";

describe("fileLabel", () => {
  it("uses the piece title", () => {
    expect(fileLabel({ title: "Hero", role: "cover" })).toBe("Hero");
  });

  it("turns a role into words when the title is blank", () => {
    expect(fileLabel({ title: "  ", role: "cover_still" })).toBe("cover still");
  });

  it("says File when the title and the role are blank", () => {
    expect(fileLabel({})).toBe("File");
  });
});
