import { describe, expect, it } from "vitest";
import { CHECK_NAV, checkNavIsActive } from "@/lib/check-nav";

describe("CHECK_NAV", () => {
  it("lists the readiness check and a public prospect item", () => {
    expect(CHECK_NAV).toEqual([
      { href: "/check", label: "Readiness Check" },
      { href: "/check/prospect", label: "Prospect" },
    ]);
  });

  it("marks only prospect as current on the prospect page", () => {
    expect(checkNavIsActive("/check/prospect", "/check")).toBe(false);
    expect(checkNavIsActive("/check/prospect", "/check/prospect")).toBe(true);
    expect(checkNavIsActive("/check", "/check")).toBe(true);
  });
});
