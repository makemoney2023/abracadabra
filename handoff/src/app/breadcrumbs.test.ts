import { describe, expect, it } from "vitest";

import { breadcrumbsFor } from "./breadcrumbs";

describe("breadcrumbsFor", () => {
  it("names the home page Today", () => {
    expect(breadcrumbsFor("/", {})).toEqual([{ label: "Today" }]);
  });

  it("names a section with one crumb", () => {
    expect(breadcrumbsFor("/clients", {})).toEqual([{ label: "Clients" }]);
  });

  it("links the section and uses the record name", () => {
    expect(breadcrumbsFor("/clients/abc", { "/clients/abc": "Acme" })).toEqual([
      { label: "Clients", href: "/clients" },
      { label: "Acme" },
    ]);
  });

  it("uses an ellipsis when a record has no name", () => {
    expect(breadcrumbsFor("/clients/abc", {})).toEqual([
      { label: "Clients", href: "/clients" },
      { label: "…" },
    ]);
  });

  it("crumbs held files under Spaces", () => {
    expect(breadcrumbsFor("/admin/held", {})).toEqual([
      { label: "Spaces", href: "/spaces" },
      { label: "Held files" },
    ]);
  });

  it("crumbs a workspace under Spaces", () => {
    expect(breadcrumbsFor("/w/east", { "/w/east": "East space" })).toEqual([
      { label: "Spaces", href: "/spaces" },
      { label: "East space" },
    ]);
  });

  it("splits settings and GitHub", () => {
    expect(breadcrumbsFor("/settings/github", {})).toEqual([
      { label: "Settings", href: "/settings" },
      { label: "GitHub" },
    ]);
  });

  it("keeps a workspace section under the space name", () => {
    expect(breadcrumbsFor("/w/east/work", { "/w/east": "East space" })).toEqual([
      { label: "Spaces", href: "/spaces" },
      { label: "East space", href: "/w/east" },
      { label: "Work" },
    ]);
  });

  it("treats the spaces index as the current page", () => {
    expect(breadcrumbsFor("/spaces", {})).toEqual([{ label: "Spaces" }]);
    expect(breadcrumbsFor("/admin", {})).toEqual([{ label: "Spaces" }]);
  });

  it("never links the last crumb", () => {
    const trails = [
      breadcrumbsFor("/", {}),
      breadcrumbsFor("/clients", {}),
      breadcrumbsFor("/clients/abc", { "/clients/abc": "Acme" }),
      breadcrumbsFor("/clients/abc", {}),
      breadcrumbsFor("/admin/held", {}),
      breadcrumbsFor("/w/east", { "/w/east": "East space" }),
      breadcrumbsFor("/settings/github", {}),
    ];
    for (const trail of trails) {
      expect(trail.at(-1)?.href).toBeUndefined();
    }
  });
});
