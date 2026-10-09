import { describe, expect, it } from "vitest";
import { DEAL_STAGES } from "@/db/crm";
import { filterDeals, leadsHref, leadsView, ownerInitials, stageCounts, type LeadFilterRow } from "./view";

function deal(partial: Partial<LeadFilterRow> & Pick<LeadFilterRow, "id" | "stage">): LeadFilterRow {
  return {
    organization_name: "Northwind",
    title: "Website",
    owner_user_id: null,
    next_step: null,
    contact: null,
    ...partial,
  };
}

describe("stageCounts", () => {
  it("counts every stage, including zeros", () => {
    const counts = stageCounts([
      deal({ id: "a", stage: "new" }),
      deal({ id: "b", stage: "new" }),
      deal({ id: "c", stage: "proposal" }),
    ]);
    expect(Object.keys(counts)).toEqual([...DEAL_STAGES]);
    expect(counts.new).toBe(2);
    expect(counts.proposal).toBe(1);
    expect(counts.contacted).toBe(0);
    expect(counts.call_booked).toBe(0);
    expect(counts.won).toBe(0);
    expect(counts.lost).toBe(0);
  });

  it("returns zeros when there are no deals", () => {
    const counts = stageCounts([]);
    for (const stage of DEAL_STAGES) expect(counts[stage]).toBe(0);
  });
});

describe("leadsView", () => {
  it("defaults to list", () => {
    expect(leadsView(undefined)).toBe("list");
    expect(leadsView("")).toBe("list");
    expect(leadsView("list")).toBe("list");
    expect(leadsView("grid")).toBe("list");
  });

  it("uses board only for the board value", () => {
    expect(leadsView("board")).toBe("board");
  });
});

describe("filterDeals", () => {
  const rows = [
    deal({
      id: "a",
      stage: "new",
      organization_name: "Northwind",
      title: "Site",
      owner_user_id: "ada",
      next_step: "Call Friday",
      contact: "Grace Hopper",
    }),
    deal({
      id: "b",
      stage: "proposal",
      organization_name: "Acme",
      title: "Brand",
      owner_user_id: "bev",
      next_step: null,
      contact: "Alan",
    }),
  ];

  it("keeps every deal when the filters are blank", () => {
    expect(filterDeals(rows, {}).map((row) => row.id)).toEqual(["a", "b"]);
    expect(filterDeals(rows, { stage: "", owner: "  ", q: "  " }).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("applies stage, owner, and search together", () => {
    expect(filterDeals(rows, { stage: "proposal" }).map((row) => row.id)).toEqual(["b"]);
    expect(filterDeals(rows, { owner: "ada" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterDeals(rows, { q: "grace" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterDeals(rows, { q: "brand" }).map((row) => row.id)).toEqual(["b"]);
    expect(filterDeals(rows, { q: "friday" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterDeals(rows, { stage: "new", owner: "bev", q: "north" })).toEqual([]);
    expect(filterDeals(rows, { stage: "new", owner: "ada", q: "north" }).map((row) => row.id)).toEqual(["a"]);
  });

  it("ignores a stage that is not on the board", () => {
    expect(filterDeals(rows, { stage: "nope" }).map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("leadsHref", () => {
  it("omits the view when the page is the list", () => {
    expect(leadsHref({})).toBe("/leads");
    expect(leadsHref({ view: "list", stage: "", owner: "", q: "" })).toBe("/leads");
  });

  it("keeps board, filters, and sort", () => {
    expect(leadsHref({ view: "board", stage: "new", owner: "ada", q: "north", sort: "-score" })).toBe(
      "/leads?view=board&stage=new&owner=ada&q=north&sort=-score",
    );
  });
});

describe("ownerInitials", () => {
  it("uses the name in the email", () => {
    expect(ownerInitials("ada.lovelace@example.com")).toBe("AL");
    expect(ownerInitials("bev@example.com")).toBe("B");
  });

  it("stays blank when there is no owner", () => {
    expect(ownerInitials(null)).toBe("");
    expect(ownerInitials("  ")).toBe("");
  });
});
