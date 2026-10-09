import { describe, expect, it } from "vitest";
import { spacesTab } from "./tabs";

describe("spacesTab", () => {
  it("maps the public spaces paths", () => {
    expect(spacesTab("/spaces")).toBe("/spaces");
    expect(spacesTab("/spaces/held")).toBe("/spaces/held");
    expect(spacesTab("/spaces/staff")).toBe("/spaces/staff");
    expect(spacesTab("/spaces/templates")).toBe("/spaces/templates");
  });

  it("keeps new space on the spaces tab", () => {
    expect(spacesTab("/spaces/new")).toBe("/spaces");
    expect(spacesTab("/admin/workspaces/new")).toBe("/spaces");
  });

  it("accepts the rewritten admin paths", () => {
    expect(spacesTab("/admin")).toBe("/spaces");
    expect(spacesTab("/admin/held")).toBe("/spaces/held");
  });
});
