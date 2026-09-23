import { describe, expect, it } from "vitest";
import {
  isLocalBusinessFamily,
  isOnlineBusinessFamily,
  isOrganizationType,
  listOrganizationTypes,
} from "@/lib/schema-org/organization-types";

describe("organization-types catalog", () => {
  it("includes Organization tree leaves and mid types", () => {
    const names = new Set(listOrganizationTypes().map((t) => t.name));
    expect(names.has("Organization")).toBe(true);
    expect(names.has("LocalBusiness")).toBe(true);
    expect(names.has("Physician")).toBe(true);
    expect(names.has("Restaurant")).toBe(true);
    expect(names.has("OnlineStore")).toBe(true);
    expect(names.has("NGO")).toBe(true);
    expect(names.size).toBeGreaterThan(100);
  });

  it("classifies LocalBusiness family vs OnlineBusiness", () => {
    expect(isOrganizationType("Physician")).toBe(true);
    expect(isLocalBusinessFamily("Physician")).toBe(true);
    expect(isLocalBusinessFamily("Restaurant")).toBe(true);
    expect(isLocalBusinessFamily("Organization")).toBe(false);
    expect(isOnlineBusinessFamily("OnlineStore")).toBe(true);
    expect(isOnlineBusinessFamily("Restaurant")).toBe(false);
  });
});
