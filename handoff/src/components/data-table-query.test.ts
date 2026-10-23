import { describe, expect, it } from "vitest";
import {
  applyFilters,
  buildHref,
  deriveOptions,
  firstParam,
  hiddenFields,
  matchesSearch,
  pageSizeChoices,
  pageWindow,
  paginate,
  parseHiddenColumns,
  parsePage,
  parsePageSize,
  pathOf,
  rangeLabel,
  safeKey,
} from "./data-table-query";

describe("firstParam", () => {
  it("takes the first value of a repeated param and trims it", () => {
    expect(firstParam(" a ")).toBe("a");
    expect(firstParam(["x", "y"])).toBe("x");
    expect(firstParam(undefined)).toBe("");
    expect(firstParam([])).toBe("");
  });
});

describe("parsePage and parsePageSize", () => {
  it("reads whole pages of 1 or more", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });

  it("only allows the listed sizes", () => {
    expect(parsePageSize("50")).toBe(50);
    expect(parsePageSize("7")).toBe(25);
    expect(parsePageSize("100000")).toBe(25);
    expect(parsePageSize("abc", 10)).toBe(10);
    expect(parsePageSize(undefined, 50)).toBe(50);
  });

  it("always offers the page's default size", () => {
    expect(pageSizeChoices(25)).toEqual([10, 25, 50, 100]);
    expect(pageSizeChoices(20)).toEqual([10, 20, 25, 50, 100]);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 57 }, (_, i) => i + 1);

  it("slices a page and reports the range", () => {
    const page = paginate(rows, 2, 25);
    expect(page.rows[0]).toBe(26);
    expect(page.rows).toHaveLength(25);
    expect(page).toMatchObject({ page: 2, pages: 3, total: 57, from: 26, to: 50, size: 25 });
  });

  it("gives the short last page", () => {
    const page = paginate(rows, 3, 25);
    expect(page.rows).toEqual([51, 52, 53, 54, 55, 56, 57]);
    expect(page).toMatchObject({ from: 51, to: 57 });
  });

  it("clamps a page past the end", () => {
    expect(paginate(rows, 99, 25).page).toBe(3);
    expect(paginate(rows, 0, 25).page).toBe(1);
  });

  it("handles no rows", () => {
    expect(paginate([], 1, 25)).toMatchObject({ rows: [], pages: 1, total: 0, from: 0, to: 0 });
  });
});

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });

  it("adds gaps around the current page", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, "gap", 10]);
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pageWindow(10, 10)).toEqual([1, "gap", 9, 10]);
  });

  it("fills a gap of one page instead of hiding it", () => {
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
  });
});

describe("rangeLabel", () => {
  it("words the footer count", () => {
    expect(rangeLabel(1, 25, 140)).toBe("Showing 1–25 of 140");
    expect(rangeLabel(1, 3, 3)).toBe("3 rows");
    expect(rangeLabel(1, 1, 1)).toBe("1 row");
    expect(rangeLabel(0, 0, 0)).toBe("No rows");
  });
});

describe("matchesSearch", () => {
  it("needs every word, in any order, ignoring case", () => {
    expect(matchesSearch("Renew Implants Toronto", "toronto renew")).toBe(true);
    expect(matchesSearch("Renew Implants", "renew foam")).toBe(false);
    expect(matchesSearch("anything", "   ")).toBe(true);
  });
});

describe("filters", () => {
  const rows = [
    { name: "a", kind: "Lead" },
    { name: "b", kind: "Client" },
    { name: "c", kind: "Lead" },
    { name: "d", kind: "" },
  ];
  const get = (row: { kind: string }) => row.kind;

  it("lists the values found, with counts, sorted", () => {
    expect(deriveOptions(rows, get)).toEqual([
      { value: "Client", label: "Client", count: 1 },
      { value: "Lead", label: "Lead", count: 2 },
    ]);
  });

  it("keeps rows that match every active filter", () => {
    const filters = [{ key: "kind", label: "Kind", get }];
    expect(applyFilters(rows, filters, { kind: "Lead" }).map((row) => row.name)).toEqual(["a", "c"]);
    expect(applyFilters(rows, filters, {})).toBe(rows);
    expect(applyFilters(rows, filters, { kind: "Nope" })).toEqual([]);
  });
});

describe("buildHref", () => {
  it("keeps the base path's params and the table's state", () => {
    expect(buildHref("/clients?q=foam", { sort: "-name", kind: "Lead" }, { health: "On track" })).toBe(
      "/clients?q=foam&sort=-name&kind=Lead&health=On+track",
    );
  });

  it("goes back to page 1 unless the link sets a page", () => {
    expect(buildHref("/clients?page=4", {}, { kind: "Lead" })).toBe("/clients?kind=Lead");
    expect(buildHref("/clients", {}, { page: "3" })).toBe("/clients?page=3");
  });

  it("removes a key when the patch is null or empty", () => {
    expect(buildHref("/clients", { q: "x", kind: "Lead" }, { kind: null })).toBe("/clients?q=x");
    expect(buildHref("/clients", { q: "x" }, { q: "" })).toBe("/clients");
  });

  it("keeps a hash", () => {
    expect(buildHref("/clients#top", { q: "x" })).toBe("/clients?q=x#top");
  });
});

describe("hiddenFields and pathOf", () => {
  it("lists the params a search form must carry, minus the dropped ones", () => {
    expect(hiddenFields("/leads?view=list", { sort: "-score", q: "x", page: "2" }, ["q", "page"])).toEqual([
      { name: "view", value: "list" },
      { name: "sort", value: "-score" },
    ]);
    expect(hiddenFields("/projects", {}, ["q"])).toEqual([]);
  });

  it("cuts a path at the query or hash", () => {
    expect(pathOf("/clients?q=a")).toBe("/clients");
    expect(pathOf("/clients#x")).toBe("/clients");
    expect(pathOf("/clients")).toBe("/clients");
  });
});

describe("column visibility storage", () => {
  it("reads a stored list and ignores bad data", () => {
    expect(parseHiddenColumns('["a","b"]')).toEqual(["a", "b"]);
    expect(parseHiddenColumns('["a","b"]', ["b", "c"])).toEqual(["b"]);
    expect(parseHiddenColumns("not json")).toEqual([]);
    expect(parseHiddenColumns('{"a":1}')).toEqual([]);
    expect(parseHiddenColumns('[1,"a"]')).toEqual(["a"]);
    expect(parseHiddenColumns(null)).toEqual([]);
  });

  it("makes keys safe for a selector", () => {
    expect(safeKey("last activity")).toBe("last_activity");
    expect(safeKey('a"]x')).toBe("a__x");
    expect(safeKey("open-work_1")).toBe("open-work_1");
  });
});
