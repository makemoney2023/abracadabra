import { describe, expect, it } from "vitest";
import { STUDIO_NAV, SWARM_ORIGIN } from "./staff-links";

describe("studio menu", () => {
  it("lists Swarm between Chat and Spaces", () => {
    const labels = STUDIO_NAV.map((link) => link.label);
    expect(labels).toContain("Swarm");
    expect(STUDIO_NAV.find((link) => link.label === "Swarm")?.href).toBe("/swarm");
    const swarm = labels.indexOf("Swarm");
    expect(labels[swarm - 1]).toBe("Chat");
    expect(labels[swarm + 1]).toBe("Spaces");
    expect(SWARM_ORIGIN).toBe("https://agent-swarm-orchestrator.abracadabra-ai.workers.dev");
  });
});
