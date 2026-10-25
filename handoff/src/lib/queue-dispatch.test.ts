import { describe, expect, it } from "vitest";
import type { D1Like } from "@/db/sql";
import { dispatchQueue } from "./queue-dispatch";

const db = {} as D1Like;

describe("dispatchQueue", () => {
  it("sends github-events to the github handler", async () => {
    const seen: unknown[] = [];
    await dispatchQueue(
      {
        queue: "github-events",
        messages: [{ body: { source: "github", deliveryId: "d1" }, ack() {}, retry() {} }],
      },
      { DB: db },
      {
        github: async (messages) => {
          seen.push(messages[0]?.body);
        },
        lead: async () => {
          throw new Error("lead handler should not run");
        },
      },
    );
    expect(seen).toEqual([{ source: "github", deliveryId: "d1" }]);
  });

  it("sends every other queue to the lead handler", async () => {
    const seen: string[] = [];
    await dispatchQueue(
      {
        queue: "lead-intake",
        messages: [{ body: { source: "assessment" }, ack() {}, retry() {} }],
      },
      { DB: db },
      {
        github: async () => {
          throw new Error("github handler should not run");
        },
        lead: async (messages) => {
          seen.push(String((messages[0]?.body as { source?: string }).source));
        },
      },
    );
    expect(seen).toEqual(["assessment"]);
  });

  it("sends search-sync to the search handler and never to lead intake", async () => {
    const seen: unknown[] = [];
    await dispatchQueue(
      {
        queue: "search-sync",
        messages: [{ body: { v: 1, kind: "plan", propertyId: "p1", mode: "daily" }, ack() {}, retry() {} }],
      },
      { DB: db },
      {
        search: async (messages) => {
          seen.push(messages[0]?.body);
        },
        github: async () => {
          throw new Error("github handler should not run");
        },
        lead: async () => {
          throw new Error("lead handler should not run");
        },
      },
    );
    expect(seen).toEqual([{ v: 1, kind: "plan", propertyId: "p1", mode: "daily" }]);
  });

  it("keeps a search-sync message away from lead intake even with no search handler injected (fails closed: acked)", async () => {
    const outcomes: string[] = [];
    await dispatchQueue(
      {
        queue: "search-sync",
        messages: [{ body: { v: 1, kind: "plan", propertyId: "p1", mode: "daily" }, ack: () => outcomes.push("ack"), retry: () => outcomes.push("retry") }],
      },
      { DB: db },
      {
        lead: async () => {
          throw new Error("lead handler should not run");
        },
      },
    );
    // SEARCH_CONSOLE is off in this env, so the real consumer acknowledges without calling Google.
    expect(outcomes).toEqual(["ack"]);
  });
});
