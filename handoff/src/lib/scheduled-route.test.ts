import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { routeScheduled } from "./scheduled-route";

function recorder() {
  const ran: string[] = [];
  return {
    ran,
    jobs: {
      searchSync: async () => void ran.push("search"),
      regular: async () => void ran.push("regular"),
    },
  };
}

describe("routeScheduled", () => {
  it("runs only the search enqueue on the daily search cron, never the regular jobs (agent wakes)", async () => {
    const { ran, jobs } = recorder();
    expect(await routeScheduled("30 8 * * *", jobs)).toBe("search_sync");
    expect(ran).toEqual(["search"]);
  });

  it("runs only the regular jobs on every other cron", async () => {
    for (const cron of ["* * * * *", "0 * * * *"]) {
      const { ran, jobs } = recorder();
      expect(await routeScheduled(cron, jobs)).toBe("regular");
      expect(ran).toEqual(["regular"]);
    }
  });

  it("is what the handoff Worker's scheduled() uses, and agent wakes live only in the regular branch", () => {
    const source = readFileSync(path.join(process.cwd(), "cloudflare-worker.ts"), "utf8");
    expect(source).toContain("routeScheduled(event.cron");
    const regular = source.slice(source.indexOf("async function regularScheduled"));
    expect(regular).toContain("wakeDueAgents(");
    expect(source.split("wakeDueAgents(").length - 1).toBe(1);
  });
});
