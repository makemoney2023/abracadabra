import { describe, expect, it } from "vitest";

import { paletteItems, pushRecent } from "./palette-items";

describe("pushRecent", () => {
  it("moves a repeat to the front and caps at 8", () => {
    const start = Array.from({ length: 8 }, (_, index) => ({
      label: `Item ${index}`,
      href: `/${index}`,
    }));
    const moved = pushRecent(start, { label: "Item 3", href: "/3" });
    expect(moved).toHaveLength(8);
    expect(moved[0]).toEqual({ label: "Item 3", href: "/3" });
    expect(moved.filter((item) => item.href === "/3")).toHaveLength(1);

    const added = pushRecent(start, { label: "New", href: "/new" });
    expect(added).toHaveLength(8);
    expect(added[0]).toEqual({ label: "New", href: "/new" });
    expect(added.some((item) => item.href === "/7")).toBe(false);
  });
});

describe("paletteItems", () => {
  it("orders groups and skips empty ones", () => {
    const items = paletteItems({
      nav: [{ label: "Today", href: "/" }],
      recent: [],
      clients: [{ id: "abc", name: "Acme" }],
      actions: [{ label: "New client", run: "new-client" }],
    });
    expect(items.map((item) => item.group)).toEqual(["Go to", "Clients", "Actions"]);
  });

  it("links a client to its record", () => {
    const items = paletteItems({
      nav: [],
      recent: [],
      clients: [{ id: "abc", name: "Acme" }],
      actions: [],
    });
    expect(items).toEqual([{ group: "Clients", label: "Acme", href: "/clients/abc" }]);
  });

  it("returns nothing when every group is empty", () => {
    expect(paletteItems({ nav: [], recent: [], clients: [], actions: [] })).toEqual([]);
  });
});
