import { describe, expect, it } from "vitest";
import { swarmRunReady } from "./swarm-ready";

const skills = JSON.stringify({
  templateId: "pack-community-marketingskills",
  steps: [{ path: ".cursor/skills/community/marketingskills/ad-creative/SKILL.md", status: "todo" }],
});

describe("swarmRunReady", () => {
  it("is ready only when the card is open, has a pack, and nothing is running", () => {
    expect(swarmRunReady({ status: "todo", stage: "describe", skillsJson: skills, running: false })).toEqual({
      ready: true,
      templateId: "pack-community-marketingskills",
    });
    expect(swarmRunReady({ status: "todo", stage: "describe", skillsJson: skills, running: true }).ready).toBe(false);
    expect(swarmRunReady({ status: "todo", stage: "run", skillsJson: skills, running: false }).ready).toBe(false);
    expect(swarmRunReady({ status: "done", stage: "run", skillsJson: skills, running: true })).toEqual({
      ready: false,
      templateId: null,
    });
    expect(swarmRunReady({ status: "todo", stage: "describe", skillsJson: null, running: false })).toEqual({
      ready: false,
      templateId: null,
    });
  });
});
