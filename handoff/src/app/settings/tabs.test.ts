import { describe, expect, it } from "vitest";

import { settingsTab } from "./tabs";

describe("settingsTab", () => {
  it("keeps GitHub, Shortcuts, and Appearance on their own tabs", () => {
    expect(settingsTab("/settings/github")).toBe("/settings/github");
    expect(settingsTab("/settings/shortcuts")).toBe("/settings/shortcuts");
    expect(settingsTab("/settings/appearance")).toBe("/settings/appearance");
  });

  it("treats the settings index and unknown paths as GitHub", () => {
    expect(settingsTab("/settings")).toBe("/settings/github");
    expect(settingsTab("/settings/github?sort=repo")).toBe("/settings/github");
    expect(settingsTab("/settings/other")).toBe("/settings/github");
  });
});
