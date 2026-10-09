import { describe, expect, it } from "vitest";

import { splitMobileColumns } from "./data-table-mobile";

describe("splitMobileColumns", () => {
  it("keeps the first two columns in view", () => {
    expect(splitMobileColumns(["space", "client", "owner", "files"])).toEqual({
      visible: ["space", "client"],
      more: ["owner", "files"],
    });
  });

  it("hides the disclosure when a row has two columns or fewer", () => {
    expect(splitMobileColumns(["name"])).toEqual({ visible: ["name"], more: [] });
    expect(splitMobileColumns(["name", "status"])).toEqual({
      visible: ["name", "status"],
      more: [],
    });
    expect(splitMobileColumns([])).toEqual({ visible: [], more: [] });
  });
});
