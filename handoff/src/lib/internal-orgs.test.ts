import { describe, expect, it } from "vitest";
import { isVendorDomain, looksInternal } from "./internal-orgs";

describe("looksInternal", () => {
  it("flags the test and internal names used by the E2E and pipeline tests", () => {
    for (const name of [
      "TEST E2E (a) low schema - DO NOT CONTACT",
      "TEST E2E PiRX - internal, do not send",
      "E2E Test (delete me)",
      "E2E Test 2 (delete me)",
      "Abracadabra internal test",
      "HQ pipeline test (Abracadabra internal test)",
    ]) {
      expect(looksInternal(name, null)).toBe(true);
    }
  });

  it("leaves real clients alone", () => {
    for (const name of ["Strong Foam Insulation Inc.", "Renew Implants", "LioCorr Holdings Inc.", "Testa Roofing", "Contest Labs"]) {
      expect(looksInternal(name, "example.com")).toBe(false);
    }
  });

  it("flags vendor mailers by domain", () => {
    expect(looksInternal("MuAPI Support", "muapi.ai")).toBe(true);
    expect(looksInternal("Cursor Team", "mail.cursor.com")).toBe(true);
  });
});

describe("isVendorDomain", () => {
  it("matches known vendors and bulk-mail subdomains", () => {
    expect(isVendorDomain("muapi.ai")).toBe(true);
    expect(isVendorDomain("mail.cursor.com")).toBe(true);
    expect(isVendorDomain("news.example.com")).toBe(true);
    expect(isVendorDomain("https://email.vendor.io/x")).toBe(true);
    expect(isVendorDomain("strongfoam.com")).toBe(false);
    expect(isVendorDomain(null)).toBe(false);
  });
});
