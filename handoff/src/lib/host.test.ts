import { describe, expect, it } from "vitest";
import { adminPathForSpaces, decideHost } from "./host";

const HQ = "hq.abra-ca-dabra.app";
const ORIGIN = "https://hq.abra-ca-dabra.app";

function decide(host: string, path: string) {
  return decideHost({ host, path, hqHost: HQ, hqOrigin: ORIGIN });
}

describe("decideHost", () => {
  it("hides staff pages on the client host", () => {
    expect(decide("handoff.abracadabra-ai.workers.dev", "/clients")).toEqual({ kind: "not-found" });
    expect(decide("abra-ca-dabra.app", "/clients/abc")).toEqual({ kind: "not-found" });
    expect(decide("localhost:3000", "/spaces")).toEqual({ kind: "not-found" });
    expect(decide("handoff.example", "/leads")).toEqual({ kind: "not-found" });
    expect(decide("handoff.example", "/api/admin/held/file-1")).toEqual({ kind: "not-found" });
  });

  it("hides client folders on the staff host", () => {
    expect(decide(HQ, "/w/strongfoam")).toEqual({ kind: "not-found" });
    expect(decide("hq.localhost:3000", "/share/token")).toEqual({ kind: "not-found" });
    expect(decide(HQ, "/invites/11111111-1111-1111-1111-111111111111")).toEqual({ kind: "not-found" });
  });

  it("sends old staff links to the spaces page on hq", () => {
    expect(decide("handoff.example", "/admin")).toEqual({
      kind: "redirect",
      location: `${ORIGIN}/spaces`,
    });
    expect(decide("handoff.example", "/admin/staff")).toEqual({
      kind: "redirect",
      location: `${ORIGIN}/spaces/staff`,
    });
    expect(decide(HQ, "/admin/workspaces/new")).toEqual({
      kind: "redirect",
      location: `${ORIGIN}/spaces/new`,
    });
  });

  it("lets staff open the client list on hq and clients open folders on the other host", () => {
    expect(decide(HQ, "/clients")).toEqual({ kind: "allow" });
    expect(decide("hq.localhost", "/")).toEqual({ kind: "allow" });
    expect(decide("handoff.example", "/w/strongfoam")).toEqual({ kind: "allow" });
    expect(decide("handoff.example", "/login")).toEqual({ kind: "allow" });
    expect(decide(HQ, "/api/health")).toEqual({ kind: "allow" });
    expect(decide(HQ, "/api/admin/held/file-1")).toEqual({ kind: "allow" });
  });
});

describe("adminPathForSpaces", () => {
  it("maps the spaces url back to the existing admin page", () => {
    expect(adminPathForSpaces("/spaces")).toBe("/admin");
    expect(adminPathForSpaces("/spaces/new")).toBe("/admin/workspaces/new");
    expect(adminPathForSpaces("/spaces/staff")).toBe("/admin/staff");
    expect(adminPathForSpaces("/clients")).toBeNull();
  });
});
