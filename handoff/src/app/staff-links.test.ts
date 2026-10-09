import { describe, expect, it } from "vitest";

import { NAV_ICON_HREFS } from "./staff-nav";
import { STUDIO_NAV, STUDIO_NAV_GROUPS, SWARM_ORIGIN } from "./staff-links";

describe("studio menu", () => {
  it("groups the menu in order", () => {
    expect(STUDIO_NAV_GROUPS.map((group) => group.label)).toEqual([
      "Pulse",
      "Pipeline",
      "Delivery",
      "Records",
      "Automation",
      "System",
    ]);
  });

  it("puts work then projects in Delivery, and GitHub in System", () => {
    const delivery = STUDIO_NAV_GROUPS.find((group) => group.label === "Delivery");
    expect(delivery?.items.map((item) => item.href)).toEqual(["/work", "/projects"]);
    const system = STUDIO_NAV_GROUPS.find((group) => group.label === "System");
    expect(system?.items.map((item) => item.href)).toEqual(["/settings/github", "/mcp"]);
  });

  it("flattens groups into a unique menu", () => {
    expect([...STUDIO_NAV]).toEqual(STUDIO_NAV_GROUPS.flatMap((group) => [...group.items]));
    const hrefs = STUDIO_NAV.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives every menu href an icon", () => {
    for (const item of STUDIO_NAV) {
      expect(NAV_ICON_HREFS).toContain(item.href);
    }
  });

  it("keeps the swarm origin", () => {
    expect(STUDIO_NAV.find((link) => link.label === "Swarm")?.href).toBe("/swarm");
    expect(SWARM_ORIGIN).toBe("https://agent-swarm-orchestrator.abracadabra-ai.workers.dev");
  });
});
