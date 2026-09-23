import { describe, expect, it } from "vitest";
import { detectBusinessType } from "@/lib/facts/detect-business-type";
import { emptyPageFacts } from "@/lib/facts/types";

describe("detectBusinessType", () => {
  it("prefers OnlineStore from existing types", () => {
    expect(
      detectBusinessType({
        ...emptyPageFacts(),
        existingTypes: ["OnlineStore", "WebSite"],
      }),
    ).toBe("OnlineStore");
  });

  it("detects LocalBusiness from address", () => {
    expect(
      detectBusinessType({
        ...emptyPageFacts(),
        address: { addressLocality: "Boston", addressCountry: "US" },
      }),
    ).toBe("LocalBusiness");
  });

  it("detects Physician / MedicalBusiness from copy", () => {
    expect(
      detectBusinessType({
        ...emptyPageFacts(),
        description: "Family physician clinic in town",
      }),
    ).toBe("Physician");
    expect(
      detectBusinessType({
        ...emptyPageFacts(),
        description: "Chiropractic care for the whole family",
      }),
    ).toBe("MedicalBusiness");
  });

  it("detects Restaurant from copy", () => {
    expect(
      detectBusinessType({
        ...emptyPageFacts(),
        businessName: "Joe's Restaurant",
        description: "Best restaurant downtown",
      }),
    ).toBe("Restaurant");
  });

  it("falls back to Organization", () => {
    expect(detectBusinessType(emptyPageFacts())).toBe("Organization");
  });

  it("detects board of trade / chamber of commerce as Organization", () => {
    expect(
      detectBusinessType({
        ...emptyPageFacts(),
        businessName: "Toronto Region Board of Trade",
        description: "Chamber of commerce for Canada’s largest regional economy",
      }),
    ).toBe("Organization");
    expect(
      detectBusinessType(
        {
          ...emptyPageFacts(),
          address: { streetAddress: "100 Queens Quay East", addressLocality: "Toronto" },
        },
        { markdown: "Join the Toronto Region Board of Trade to network with industry leaders" },
      ),
    ).toBe("Organization");
  });

  it("does not force LocalBusiness for a board of trade that has an address", () => {
    expect(
      detectBusinessType({
        ...emptyPageFacts(),
        businessName: "Metro Board of Trade",
        address: { addressLocality: "Toronto", addressCountry: "CA" },
      }),
    ).toBe("Organization");
  });
});
