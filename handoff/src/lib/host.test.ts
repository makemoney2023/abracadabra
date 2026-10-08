import { describe, expect, it } from "vitest";
import { adminPathForSpaces, clientSpaceHref, decideHost, hqOriginForHost, isHqHost } from "./host";

const STAFF_DEV = "handoff-hq.abracadabra-ai.workers.dev";

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
    expect(decide("handoff.example", "/schema")).toEqual({ kind: "not-found" });
    expect(decide("handoff.example", "/api/admin/held/file-1")).toEqual({ kind: "not-found" });
    expect(decide("handoff.example", "/api/github/webhook")).toEqual({ kind: "not-found" });
    expect(decide("handoff.example", "/settings/github")).toEqual({ kind: "not-found" });
    expect(decide("handoff.example", "/chat")).toEqual({ kind: "not-found" });
    expect(decide("handoff.example", "/swarm")).toEqual({ kind: "not-found" });
  });

  it("hides share and invite pages on the staff host", () => {
    expect(decide("hq.localhost:3000", "/share/token")).toEqual({ kind: "not-found" });
    expect(decide(HQ, "/invites/11111111-1111-1111-1111-111111111111")).toEqual({ kind: "not-found" });
    expect(decide(HQ, "/how-handoff-handles-files")).toEqual({ kind: "not-found" });
  });

  it("lets staff open a space on the staff host", () => {
    expect(decide(HQ, "/w/rewnewimplants")).toEqual({ kind: "allow" });
    expect(decideHost({ host: STAFF_DEV, path: "/w/rewnewimplants", hqHost: HQ, hqOrigin: ORIGIN })).toEqual({
      kind: "allow",
    });
    expect(clientSpaceHref("rewnewimplants")).toBe("/w/rewnewimplants");
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

  it("treats the staff dev host as hq until the domain moves", () => {
    expect(isHqHost(STAFF_DEV, HQ)).toBe(true);
    expect(isHqHost("handoff.abracadabra-ai.workers.dev", HQ)).toBe(false);
    expect(hqOriginForHost(STAFF_DEV)).toBe(`https://${STAFF_DEV}`);
    expect(decideHost({ host: STAFF_DEV, path: "/clients", hqHost: HQ, hqOrigin: ORIGIN })).toEqual({
      kind: "allow",
    });
    expect(decideHost({ host: STAFF_DEV, path: "/w/strongfoam", hqHost: HQ, hqOrigin: ORIGIN })).toEqual({
      kind: "allow",
    });
    expect(
      decideHost({
        host: STAFF_DEV,
        path: "/admin",
        hqHost: HQ,
        hqOrigin: hqOriginForHost(STAFF_DEV),
      }),
    ).toEqual({ kind: "redirect", location: `https://${STAFF_DEV}/spaces` });
  });

  it("lets staff open the client list on hq and clients open folders on the other host", () => {
    expect(decide(HQ, "/clients")).toEqual({ kind: "allow" });
    expect(decide(HQ, "/schema")).toEqual({ kind: "allow" });
    expect(decide(HQ, "/chat")).toEqual({ kind: "allow" });
    expect(decide(HQ, "/swarm")).toEqual({ kind: "allow" });
    expect(decide("hq.localhost", "/")).toEqual({ kind: "allow" });
    expect(decide("handoff.example", "/w/strongfoam")).toEqual({ kind: "allow" });
    expect(decide("handoff.example", "/login")).toEqual({ kind: "allow" });
    expect(decide(HQ, "/api/health")).toEqual({ kind: "allow" });
    expect(decide(HQ, "/api/admin/held/file-1")).toEqual({ kind: "allow" });
    expect(decide(HQ, "/api/github/webhook")).toEqual({ kind: "allow" });
    expect(decide(HQ, "/settings/github")).toEqual({ kind: "allow" });
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
