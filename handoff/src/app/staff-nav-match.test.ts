import { describe, expect, it } from "vitest";
import { navIsActive } from "./staff-nav-match";

describe("navIsActive", () => {
  it("marks Today only on the studio home", () => {
    expect(navIsActive("/", "/")).toBe(true);
    expect(navIsActive("/leads", "/")).toBe(false);
    expect(navIsActive("/clients", "/")).toBe(false);
  });

  it("marks a section when the path is that page or a page under it", () => {
    expect(navIsActive("/clients", "/clients")).toBe(true);
    expect(navIsActive("/clients/abc", "/clients")).toBe(true);
    expect(navIsActive("/spaces/templates", "/spaces")).toBe(true);
    expect(navIsActive("/work", "/work")).toBe(true);
    expect(navIsActive("/leads", "/clients")).toBe(false);
    expect(navIsActive("/projects/abc", "/clients")).toBe(false);
    expect(navIsActive("/projects/abc", "/work")).toBe(false);
    expect(navIsActive("/admin", "/spaces")).toBe(true);
    expect(navIsActive("/admin/templates", "/spaces")).toBe(true);
    expect(navIsActive("/admin", "/")).toBe(false);
    expect(navIsActive("/settings/github", "/settings/github")).toBe(true);
    expect(navIsActive("/settings", "/settings/github")).toBe(false);
    expect(navIsActive("/clients", "/settings/github")).toBe(false);
  });
});
