import { describe, expect, it } from "vitest";
import { clientRows, type ClientOrg, type ClientPlan, type ClientWorkItem } from "./client-rows";

const orgs: ClientOrg[] = [
  { id: "ada", name: "Ada Studio", kind: "client" },
  { id: "beta", name: "Beta Goods", kind: "lead" },
  { id: "quiet", name: "Quiet Co", kind: "partner" },
];

const work: ClientWorkItem[] = [
  { organizationId: "ada", status: "todo", title: "Send the deck", dueAt: 20, owner: "ada@studio.test" },
  { organizationId: "ada", status: "doing", title: "Review the site", dueAt: 10, owner: null },
  { organizationId: "ada", status: "done", title: "Old task", dueAt: 1, owner: "done@studio.test" },
  { organizationId: "beta", status: "blocked", title: "Wait on a logo", dueAt: null, owner: "bea@studio.test" },
];

const plans: ClientPlan[] = [
  {
    organizationId: "ada",
    health: "at_risk",
    owner: "owen@studio.test",
    nextStep: "Book the call",
    lastActivity: 100,
  },
  {
    organizationId: "ada",
    health: "on_track",
    owner: "older@studio.test",
    nextStep: "Older step",
    lastActivity: 50,
  },
  { organizationId: "beta", health: null, owner: null, nextStep: null, lastActivity: 80 },
];

describe("clientRows", () => {
  it("joins kind, health, owner, open work, the plan's next step, and last activity", () => {
    const rows = clientRows(orgs, work, plans);
    const ada = rows.find((row) => row.id === "ada");
    const beta = rows.find((row) => row.id === "beta");
    const quiet = rows.find((row) => row.id === "quiet");
    expect(ada).toMatchObject({
      kind: "client",
      health: "at_risk",
      owner: "owen@studio.test",
      openWork: 2,
      nextStep: "Book the call",
      lastActivity: 100,
    });
    expect(beta).toMatchObject({
      kind: "lead",
      health: null,
      owner: "bea@studio.test",
      openWork: 1,
      nextStep: "Wait on a logo",
      lastActivity: 80,
    });
    expect(quiet).toMatchObject({
      health: null,
      owner: "",
      openWork: 0,
      nextStep: "",
      lastActivity: null,
    });
  });

  it("filters names without caring about case", () => {
    expect(clientRows(orgs, work, plans, { q: "  ADA " }).map((row) => row.id)).toEqual(["ada"]);
    expect(clientRows(orgs, work, plans, { q: "" })).toHaveLength(3);
  });

  it("puts the busiest client first", () => {
    expect(clientRows(orgs, work, plans).map((row) => row.id)).toEqual(["ada", "beta", "quiet"]);
  });
});
