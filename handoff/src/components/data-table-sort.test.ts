import { describe, expect, it } from "vitest";

import { nextSort, parseSort, sortHref, sortRows } from "./data-table-sort";

describe("parseSort", () => {
  it("reads an ascending key", () => {
    expect(parseSort("name")).toEqual({ key: "name", dir: "asc" });
  });

  it("reads a descending key", () => {
    expect(parseSort("-name")).toEqual({ key: "name", dir: "desc" });
  });

  it("returns null for nothing", () => {
    expect(parseSort(undefined)).toBeNull();
    expect(parseSort("")).toBeNull();
    expect(parseSort("-")).toBeNull();
  });
});

describe("nextSort", () => {
  it("starts ascending", () => {
    expect(nextSort(undefined, "name")).toBe("name");
  });

  it("flips to descending", () => {
    expect(nextSort("name", "name")).toBe("-name");
  });

  it("clears after descending", () => {
    expect(nextSort("-name", "name")).toBe("");
  });

  it("starts ascending on a different key", () => {
    expect(nextSort("-name", "owner")).toBe("owner");
  });
});

type Row = { name: string | null; count: number | null };

const rows: Row[] = [
  { name: "beta", count: 10 },
  { name: null, count: null },
  { name: "Alpha", count: 2 },
  { name: "gamma", count: 1 },
];

const get = (row: Row, key: string) => (key === "name" ? row.name : row.count);

describe("sortHref", () => {
  it("starts a sort and keeps other filters", () => {
    expect(sortHref("/clients?q=ada", undefined, "name")).toBe("/clients?q=ada&sort=name");
  });

  it("flips the active column", () => {
    expect(sortHref("/clients?sort=name", "name", "name")).toBe("/clients?sort=-name");
  });

  it("drops the sort when the cycle ends", () => {
    expect(sortHref("/clients?q=ada&sort=-name", "-name", "name")).toBe("/clients?q=ada");
  });
});

describe("sortRows", () => {
  it("returns the rows untouched without a sort", () => {
    expect(sortRows(rows, undefined, get)).toBe(rows);
  });

  it("sorts strings case-insensitively with nulls last", () => {
    expect(sortRows(rows, "name", get).map((r) => r.name)).toEqual(["Alpha", "beta", "gamma", null]);
    expect(sortRows(rows, "-name", get).map((r) => r.name)).toEqual(["gamma", "beta", "Alpha", null]);
  });

  it("sorts numbers numerically with nulls last", () => {
    expect(sortRows(rows, "count", get).map((r) => r.count)).toEqual([1, 2, 10, null]);
    expect(sortRows(rows, "-count", get).map((r) => r.count)).toEqual([10, 2, 1, null]);
  });

  it("does not mutate the input", () => {
    const copy = [...rows];
    sortRows(rows, "name", get);
    expect(rows).toEqual(copy);
  });
});
