import { describe, expect, it } from "vitest";
import { hqSwarmHref, swarmRunHref } from "./swarm-link";

describe("swarm links", () => {
  it("builds the canvas url and skips a run with no execution", () => {
    expect(swarmRunHref("https://swarm.example/", "ex-1")).toBe("https://swarm.example/?executionId=ex-1");
    expect(swarmRunHref("https://swarm.example", "")).toBeNull();
  });

  it("builds the staff swarm path and falls back when there is no execution", () => {
    expect(hqSwarmHref("ex-1")).toBe("/swarm?executionId=ex-1");
    expect(hqSwarmHref(null)).toBe("/swarm");
  });
});
